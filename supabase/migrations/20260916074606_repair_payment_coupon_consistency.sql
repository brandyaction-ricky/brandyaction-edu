begin;

-- BA-PAYMENT-COUPON-P0-001
-- Repair the schema drift without rewriting historical migration files or data.

do $$
begin
  if to_regclass('public.crm_tags') is null
    or to_regclass('public.crm_member_tags') is null
    or to_regclass('public.coupons') is null
    or to_regclass('public.coupon_products') is null
    or to_regclass('public.coupon_redemptions') is null
    or to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.enrollments') is null
  then
    raise exception 'PAYMENT_COUPON_REPAIR_PREREQUISITE_MISSING';
  end if;
end;
$$;

-- Refuse to hide an incompatible pre-existing column behind IF NOT EXISTS.
do $$
declare
  v_column record;
begin
  for v_column in
    select * from (values
      ('crm_tags','is_active','boolean'),
      ('coupons','max_discount_amount','integer'),
      ('coupons','minimum_order_amount','integer'),
      ('coupons','per_user_limit','integer'),
      ('coupons','issue_target','text'),
      ('coupons','target_tag_id','uuid'),
      ('coupons','exclude_free','boolean')
    ) as expected(table_name,column_name,data_type)
  loop
    if exists (
      select 1
      from information_schema.columns actual
      where actual.table_schema='public'
        and actual.table_name=v_column.table_name
        and actual.column_name=v_column.column_name
        and actual.data_type<>v_column.data_type
    ) then
      raise exception 'PAYMENT_COUPON_REPAIR_TYPE_MISMATCH: %.%',v_column.table_name,v_column.column_name;
    end if;
  end loop;
end;
$$;

alter table public.crm_tags
  add column if not exists is_active boolean;
update public.crm_tags set is_active=true where is_active is null;
alter table public.crm_tags alter column is_active set default true;
alter table public.crm_tags alter column is_active set not null;

alter table public.crm_tags drop constraint if exists crm_tags_rule_key_allowed;
alter table public.crm_tags add constraint crm_tags_rule_key_allowed check (
  rule_key is null or rule_key in (
    'free_lesson_1','free_lesson_2','free_lesson_3',
    'paid_customer','mission_completed','signed_up'
  )
);

alter table public.coupons
  add column if not exists max_discount_amount integer,
  add column if not exists minimum_order_amount integer,
  add column if not exists per_user_limit integer,
  add column if not exists issue_target text,
  add column if not exists target_tag_id uuid,
  add column if not exists exclude_free boolean;

update public.coupons set
  minimum_order_amount=coalesce(minimum_order_amount,0),
  per_user_limit=coalesce(per_user_limit,1),
  issue_target=coalesce(issue_target,'all'),
  exclude_free=coalesce(exclude_free,true);

alter table public.coupons alter column minimum_order_amount set default 0;
alter table public.coupons alter column minimum_order_amount set not null;
alter table public.coupons alter column per_user_limit set default 1;
alter table public.coupons alter column per_user_limit set not null;
alter table public.coupons alter column issue_target set default 'all';
alter table public.coupons alter column issue_target set not null;
alter table public.coupons alter column exclude_free set default true;
alter table public.coupons alter column exclude_free set not null;

alter table public.coupons drop constraint if exists coupons_max_discount_amount_check;
alter table public.coupons add constraint coupons_max_discount_amount_check
  check (max_discount_amount is null or max_discount_amount>=0);
alter table public.coupons drop constraint if exists coupons_minimum_order_amount_check;
alter table public.coupons add constraint coupons_minimum_order_amount_check
  check (minimum_order_amount>=0);
alter table public.coupons drop constraint if exists coupons_per_user_limit_check;
alter table public.coupons add constraint coupons_per_user_limit_check
  check (per_user_limit>0);
alter table public.coupons drop constraint if exists coupons_product_scope_check;
alter table public.coupons add constraint coupons_product_scope_check
  check (product_scope in ('all','paid','specific'));
alter table public.coupons drop constraint if exists coupons_issue_target_check;
alter table public.coupons add constraint coupons_issue_target_check
  check (issue_target in ('all','tag'));
alter table public.coupons drop constraint if exists coupons_issue_target_tag_check;
alter table public.coupons add constraint coupons_issue_target_tag_check
  check ((issue_target='tag')=(target_tag_id is not null));
