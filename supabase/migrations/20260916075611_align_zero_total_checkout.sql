begin;

-- Production still had the paid-only checkout definition. Align it with the
-- already verified DEV definition so free and zero-price products can create
-- an auditable order before finalize_zero_total_order is called.
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
set search_path=''
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
  if nullif(trim(p_customer_name),'') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if nullif(trim(p_customer_email),'') is null then raise exception 'CUSTOMER_EMAIL_REQUIRED'; end if;

  perform 1 from public.profiles where id=p_user_id and status='active';
  if not found then raise exception 'USER_NOT_ACTIVE'; end if;

  select * into v_cohort from public.cohorts where id=p_cohort_id for update;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;
  select * into v_course from public.courses where id=v_cohort.course_id;
  if not found or v_course.status<>'published' then raise exception 'COURSE_NOT_AVAILABLE'; end if;
  if not (
    v_cohort.status='recruiting'
    or (
      v_cohort.status='upcoming'
      and v_cohort.recruitment_end_at is not null
      and (v_cohort.recruitment_start_at is null or v_cohort.recruitment_start_at<=now())
      and v_cohort.recruitment_end_at>now()
    )
  ) then raise exception 'COHORT_NOT_RECRUITING'; end if;
  if v_cohort.price<0 then raise exception 'INVALID_SALE_PRICE'; end if;
  if v_cohort.recruitment_start_at is not null and v_cohort.recruitment_start_at>now() then raise exception 'RECRUITMENT_NOT_STARTED'; end if;
  if v_cohort.recruitment_end_at is not null and v_cohort.recruitment_end_at<=now() then raise exception 'RECRUITMENT_CLOSED'; end if;
  if v_cohort.operation_end_at is not null and v_cohort.operation_end_at<=now() then raise exception 'COHORT_OPERATION_ENDED'; end if;

  if exists(
    select 1 from public.enrollments
    where user_id=p_user_id and cohort_id=p_cohort_id and status='active'
  ) then raise exception 'ALREADY_ENROLLED'; end if;

  update public.orders checkout_order
  set status='payment_failed'
  where checkout_order.user_id=p_user_id
    and checkout_order.status='pending'
    and checkout_order.expires_at<=now()
    and exists(
      select 1 from public.order_items item
      where item.order_id=checkout_order.id and item.cohort_id=p_cohort_id
    );

  select checkout_order.id,checkout_order.order_number,item.id
  into v_order_id,v_order_number,v_item_id
  from public.orders checkout_order
  join public.order_items item on item.order_id=checkout_order.id
  where checkout_order.user_id=p_user_id
    and item.cohort_id=p_cohort_id
    and checkout_order.status='pending'
    and checkout_order.expires_at>now()
  order by checkout_order.created_at desc
  limit 1
  for update of checkout_order;

  if found then
    if exists(
      select 1 from public.payments
      where order_id=v_order_id and status='in_progress'
    ) then raise exception 'PAYMENT_ALREADY_PENDING'; end if;

    update public.orders set
      customer_name=trim(p_customer_name),
      customer_email=lower(trim(p_customer_email)),
      customer_phone=nullif(trim(p_customer_phone),''),
      terms_version=p_terms_version,
      privacy_version=p_privacy_version,
      refund_policy_version=p_refund_policy_version
    where id=v_order_id;

    return jsonb_build_object(
      'orderId',v_order_id,
      'orderNumber',v_order_number,
      'orderItemId',v_item_id,
      'courseId',v_course.id,
      'courseSlug',v_course.slug,
      'courseTitle',v_course.title,
      'cohortId',v_cohort.id,
      'cohortName',v_cohort.name,
      'subtotal',v_course.list_price,
      'discountAmount',greatest(v_course.list_price-v_cohort.price,0),
      'totalAmount',v_cohort.price
    );
  end if;

  if v_cohort.capacity is not null then
    select count(*) into v_enrolled_count from (
      select enrollment.user_id
      from public.enrollments enrollment
      where enrollment.cohort_id=p_cohort_id and enrollment.status='active'
      union all
      select checkout_order.user_id
      from public.order_items item
      join public.orders checkout_order on checkout_order.id=item.order_id
      where item.cohort_id=p_cohort_id
        and checkout_order.status='pending'
        and checkout_order.expires_at>now()
    ) reserved_seats;
    if v_enrolled_count>=v_cohort.capacity then raise exception 'COHORT_CAPACITY_EXCEEDED'; end if;
  end if;

  v_order_id:=gen_random_uuid();
  v_order_number:='BAE-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.orders(
    id,order_number,user_id,status,subtotal,discount_amount,total_amount,
    customer_name,customer_email,customer_phone,expires_at,
    terms_version,privacy_version,refund_policy_version
  ) values(
    v_order_id,v_order_number,p_user_id,'pending',v_course.list_price,
    greatest(v_course.list_price-v_cohort.price,0),v_cohort.price,
    trim(p_customer_name),lower(trim(p_customer_email)),nullif(trim(p_customer_phone),''),now()+interval '30 minutes',
    p_terms_version,p_privacy_version,p_refund_policy_version
  );

  insert into public.order_items(order_id,course_id,cohort_id,item_name,unit_price)
  values(v_order_id,v_course.id,v_cohort.id,v_course.title||' · '||v_cohort.name,v_cohort.price)
  returning id into v_item_id;

  return jsonb_build_object(
    'orderId',v_order_id,
    'orderNumber',v_order_number,
    'orderItemId',v_item_id,
    'courseId',v_course.id,
    'courseSlug',v_course.slug,
    'courseTitle',v_course.title,
    'cohortId',v_cohort.id,
    'cohortName',v_cohort.name,
    'subtotal',v_course.list_price,
    'discountAmount',greatest(v_course.list_price-v_cohort.price,0),
    'totalAmount',v_cohort.price
  );
end;
$$;

revoke execute on function public.create_checkout_order(uuid,uuid,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_checkout_order(uuid,uuid,text,text,text,text,text,text)
  to service_role;

commit;
