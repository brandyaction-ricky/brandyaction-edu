begin;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  product_scope text not null default 'all' check (product_scope in ('all','specific')),
  discount_type text not null check (discount_type in ('fixed','percentage')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percentage' or discount_value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.coupon_products (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  primary key (coupon_id, course_id)
);

alter table public.orders add column if not exists coupon_id uuid references public.coupons(id) on delete set null;
alter table public.orders add column if not exists coupon_code text;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  discount_amount integer not null check (discount_amount >= 0),
  status text not null default 'reserved' check (status in ('reserved','used','released')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;
alter table public.coupon_products enable row level security;
alter table public.coupon_redemptions enable row level security;

drop policy if exists admins_manage_coupons on public.coupons;
create policy admins_manage_coupons on public.coupons for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists admins_manage_coupon_products on public.coupon_products;
create policy admins_manage_coupon_products on public.coupon_products for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists admins_read_coupon_redemptions on public.coupon_redemptions;
create policy admins_read_coupon_redemptions on public.coupon_redemptions for select to authenticated using ((select public.is_admin()));

grant select,insert,update,delete on public.coupons,public.coupon_products,public.coupon_redemptions to authenticated,service_role;

create or replace function public.apply_coupon_to_order(p_order_id uuid, p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_coupon public.coupons%rowtype;
  v_base_price integer;
  v_base_discount integer;
  v_coupon_discount integer := 0;
  v_usage integer := 0;
begin
  select * into v_order from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found or v_order.status <> 'pending' then raise exception 'ORDER_NOT_PENDING'; end if;
  select * into v_item from public.order_items where order_id=v_order.id order by created_at limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  v_base_price := v_item.unit_price;
  v_base_discount := greatest(v_order.subtotal-v_base_price,0);
  update public.coupon_redemptions set status='released' where order_id=v_order.id and status='reserved';
  update public.orders set coupon_id=null,coupon_code=null,discount_amount=v_base_discount,total_amount=v_base_price where id=v_order.id;
  if nullif(upper(trim(coalesce(p_code,''))),'') is null then
    return jsonb_build_object('couponCode',null,'couponDiscount',0,'totalAmount',v_base_price);
  end if;
  select * into v_coupon from public.coupons where code=upper(trim(p_code)) and is_active=true for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if v_coupon.starts_at is not null and v_coupon.starts_at>now() then raise exception 'COUPON_NOT_STARTED'; end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at<=now() then raise exception 'COUPON_EXPIRED'; end if;
  if v_coupon.product_scope='specific' and not exists(select 1 from public.coupon_products where coupon_id=v_coupon.id and course_id=v_item.course_id) then raise exception 'COUPON_PRODUCT_MISMATCH'; end if;
  select count(*) into v_usage from public.coupon_redemptions r join public.orders o on o.id=r.order_id
    where r.coupon_id=v_coupon.id and (r.status='used' or (r.status='reserved' and o.status='pending' and o.expires_at>now()));
  if v_coupon.usage_limit is not null and v_usage>=v_coupon.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;
  v_coupon_discount := case when v_coupon.discount_type='fixed' then least(v_coupon.discount_value,v_base_price) else least(floor(v_base_price*v_coupon.discount_value/100.0)::integer,v_base_price) end;
  insert into public.coupon_redemptions(coupon_id,order_id,user_id,discount_amount,status) values(v_coupon.id,v_order.id,p_user_id,v_coupon_discount,'reserved')
    on conflict(order_id) do update set coupon_id=excluded.coupon_id,user_id=excluded.user_id,discount_amount=excluded.discount_amount,status='reserved',used_at=null;
  update public.orders set coupon_id=v_coupon.id,coupon_code=v_coupon.code,discount_amount=v_base_discount+v_coupon_discount,total_amount=v_base_price-v_coupon_discount where id=v_order.id;
  return jsonb_build_object('couponId',v_coupon.id,'couponName',v_coupon.name,'couponCode',v_coupon.code,'couponDiscount',v_coupon_discount,'totalAmount',v_base_price-v_coupon_discount);
end;
$$;

create or replace function public.finalize_zero_total_coupon_order(p_order_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype; v_item public.order_items%rowtype; v_cohort public.cohorts%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found or v_order.status<>'pending' or v_order.total_amount<>0 or v_order.coupon_id is null then raise exception 'ORDER_NOT_FREE'; end if;
  select * into v_item from public.order_items where order_id=v_order.id order by created_at limit 1;
  select * into v_cohort from public.cohorts where id=v_item.cohort_id;
  update public.orders set status='paid',paid_at=now(),expires_at=null where id=v_order.id;
  update public.coupon_redemptions set status='used',used_at=now() where order_id=v_order.id;
  insert into public.enrollments(user_id,course_id,cohort_id,order_item_id,status,access_starts_at,access_ends_at)
    values(v_order.user_id,v_item.course_id,v_item.cohort_id,v_item.id,'active',now(),v_cohort.operation_end_at)
    on conflict(user_id,cohort_id) do update set order_item_id=excluded.order_item_id,status='active',access_starts_at=least(public.enrollments.access_starts_at,excluded.access_starts_at),access_ends_at=excluded.access_ends_at,revoked_at=null;
  insert into public.audit_logs(action,entity_type,entity_id,after_data) values('coupon.free_order_completed','order',v_order.id::text,jsonb_build_object('coupon_code',v_order.coupon_code));
  return v_order.order_number;
end;
$$;

create or replace function public.sync_coupon_redemption_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='paid' and old.status is distinct from 'paid' then update public.coupon_redemptions set status='used',used_at=coalesce(new.paid_at,now()) where order_id=new.id and status='reserved'; end if;
  if new.status in ('payment_failed','cancelled','refunded') then update public.coupon_redemptions set status='released' where order_id=new.id and status='reserved'; end if;
  return new;
end; $$;
drop trigger if exists orders_sync_coupon_redemption on public.orders;
create trigger orders_sync_coupon_redemption after update of status on public.orders for each row execute function public.sync_coupon_redemption_status();

commit;
