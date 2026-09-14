begin;

alter table public.coupons
  add column if not exists max_discount_amount integer check (max_discount_amount is null or max_discount_amount >= 0),
  add column if not exists minimum_order_amount integer not null default 0 check (minimum_order_amount >= 0),
  add column if not exists per_user_limit integer not null default 1 check (per_user_limit > 0),
  add column if not exists issue_target text not null default 'all',
  add column if not exists target_tag_id uuid references public.crm_tags(id) on delete set null,
  add column if not exists exclude_free boolean not null default true;

alter table public.coupons drop constraint if exists coupons_product_scope_check;
alter table public.coupons add constraint coupons_product_scope_check check (product_scope in ('all','paid','specific'));
alter table public.coupons drop constraint if exists coupons_issue_target_check;
alter table public.coupons add constraint coupons_issue_target_check check (issue_target in ('all','tag'));
alter table public.coupons drop constraint if exists coupons_issue_target_tag_check;
alter table public.coupons add constraint coupons_issue_target_tag_check check ((issue_target='tag')=(target_tag_id is not null));

create or replace function public.apply_coupon_to_order(p_order_id uuid, p_user_id uuid, p_code text)
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
  v_base_price integer;
  v_base_discount integer;
  v_coupon_discount integer:=0;
  v_usage integer:=0;
  v_user_usage integer:=0;
begin
  select * into v_order from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found or v_order.status<>'pending' then raise exception 'ORDER_NOT_PENDING'; end if;
  select * into v_item from public.order_items where order_id=v_order.id order by created_at limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  select * into v_course from public.courses where id=v_item.course_id;
  if not found then raise exception 'COURSE_NOT_FOUND'; end if;
  v_base_price:=v_item.unit_price;
  v_base_discount:=greatest(v_order.subtotal-v_base_price,0);
  update public.coupon_redemptions set status='released' where order_id=v_order.id and status='reserved';
  update public.orders set coupon_id=null,coupon_code=null,discount_amount=v_base_discount,total_amount=v_base_price where id=v_order.id;
  if nullif(upper(trim(coalesce(p_code,''))),'') is null then
    return jsonb_build_object('couponCode',null,'couponDiscount',0,'totalAmount',v_base_price);
  end if;
  select * into v_coupon from public.coupons where code=upper(trim(p_code)) and is_active=true for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if v_coupon.starts_at is not null and v_coupon.starts_at>now() then raise exception 'COUPON_NOT_STARTED'; end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at<=now() then raise exception 'COUPON_EXPIRED'; end if;
  if v_base_price<v_coupon.minimum_order_amount then raise exception 'COUPON_MINIMUM_NOT_MET'; end if;
  if v_coupon.exclude_free and (v_base_price=0 or v_course.category='free') then raise exception 'COUPON_FREE_PRODUCT_EXCLUDED'; end if;
  if v_coupon.product_scope='paid' and v_course.category='free' then raise exception 'COUPON_PRODUCT_MISMATCH'; end if;
  if v_coupon.product_scope='specific' and not exists(select 1 from public.coupon_products where coupon_id=v_coupon.id and course_id=v_item.course_id) then raise exception 'COUPON_PRODUCT_MISMATCH'; end if;
  if v_coupon.issue_target='tag' and not exists(select 1 from public.crm_member_tags where member_id=p_user_id and tag_id=v_coupon.target_tag_id) then raise exception 'COUPON_MEMBER_NOT_ELIGIBLE'; end if;
  select count(*) into v_usage from public.coupon_redemptions redemption join public.orders coupon_order on coupon_order.id=redemption.order_id
    where redemption.coupon_id=v_coupon.id and (redemption.status='used' or (redemption.status='reserved' and coupon_order.status='pending' and coupon_order.expires_at>now()));
  if v_coupon.usage_limit is not null and v_usage>=v_coupon.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;
  select count(*) into v_user_usage from public.coupon_redemptions redemption join public.orders coupon_order on coupon_order.id=redemption.order_id
    where redemption.coupon_id=v_coupon.id and redemption.user_id=p_user_id and (redemption.status='used' or (redemption.status='reserved' and coupon_order.status='pending' and coupon_order.expires_at>now()));
  if v_user_usage>=v_coupon.per_user_limit then raise exception 'COUPON_USER_LIMIT'; end if;
  v_coupon_discount:=case when v_coupon.discount_type='fixed' then least(v_coupon.discount_value,v_base_price) else least(floor(v_base_price*v_coupon.discount_value/100.0)::integer,v_base_price) end;
  if v_coupon.max_discount_amount is not null and v_coupon.max_discount_amount>0 then v_coupon_discount:=least(v_coupon_discount,v_coupon.max_discount_amount); end if;
  insert into public.coupon_redemptions(coupon_id,order_id,user_id,discount_amount,status) values(v_coupon.id,v_order.id,p_user_id,v_coupon_discount,'reserved')
    on conflict(order_id) do update set coupon_id=excluded.coupon_id,user_id=excluded.user_id,discount_amount=excluded.discount_amount,status='reserved',used_at=null;
  update public.orders set coupon_id=v_coupon.id,coupon_code=v_coupon.code,discount_amount=v_base_discount+v_coupon_discount,total_amount=v_base_price-v_coupon_discount where id=v_order.id;
  return jsonb_build_object('couponId',v_coupon.id,'couponName',v_coupon.name,'couponCode',v_coupon.code,'couponDiscount',v_coupon_discount,'totalAmount',v_base_price-v_coupon_discount);
end;
$$;

commit;
