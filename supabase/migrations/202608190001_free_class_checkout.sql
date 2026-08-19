begin;

-- 공개된 무료 클래스도 유료 클래스와 같은 주문 이력을 남긴 뒤 즉시 수강권을 발급한다.
-- '예정' 기수라도 명시한 모집 기간이 이미 시작된 경우에는 날짜를 최종 기준으로 사용한다.
create or replace function public.create_checkout_order(
  p_user_id uuid,
  p_cohort_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_terms_version text,
  p_privacy_version text,
  p_refund_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort public.cohorts%rowtype;
  v_course public.courses%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_enrolled_count integer;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(p_customer_name), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if nullif(trim(p_customer_email), '') is null then raise exception 'CUSTOMER_EMAIL_REQUIRED'; end if;

  perform 1 from public.profiles where id = p_user_id and status = 'active';
  if not found then raise exception 'USER_NOT_ACTIVE'; end if;

  select * into v_cohort from public.cohorts where id = p_cohort_id for update;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;
  select * into v_course from public.courses where id = v_cohort.course_id;
  if not found or v_course.status <> 'published' then raise exception 'COURSE_NOT_AVAILABLE'; end if;
  if not (
    v_cohort.status = 'recruiting'
    or (
      v_cohort.status = 'upcoming'
      and v_cohort.recruitment_end_at is not null
      and (v_cohort.recruitment_start_at is null or v_cohort.recruitment_start_at <= now())
      and v_cohort.recruitment_end_at > now()
    )
  ) then raise exception 'COHORT_NOT_RECRUITING'; end if;
  if v_cohort.price < 0 then raise exception 'INVALID_SALE_PRICE'; end if;
  if v_cohort.recruitment_start_at is not null and v_cohort.recruitment_start_at > now() then raise exception 'RECRUITMENT_NOT_STARTED'; end if;
  if v_cohort.recruitment_end_at is not null and v_cohort.recruitment_end_at <= now() then raise exception 'RECRUITMENT_CLOSED'; end if;
  if v_cohort.operation_end_at is not null and v_cohort.operation_end_at <= now() then raise exception 'COHORT_OPERATION_ENDED'; end if;

  if exists (
    select 1 from public.enrollments
    where user_id = p_user_id and cohort_id = p_cohort_id and status = 'active'
  ) then raise exception 'ALREADY_ENROLLED'; end if;

  update public.orders o
  set status = 'payment_failed'
  where o.user_id = p_user_id
    and o.status = 'pending'
    and o.expires_at <= now()
    and exists (
      select 1 from public.order_items oi
      where oi.order_id = o.id and oi.cohort_id = p_cohort_id
    );

  select o.id, o.order_number, oi.id
  into v_order_id, v_order_number, v_item_id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.user_id = p_user_id
    and oi.cohort_id = p_cohort_id
    and o.status = 'pending'
    and o.expires_at > now()
  order by o.created_at desc
  limit 1
  for update of o;

  if found then
    if exists (
      select 1 from public.payments
      where order_id = v_order_id and status = 'in_progress'
    ) then raise exception 'PAYMENT_ALREADY_PENDING'; end if;

    update public.orders set
      customer_name = trim(p_customer_name),
      customer_email = lower(trim(p_customer_email)),
      customer_phone = nullif(trim(p_customer_phone), ''),
      terms_version = p_terms_version,
      privacy_version = p_privacy_version,
      refund_policy_version = p_refund_policy_version
    where id = v_order_id;

    return jsonb_build_object(
      'orderId', v_order_id,
      'orderNumber', v_order_number,
      'orderItemId', v_item_id,
      'courseId', v_course.id,
      'courseSlug', v_course.slug,
      'courseTitle', v_course.title,
      'cohortId', v_cohort.id,
      'cohortName', v_cohort.name,
      'subtotal', v_course.list_price,
      'discountAmount', greatest(v_course.list_price - v_cohort.price, 0),
      'totalAmount', v_cohort.price
    );
  end if;

  if v_cohort.capacity is not null then
    select count(*) into v_enrolled_count from (
      select e.user_id
      from public.enrollments e
      where e.cohort_id = p_cohort_id and e.status = 'active'
      union all
      select o.user_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.cohort_id = p_cohort_id
        and o.status = 'pending'
        and o.expires_at > now()
    ) reserved_seats;
    if v_enrolled_count >= v_cohort.capacity then raise exception 'COHORT_CAPACITY_EXCEEDED'; end if;
  end if;

  v_order_id := gen_random_uuid();
  v_order_number := 'BAE-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    id, order_number, user_id, status, subtotal, discount_amount, total_amount,
    customer_name, customer_email, customer_phone, expires_at,
    terms_version, privacy_version, refund_policy_version
  ) values (
    v_order_id, v_order_number, p_user_id, 'pending', v_course.list_price,
    greatest(v_course.list_price - v_cohort.price, 0), v_cohort.price,
    trim(p_customer_name), lower(trim(p_customer_email)), nullif(trim(p_customer_phone), ''), now() + interval '30 minutes',
    p_terms_version, p_privacy_version, p_refund_policy_version
  );

  insert into public.order_items (order_id, course_id, cohort_id, item_name, unit_price)
  values (v_order_id, v_course.id, v_cohort.id, v_course.title || ' · ' || v_cohort.name, v_cohort.price)
  returning id into v_item_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'orderItemId', v_item_id,
    'courseId', v_course.id,
    'courseSlug', v_course.slug,
    'courseTitle', v_course.title,
    'cohortId', v_cohort.id,
    'cohortName', v_cohort.name,
    'subtotal', v_course.list_price,
    'discountAmount', greatest(v_course.list_price - v_cohort.price, 0),
    'totalAmount', v_cohort.price
  );
end;
$$;

create or replace function public.finalize_zero_total_order(p_order_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_cohort public.cohorts%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = p_user_id for update;
  if not found or v_order.status <> 'pending' or v_order.total_amount <> 0 then raise exception 'ORDER_NOT_FREE'; end if;
  select * into v_item from public.order_items where order_id = v_order.id order by created_at limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  select * into v_cohort from public.cohorts where id = v_item.cohort_id;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;

  update public.orders set status = 'paid', paid_at = now(), expires_at = null where id = v_order.id;
  update public.coupon_redemptions set status = 'used', used_at = now() where order_id = v_order.id and status = 'reserved';
  insert into public.enrollments(user_id,course_id,cohort_id,order_item_id,status,access_starts_at,access_ends_at)
    values(v_order.user_id,v_item.course_id,v_item.cohort_id,v_item.id,'active',now(),v_cohort.operation_end_at)
    on conflict(user_id,cohort_id) do update set order_item_id=excluded.order_item_id,status='active',access_starts_at=least(public.enrollments.access_starts_at,excluded.access_starts_at),access_ends_at=excluded.access_ends_at,revoked_at=null;
  insert into public.audit_logs(action,entity_type,entity_id,after_data)
    values('free_order.completed','order',v_order.id::text,jsonb_build_object('cohort_id',v_cohort.id));
  return v_order.order_number;
end;
$$;

revoke all on function public.finalize_zero_total_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.finalize_zero_total_order(uuid,uuid) to service_role;

commit;