alter table public.coupons drop constraint if exists coupons_target_tag_id_fkey;
alter table public.coupons add constraint coupons_target_tag_id_fkey
  foreign key (target_tag_id) references public.crm_tags(id) on delete set null;

create index if not exists coupons_target_tag_id_idx
  on public.coupons(target_tag_id)
  where target_tag_id is not null;

create or replace function public.crm_sync_automatic_tags(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
begin
  if p_member_id is null then return; end if;
  select status into v_status from public.profiles where id=p_member_id;
  if v_status is null or v_status='withdrawn' then
    delete from public.crm_member_tags where member_id=p_member_id and assignment_source='automatic';
    return;
  end if;

  delete from public.crm_member_tags member_tag
  using public.crm_tags tag
  where member_tag.member_id=p_member_id
    and member_tag.tag_id=tag.id
    and member_tag.assignment_source='automatic'
    and not (
      tag.tag_kind='automatic'
      and tag.is_active
      and (
        tag.rule_key='signed_up'
        or (tag.rule_key='paid_customer' and exists(
          select 1
          from public.orders paid_order
          join public.order_items paid_item on paid_item.order_id=paid_order.id
          join public.courses paid_course on paid_course.id=paid_item.course_id
          where paid_order.user_id=p_member_id
            and paid_order.status in ('paid','partially_refunded')
            and not (
              paid_course.category='free'
              or coalesce(paid_course.metadata->>'programType',paid_course.metadata->>'productType','paid')='free'
            )
        ))
        or (tag.rule_key='mission_completed' and exists(
          select 1
          from public.mission_submissions submission
          join public.enrollments enrollment on enrollment.id=submission.enrollment_id
          where enrollment.user_id=p_member_id and submission.status in ('submitted','approved')
        ))
        or (tag.rule_key like 'free_lesson_%' and exists(
          select 1
          from public.enrollments enrollment
          join public.courses course on course.id=enrollment.course_id
          where enrollment.user_id=p_member_id
            and enrollment.status='active'
            and (course.category='free' or coalesce(course.metadata->>'programType',course.metadata->>'productType','paid')='free')
            and (
              select count(*)
              from public.lesson_progress progress
              where progress.enrollment_id=enrollment.id
                and (progress.completed_at is not null or progress.progress_percent>=tag.threshold_percent)
            )>=split_part(tag.rule_key,'_',3)::integer
        ))
      )
    );

  insert into public.crm_member_tags(member_id,tag_id,assigned_by,assignment_source,rule_key,assigned_at)
  select p_member_id,tag.id,null,'automatic',tag.rule_key,now()
  from public.crm_tags tag
  where tag.tag_kind='automatic'
    and tag.is_active
    and (
      tag.rule_key='signed_up'
      or (tag.rule_key='paid_customer' and exists(
        select 1
        from public.orders paid_order
        join public.order_items paid_item on paid_item.order_id=paid_order.id
        join public.courses paid_course on paid_course.id=paid_item.course_id
        where paid_order.user_id=p_member_id
          and paid_order.status in ('paid','partially_refunded')
          and not (
            paid_course.category='free'
            or coalesce(paid_course.metadata->>'programType',paid_course.metadata->>'productType','paid')='free'
          )
      ))
      or (tag.rule_key='mission_completed' and exists(
        select 1
        from public.mission_submissions submission
        join public.enrollments enrollment on enrollment.id=submission.enrollment_id
        where enrollment.user_id=p_member_id and submission.status in ('submitted','approved')
      ))
      or (tag.rule_key like 'free_lesson_%' and exists(
        select 1
        from public.enrollments enrollment
        join public.courses course on course.id=enrollment.course_id
        where enrollment.user_id=p_member_id
          and enrollment.status='active'
          and (course.category='free' or coalesce(course.metadata->>'programType',course.metadata->>'productType','paid')='free')
          and (
            select count(*)
            from public.lesson_progress progress
            where progress.enrollment_id=enrollment.id
              and (progress.completed_at is not null or progress.progress_percent>=tag.threshold_percent)
          )>=split_part(tag.rule_key,'_',3)::integer
      ))
    )
  on conflict(member_id,tag_id) do update set
    assignment_source='automatic',
    rule_key=excluded.rule_key,
    assigned_at=excluded.assigned_at;
end;
$$;

create or replace function public.apply_coupon_to_order(p_order_id uuid,p_user_id uuid,p_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_coupon public.coupons%rowtype;
  v_course public.courses%rowtype;
  v_code text:=nullif(upper(trim(coalesce(p_code,''))),'');
  v_base_price integer;
  v_base_discount integer;
  v_coupon_discount integer:=0;
  v_usage integer:=0;
  v_user_usage integer:=0;
  v_is_free boolean;
begin
  select * into v_order
  from public.orders
  where id=p_order_id and user_id=p_user_id
  for update;
  if not found or v_order.status<>'pending' then raise exception 'ORDER_NOT_PENDING'; end if;

  select * into v_item
  from public.order_items
  where order_id=v_order.id
  order by created_at
  limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;

  select * into v_course from public.courses where id=v_item.course_id;
  if not found then raise exception 'COURSE_NOT_FOUND'; end if;

  v_base_price:=v_item.unit_price*v_item.quantity;
  v_base_discount:=greatest(v_order.subtotal-v_base_price,0);
  v_is_free:=v_course.category='free'
    or coalesce(v_course.metadata->>'programType',v_course.metadata->>'productType','paid')='free';

  if v_code is null then
    update public.coupon_redemptions
    set status='released',used_at=null
    where order_id=v_order.id and status='reserved';
    update public.orders
    set coupon_id=null,coupon_code=null,discount_amount=v_base_discount,total_amount=v_base_price
    where id=v_order.id;
    return jsonb_build_object('couponCode',null,'couponDiscount',0,'totalAmount',v_base_price);
  end if;

  select * into v_coupon from public.coupons where code=v_code for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if not v_coupon.is_active then raise exception 'COUPON_INACTIVE'; end if;
  if v_coupon.starts_at is not null and v_coupon.starts_at>now() then raise exception 'COUPON_NOT_STARTED'; end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at<=now() then raise exception 'COUPON_EXPIRED'; end if;
  if v_base_price<v_coupon.minimum_order_amount then raise exception 'COUPON_MINIMUM_NOT_MET'; end if;
  if v_coupon.exclude_free and (v_base_price=0 or v_is_free) then raise exception 'COUPON_FREE_PRODUCT_EXCLUDED'; end if;
  if v_coupon.product_scope='paid' and v_is_free then raise exception 'COUPON_PRODUCT_MISMATCH'; end if;
  if v_coupon.product_scope='specific' and not exists(
    select 1 from public.coupon_products
    where coupon_id=v_coupon.id and course_id=v_item.course_id
  ) then raise exception 'COUPON_PRODUCT_MISMATCH'; end if;
  if v_coupon.issue_target='tag' and not exists(
    select 1 from public.crm_member_tags
    where member_id=p_user_id and tag_id=v_coupon.target_tag_id
  ) then raise exception 'COUPON_MEMBER_NOT_ELIGIBLE'; end if;

  select count(*) into v_usage
  from public.coupon_redemptions redemption
  join public.orders coupon_order on coupon_order.id=redemption.order_id
  where redemption.coupon_id=v_coupon.id
    and redemption.order_id<>v_order.id
    and (
      redemption.status='used'
      or (redemption.status='reserved' and coupon_order.status='pending' and coupon_order.expires_at>now())
    );
  if v_coupon.usage_limit is not null and v_usage>=v_coupon.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;

  select count(*) into v_user_usage
  from public.coupon_redemptions redemption
  join public.orders coupon_order on coupon_order.id=redemption.order_id
  where redemption.coupon_id=v_coupon.id
    and redemption.user_id=p_user_id
    and redemption.order_id<>v_order.id
    and (
      redemption.status='used'
      or (redemption.status='reserved' and coupon_order.status='pending' and coupon_order.expires_at>now())
    );
  if v_user_usage>=v_coupon.per_user_limit then raise exception 'COUPON_USER_LIMIT'; end if;

  v_coupon_discount:=case
    when v_coupon.discount_type='fixed' then least(v_coupon.discount_value,v_base_price)
    else least(floor(v_base_price*v_coupon.discount_value/100.0)::integer,v_base_price)
  end;
  if v_coupon.max_discount_amount is not null and v_coupon.max_discount_amount>0 then
    v_coupon_discount:=least(v_coupon_discount,v_coupon.max_discount_amount);
  end if;

  insert into public.coupon_redemptions(coupon_id,order_id,user_id,discount_amount,status)
  values(v_coupon.id,v_order.id,p_user_id,v_coupon_discount,'reserved')
  on conflict(order_id) do update set
    coupon_id=excluded.coupon_id,
    user_id=excluded.user_id,
    discount_amount=excluded.discount_amount,
    status='reserved',
    used_at=null;

  update public.orders set
    coupon_id=v_coupon.id,
    coupon_code=v_coupon.code,
    discount_amount=v_base_discount+v_coupon_discount,
    total_amount=v_base_price-v_coupon_discount
  where id=v_order.id;

  return jsonb_build_object(
    'couponId',v_coupon.id,
    'couponName',v_coupon.name,
    'couponCode',v_coupon.code,
    'couponDiscount',v_coupon_discount,
    'totalAmount',v_base_price-v_coupon_discount
  );
end;
$$;

create or replace function public.finalize_zero_total_order(p_order_id uuid,p_user_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_cohort public.cohorts%rowtype;
  v_course public.courses%rowtype;
  v_action text;
begin
  select * into v_order
  from public.orders
  where id=p_order_id and user_id=p_user_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.total_amount<>0 then raise exception 'ORDER_NOT_ZERO_TOTAL'; end if;
  if v_order.status not in ('pending','paid') then raise exception 'ORDER_NOT_PAYABLE'; end if;

  select * into v_item
  from public.order_items
  where order_id=v_order.id
  order by created_at
  limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  select * into v_cohort from public.cohorts where id=v_item.cohort_id;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;
  select * into v_course from public.courses where id=v_item.course_id;
  if not found then raise exception 'COURSE_NOT_FOUND'; end if;

  if v_order.coupon_id is not null and not exists(
    select 1
    from public.coupon_redemptions
    where order_id=v_order.id
      and coupon_id=v_order.coupon_id
      and user_id=v_order.user_id
      and status in ('reserved','used')
  ) then raise exception 'COUPON_REDEMPTION_MISSING'; end if;

  if v_order.status='pending' then
    update public.orders
    set status='paid',paid_at=now(),expires_at=null
    where id=v_order.id;

    update public.coupon_redemptions
    set status='used',used_at=coalesce(used_at,now())
    where order_id=v_order.id and status='reserved';
  end if;

  insert into public.enrollments(user_id,course_id,cohort_id,order_item_id,status,access_starts_at,access_ends_at)
  values(v_order.user_id,v_item.course_id,v_item.cohort_id,v_item.id,'active',now(),v_cohort.operation_end_at)
  on conflict(user_id,cohort_id) do update set
    order_item_id=excluded.order_item_id,
    status='active',
    access_starts_at=least(public.enrollments.access_starts_at,excluded.access_starts_at),
    access_ends_at=excluded.access_ends_at,
    revoked_at=null;

  if v_order.status='pending' then
    v_action:=case
      when v_order.coupon_id is not null then 'coupon.zero_total_order_completed'
      when v_course.category='free'
        or coalesce(v_course.metadata->>'programType',v_course.metadata->>'productType','paid')='free'
        then 'free_order.completed'
      else 'zero_price_order.completed'
    end;
    insert into public.audit_logs(action,entity_type,entity_id,after_data)
    values(v_action,'order',v_order.id::text,jsonb_build_object(
      'course_id',v_item.course_id,
      'cohort_id',v_item.cohort_id,
      'coupon_code',v_order.coupon_code,
      'payment_required',false
    ));
  end if;

  perform public.crm_sync_automatic_tags(v_order.user_id);
  return v_order.order_number;
end;
$$;

-- Keep the historical RPC as a compatibility alias while enforcing coupon-only use.
create or replace function public.finalize_zero_total_coupon_order(p_order_id uuid,p_user_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.orders
    where id=p_order_id and user_id=p_user_id and total_amount=0 and coupon_id is not null
  ) then raise exception 'ORDER_NOT_ZERO_TOTAL_COUPON'; end if;
  return public.finalize_zero_total_order(p_order_id,p_user_id);
end;
$$;

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
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_cohort public.cohorts%rowtype;
  v_payment public.payments%rowtype;
  v_enrollment_id uuid;
  v_was_paid boolean;
begin
  if nullif(trim(coalesce(p_payment_key,'')),'') is null then raise exception 'PAYMENT_KEY_REQUIRED'; end if;
  if p_approved_amount<=0 then raise exception 'PAYMENT_AMOUNT_INVALID'; end if;
  if coalesce(p_payload->>'paymentKey','')<>p_payment_key
    or coalesce(p_payload->>'orderId','')<>p_order_number
    or coalesce(p_payload->>'status','')<>'DONE'
    or coalesce(p_payload->>'currency','')<>'KRW'
    or coalesce((p_payload->>'totalAmount')::integer,-1)<>p_approved_amount
  then raise exception 'PAYMENT_PROVIDER_DATA_MISMATCH'; end if;

  select * into v_order
  from public.orders
  where order_number=p_order_number
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.user_id is null then raise exception 'ORDER_USER_MISSING'; end if;
  if v_order.total_amount<>p_approved_amount then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if v_order.status not in ('pending','payment_failed','cancelled','paid') then raise exception 'ORDER_NOT_PAYABLE'; end if;
  v_was_paid:=v_order.status='paid';

  if exists(
    select 1 from public.payments
    where provider_payment_key=p_payment_key and order_id<>v_order.id
  ) then raise exception 'PAYMENT_KEY_ALREADY_USED'; end if;

  select * into v_payment from public.payments where order_id=v_order.id for update;
  if found and v_payment.provider_payment_key is distinct from p_payment_key then
    raise exception 'ORDER_PAYMENT_KEY_MISMATCH';
  end if;

  select * into v_item
  from public.order_items
  where order_id=v_order.id
  order by created_at
  limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  select * into v_cohort from public.cohorts where id=v_item.cohort_id;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;

  insert into public.payments(
    order_id,provider,provider_payment_key,method,status,
    approved_amount,receipt_url,provider_payload,approved_at
  ) values(
    v_order.id,'toss',p_payment_key,p_method,'done',
    p_approved_amount,p_receipt_url,coalesce(p_payload,'{}'::jsonb),coalesce(p_approved_at,now())
  )
  on conflict(order_id) do update set
    method=excluded.method,
    status='done',
    approved_amount=excluded.approved_amount,
    receipt_url=excluded.receipt_url,
    provider_payload=excluded.provider_payload,
    approved_at=excluded.approved_at;

  if not v_was_paid then
    update public.orders set
      status='paid',
      paid_at=coalesce(p_approved_at,now()),
      expires_at=null
    where id=v_order.id;
  end if;

  insert into public.enrollments(
    user_id,course_id,cohort_id,order_item_id,status,access_starts_at,access_ends_at
  ) values(
    v_order.user_id,v_item.course_id,v_item.cohort_id,v_item.id,'active',now(),v_cohort.operation_end_at
  )
  on conflict(user_id,cohort_id) do update set
    order_item_id=excluded.order_item_id,
    status='active',
    access_starts_at=least(public.enrollments.access_starts_at,excluded.access_starts_at),
    access_ends_at=excluded.access_ends_at,
    revoked_at=null
  returning id into v_enrollment_id;

  if not v_was_paid then
    insert into public.audit_logs(action,entity_type,entity_id,after_data)
    values('payment.approved','order',v_order.id::text,jsonb_build_object(
      'order_number',v_order.order_number,
      'amount',p_approved_amount,
      'enrollment_id',v_enrollment_id,
      'provider','toss'
    ));
  end if;

  perform public.crm_sync_automatic_tags(v_order.user_id);
  return v_enrollment_id;
end;
$$;

create or replace function public.sync_coupon_redemption_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='paid' and old.status is distinct from 'paid' then
    update public.coupon_redemptions
    set status='used',used_at=coalesce(used_at,new.paid_at,now())
    where order_id=new.id and status='reserved';
  elsif new.status in ('payment_failed','cancelled','refunded') and old.status is distinct from new.status then
    update public.coupon_redemptions
    set status='released',used_at=null
    where order_id=new.id and status='reserved';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_coupon_redemption on public.orders;
create trigger orders_sync_coupon_redemption
after update of status on public.orders
for each row execute function public.sync_coupon_redemption_status();

-- These SECURITY DEFINER RPCs are server-only checkout mutations.
do $$
declare
  v_target record;
begin
  for v_target in
    select p.oid::regprocedure signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'create_checkout_order','apply_coupon_to_order','finalize_zero_total_order',
        'finalize_zero_total_coupon_order','finalize_toss_payment'
      )
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',v_target.signature);
    execute format('grant execute on function %s to service_role',v_target.signature);
  end loop;
end;
$$;

commit;
