begin;

-- 한 주문은 하나의 토스 결제 건으로 운영한다. 승인·웹훅 재시도는 upsert로 멱등 처리한다.
create unique index if not exists payments_order_unique_idx on public.payments(order_id);
alter table public.orders add column if not exists expires_at timestamptz;

-- 운영자가 체험·보상 수강권을 발급할 수 있도록 주문 없는 수강권 출처를 기록한다.
alter table public.enrollments alter column order_item_id drop not null;
alter table public.enrollments add column if not exists source text not null default 'purchase'
  check (source in ('purchase', 'admin_grant'));
alter table public.enrollments add column if not exists granted_by uuid references public.profiles(id);

-- 주문 금액은 클라이언트가 아니라 DB의 판매 기수 가격으로 확정한다.
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
  if v_cohort.status <> 'recruiting' then raise exception 'COHORT_NOT_RECRUITING'; end if;
  if v_cohort.price <= 0 then raise exception 'INVALID_SALE_PRICE'; end if;
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

  -- 같은 회원이 결제창을 다시 열면 아직 유효한 주문을 재사용해 좌석을 중복 점유하지 않는다.
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

-- 회원가입 메타데이터로 전달된 휴대폰 번호도 프로필에 보존한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone);
  return new;
end;
$$;

-- 결제 승인과 수강권 발급을 하나의 트랜잭션으로 처리한다.
create or replace function public.finalize_toss_payment(
  p_order_number text,
  p_payment_key text,
  p_method text,
  p_approved_amount integer,
  p_receipt_url text,
  p_payload jsonb,
  p_approved_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_cohort public.cohorts%rowtype;
  v_enrollment_id uuid;
begin
  select * into v_order
  from public.orders
  where order_number = p_order_number
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.user_id is null then raise exception 'ORDER_USER_MISSING'; end if;
  if v_order.total_amount <> p_approved_amount then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  -- 로컬 만료·취소 직전에 PG 승인이 끝난 경합도 실제 PG 상태를 우선해 복구한다.
  -- 환불 완료 주문만 다시 활성화하지 않는다.
  if v_order.status = 'refunded' then raise exception 'ORDER_NOT_PAYABLE'; end if;

  select * into v_item
  from public.order_items
  where order_id = v_order.id
  order by created_at
  limit 1;

  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;

  select * into v_cohort from public.cohorts where id = v_item.cohort_id;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;

  insert into public.payments (
    order_id, provider, provider_payment_key, method, status,
    approved_amount, receipt_url, provider_payload, approved_at
  ) values (
    v_order.id, 'toss', p_payment_key, p_method, 'done',
    p_approved_amount, p_receipt_url, coalesce(p_payload, '{}'::jsonb), coalesce(p_approved_at, now())
  )
  on conflict (order_id) do update set
    provider_payment_key = excluded.provider_payment_key,
    method = excluded.method,
    status = 'done',
    approved_amount = excluded.approved_amount,
    receipt_url = excluded.receipt_url,
    provider_payload = excluded.provider_payload,
    approved_at = excluded.approved_at;

  update public.orders set
    status = 'paid',
    paid_at = coalesce(p_approved_at, now()),
    expires_at = null
  where id = v_order.id;

  insert into public.enrollments (
    user_id, course_id, cohort_id, order_item_id, status, access_starts_at, access_ends_at
  ) values (
    v_order.user_id, v_item.course_id, v_item.cohort_id, v_item.id, 'active', now(), v_cohort.operation_end_at
  )
  on conflict (user_id, cohort_id) do update set
    order_item_id = excluded.order_item_id,
    status = 'active',
    access_starts_at = least(public.enrollments.access_starts_at, excluded.access_starts_at),
    access_ends_at = excluded.access_ends_at,
    revoked_at = null
  returning id into v_enrollment_id;

  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values ('payment.approved', 'order', v_order.id::text, jsonb_build_object(
    'order_number', v_order.order_number,
    'payment_key', p_payment_key,
    'amount', p_approved_amount,
    'enrollment_id', v_enrollment_id
  ));

  return v_enrollment_id;
end;
$$;

-- 가상계좌 발급 직후에는 입금 완료 전까지 수강권을 발급하지 않는다.
create or replace function public.record_toss_waiting_payment(
  p_order_number text,
  p_payment_key text,
  p_method text,
  p_amount integer,
  p_receipt_url text,
  p_payload jsonb,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.total_amount <> p_amount then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if v_order.status <> 'pending' then return; end if;

  insert into public.payments (
    order_id, provider, provider_payment_key, method, status,
    approved_amount, receipt_url, provider_payload
  ) values (
    v_order.id, 'toss', p_payment_key, p_method, 'in_progress',
    0, p_receipt_url, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (order_id) do update set
    provider_payment_key = excluded.provider_payment_key,
    method = excluded.method,
    status = 'in_progress',
    receipt_url = excluded.receipt_url,
    provider_payload = excluded.provider_payload;

  update public.orders
  set expires_at = coalesce(p_expires_at, now() + interval '24 hours')
  where id = v_order.id;
end;
$$;

-- 승인되지 않은 결제의 만료·중단 상태를 주문과 함께 기록한다.
create or replace function public.record_toss_terminal_payment(
  p_order_number text,
  p_payment_key text,
  p_status text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment_status text;
begin
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'paid' then return; end if;

  v_payment_status := case
    when p_status = 'EXPIRED' then 'expired'
    when p_status = 'CANCELED' then 'cancelled'
    else 'aborted'
  end;

  insert into public.payments (
    order_id, provider, provider_payment_key, status, approved_amount, provider_payload
  ) values (
    v_order.id, 'toss', nullif(p_payment_key, ''), v_payment_status, 0, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (order_id) do update set
    provider_payment_key = coalesce(excluded.provider_payment_key, public.payments.provider_payment_key),
    status = excluded.status,
    provider_payload = excluded.provider_payload;

  update public.orders set
    status = case when p_status = 'CANCELED' then 'cancelled' else 'payment_failed' end,
    cancelled_at = case when p_status = 'CANCELED' then now() else cancelled_at end,
    expires_at = null
  where id = v_order.id;
end;
$$;

-- PG 취소 성공 후 주문과 수강권을 함께 회수한다.
create or replace function public.finalize_toss_refund(
  p_order_number text,
  p_amount integer,
  p_reason text,
  p_refund_key text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_item public.order_items%rowtype;
  v_total_cancelled integer;
begin
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_payment from public.payments where order_id = v_order.id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if exists (
    select 1 from public.refunds
    where payment_id = v_payment.id and provider_refund_key = p_refund_key
  ) then return; end if;
  if p_amount <= 0 or p_amount > (v_payment.approved_amount - v_payment.cancelled_amount) then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;

  v_total_cancelled := v_payment.cancelled_amount + p_amount;
  insert into public.refunds (payment_id, provider_refund_key, amount, reason, status, provider_payload, completed_at)
  values (v_payment.id, p_refund_key, p_amount, p_reason, 'done', coalesce(p_payload, '{}'::jsonb), now())
  on conflict (provider_refund_key) do nothing;

  update public.payments set
    cancelled_amount = v_total_cancelled,
    status = case when v_total_cancelled >= approved_amount then 'cancelled' else 'partial_cancelled' end
  where id = v_payment.id;

  update public.orders set
    status = case when v_total_cancelled >= total_amount then 'refunded' else 'partially_refunded' end,
    cancelled_at = case when v_total_cancelled >= total_amount then now() else cancelled_at end
  where id = v_order.id;

  if v_total_cancelled >= v_order.total_amount then
    select * into v_item from public.order_items where order_id = v_order.id order by created_at limit 1;
    update public.enrollments set status = 'refunded', revoked_at = now()
    where order_item_id = v_item.id;
  end if;

  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values ('payment.refunded', 'order', v_order.id::text, jsonb_build_object(
    'order_number', v_order.order_number,
    'amount', p_amount,
    'total_cancelled', v_total_cancelled,
    'reason', p_reason
  ));
end;
$$;

-- 최고 관리자와 스태프를 분리하고 저장된 운영 범위를 RLS에서도 집행한다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.has_operator_permission(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.role = 'admin' then true
      when p.role <> 'staff' then false
      when p_scope = 'products' then coalesce(s.value ->> 'staffCanManageProducts', 'false') = 'true'
      when p_scope = 'orders' then coalesce(s.value ->> 'staffCanManageOrders', 'false') = 'true'
      when p_scope = 'members' then coalesce(s.value ->> 'staffCanManageMembers', 'false') = 'true'
      else false
    end
    from public.profiles p
    left join public.site_settings s on s.key = 'operator_preferences'
    where p.id = (select auth.uid()) and p.status = 'active'
  ), false);
$$;

create or replace function public.has_course_access(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_course_id is not null and (
    public.has_operator_permission('products')
    or (
      exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and status = 'active'
      )
      and exists (
        select 1 from public.enrollments
        where user_id = (select auth.uid())
          and course_id = target_course_id
          and status = 'active'
          and access_starts_at <= now()
          and (access_ends_at is null or access_ends_at > now())
      )
    )
  );
$$;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.has_operator_permission('members')));

drop policy if exists admins_manage_courses on public.courses;
create policy admins_manage_courses on public.courses for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_course_assets on public.course_assets;
create policy admins_manage_course_assets on public.course_assets for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_cohorts on public.cohorts;
create policy admins_manage_cohorts on public.cohorts for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_cohort_sessions on public.cohort_sessions;
create policy admins_manage_cohort_sessions on public.cohort_sessions for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_cohort_session_contents on public.cohort_session_contents;
create policy admins_manage_cohort_session_contents on public.cohort_session_contents for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_curriculum_weeks on public.curriculum_weeks;
create policy admins_manage_curriculum_weeks on public.curriculum_weeks for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_curriculum_lessons on public.curriculum_lessons;
create policy admins_manage_curriculum_lessons on public.curriculum_lessons for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_lesson_contents on public.lesson_contents;
create policy admins_manage_lesson_contents on public.lesson_contents for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));

drop policy if exists users_read_own_orders on public.orders;
create policy users_read_own_orders on public.orders for select to authenticated
  using ((select auth.uid()) = user_id or (select public.has_operator_permission('orders')));
drop policy if exists admins_manage_orders on public.orders;
create policy admins_manage_orders on public.orders for all to authenticated
  using ((select public.has_operator_permission('orders'))) with check ((select public.has_operator_permission('orders')));
drop policy if exists users_read_own_order_items on public.order_items;
create policy users_read_own_order_items on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())) or (select public.has_operator_permission('orders')));
drop policy if exists admins_manage_order_items on public.order_items;
create policy admins_manage_order_items on public.order_items for all to authenticated
  using ((select public.has_operator_permission('orders'))) with check ((select public.has_operator_permission('orders')));
drop policy if exists users_read_own_payments on public.payments;
create policy users_read_own_payments on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())) or (select public.has_operator_permission('orders')));
drop policy if exists admins_manage_payments on public.payments;
create policy admins_manage_payments on public.payments for all to authenticated
  using ((select public.has_operator_permission('orders'))) with check ((select public.has_operator_permission('orders')));
drop policy if exists users_read_own_refunds on public.refunds;
create policy users_read_own_refunds on public.refunds for select to authenticated
  using (exists (select 1 from public.payments p join public.orders o on o.id = p.order_id where p.id = payment_id and o.user_id = (select auth.uid())) or (select public.has_operator_permission('orders')));
drop policy if exists admins_manage_refunds on public.refunds;
create policy admins_manage_refunds on public.refunds for all to authenticated
  using ((select public.has_operator_permission('orders'))) with check ((select public.has_operator_permission('orders')));
drop policy if exists admins_read_payment_events on public.payment_events;
create policy admins_read_payment_events on public.payment_events for select to authenticated
  using ((select public.has_operator_permission('orders')));

drop policy if exists users_read_own_enrollments on public.enrollments;
create policy users_read_own_enrollments on public.enrollments for select to authenticated
  using ((select auth.uid()) = user_id or (select public.has_operator_permission('members')));
drop policy if exists admins_manage_enrollments on public.enrollments;
create policy admins_manage_enrollments on public.enrollments for all to authenticated
  using ((select public.has_operator_permission('members'))) with check ((select public.has_operator_permission('members')));

drop policy if exists users_manage_own_progress on public.lesson_progress;
create policy users_manage_own_progress on public.lesson_progress for all to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      join public.profiles p on p.id = e.user_id
      where e.id = enrollment_id
        and e.user_id = (select auth.uid())
        and p.status = 'active'
        and e.status = 'active'
        and e.access_starts_at <= now()
        and (e.access_ends_at is null or e.access_ends_at > now())
    )
  )
  with check (
    exists (
      select 1 from public.enrollments e
      join public.profiles p on p.id = e.user_id
      join public.curriculum_lessons l on l.id = lesson_id
      join public.curriculum_weeks w on w.id = l.week_id
      where e.id = enrollment_id
        and e.user_id = (select auth.uid())
        and p.status = 'active'
        and e.status = 'active'
        and e.access_starts_at <= now()
        and (e.access_ends_at is null or e.access_ends_at > now())
        and e.course_id = w.course_id
    )
  );

drop policy if exists admins_manage_reviews on public.reviews;
drop policy if exists buyers_submit_reviews on public.reviews;
create policy buyers_submit_reviews on public.reviews for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and is_featured = false
    and exists (
      select 1 from public.enrollments e
      where e.user_id = (select auth.uid())
        and e.course_id = reviews.course_id
        and e.cohort_id = reviews.cohort_id
        and e.status = 'active'
        and e.access_starts_at <= now()
        and (e.access_ends_at is null or e.access_ends_at > now())
        and exists (
          select 1 from public.profiles p
          where p.id = e.user_id and p.status = 'active'
        )
    )
  );
create policy admins_manage_reviews on public.reviews for all to authenticated
  using ((select public.has_operator_permission('products'))) with check ((select public.has_operator_permission('products')));
drop policy if exists admins_manage_banners on public.site_banners;
create policy admins_manage_banners on public.site_banners for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists admins_manage_settings on public.site_settings;
create policy admins_manage_settings on public.site_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists admins_read_audit_logs on public.audit_logs;
create policy admins_read_audit_logs on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

drop policy if exists admins_upload_course_assets on storage.objects;
create policy admins_upload_course_assets on storage.objects for insert to authenticated
  with check (bucket_id = 'course-assets' and (select public.has_operator_permission('products')));
drop policy if exists admins_update_course_assets on storage.objects;
create policy admins_update_course_assets on storage.objects for update to authenticated
  using (bucket_id = 'course-assets' and (select public.has_operator_permission('products')))
  with check (bucket_id = 'course-assets' and (select public.has_operator_permission('products')));
drop policy if exists admins_delete_course_assets on storage.objects;
create policy admins_delete_course_assets on storage.objects for delete to authenticated
  using (bucket_id = 'course-assets' and (select public.has_operator_permission('products')));
drop policy if exists admins_upload_course_resources on storage.objects;
create policy admins_upload_course_resources on storage.objects for insert to authenticated
  with check (bucket_id = 'course-resources' and (select public.has_operator_permission('products')));
drop policy if exists admins_update_course_resources on storage.objects;
create policy admins_update_course_resources on storage.objects for update to authenticated
  using (bucket_id = 'course-resources' and (select public.has_operator_permission('products')))
  with check (bucket_id = 'course-resources' and (select public.has_operator_permission('products')));
drop policy if exists admins_delete_course_resources on storage.objects;
create policy admins_delete_course_resources on storage.objects for delete to authenticated
  using (bucket_id = 'course-resources' and (select public.has_operator_permission('products')));

revoke execute on function public.has_operator_permission(text) from public;
grant execute on function public.has_operator_permission(text) to authenticated, service_role;

revoke all on function public.finalize_toss_payment(text,text,text,integer,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.record_toss_waiting_payment(text,text,text,integer,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.record_toss_terminal_payment(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.finalize_toss_refund(text,integer,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.create_checkout_order(uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_toss_payment(text,text,text,integer,text,jsonb,timestamptz) to service_role;
grant execute on function public.record_toss_waiting_payment(text,text,text,integer,text,jsonb,timestamptz) to service_role;
grant execute on function public.record_toss_terminal_payment(text,text,text,jsonb) to service_role;
grant execute on function public.finalize_toss_refund(text,integer,text,text,jsonb) to service_role;
grant execute on function public.create_checkout_order(uuid,uuid,text,text,text,text,text,text) to service_role;

commit;
