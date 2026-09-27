begin;

-- Existing starts_at/ends_at remain the use window. Existing coupons stay live.
alter table public.coupons
  add column issue_start_at timestamptz,
  add column issue_end_at timestamptz,
  add column is_draft boolean not null default false;
alter table public.coupons alter column per_user_limit drop not null;
alter table public.coupons drop constraint coupons_discount_type_check;
alter table public.coupons add constraint coupons_discount_type_check check (discount_type in ('fixed','percentage','ADMIN_FREE'));
alter table public.coupons add constraint coupons_admin_free_check check (discount_type <> 'ADMIN_FREE' or (discount_value=100 and max_discount_amount is null and exclude_free));
alter table public.coupons add constraint coupons_issue_window_check check (issue_start_at is null or issue_end_at is null or issue_start_at < issue_end_at);
alter table public.coupon_redemptions drop constraint coupon_redemptions_status_check;
alter table public.coupon_redemptions add constraint coupon_redemptions_status_check check (status in ('reserved','used','released','cancelled'));
alter table public.coupon_redemptions add column original_amount integer, add column final_amount integer, add column cancelled_at timestamptz;
create index if not exists coupon_redemptions_coupon_user_status_idx on public.coupon_redemptions(coupon_id,user_id,status);

-- Covers both checkout issuance and the existing bulk member assignment RPC.
create or replace function public.edu_validate_coupon_issue()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype;
begin
  select * into c from public.coupons where id=new.coupon_id for update;
  if c.discount_type='ADMIN_FREE' and not exists(select 1 from public.profiles where id=new.user_id and role='admin' and status='active') then raise exception 'COUPON_ADMIN_ONLY'; end if;
  if exists(select 1 from public.customer_coupons where coupon_id=new.coupon_id and user_id=new.user_id) then return new; end if;
  if not c.is_active or c.is_draft then raise exception 'COUPON_INACTIVE'; end if;
  if c.issue_start_at>now() or c.issue_end_at<=now() or c.ends_at<=now() then raise exception 'COUPON_ISSUE_PERIOD'; end if;
  if c.issue_target='tag' and not exists(select 1 from public.crm_member_tags where member_id=new.user_id and tag_id=c.target_tag_id) then raise exception 'COUPON_MEMBER_NOT_ELIGIBLE'; end if;
  if c.usage_limit is not null and (select count(*) from public.customer_coupons where coupon_id=c.id and status<>'revoked')>=c.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;
  return new;
end; $$;
create trigger customer_coupons_validate_issue before insert on public.customer_coupons for each row execute function public.edu_validate_coupon_issue();

-- Only the server may mutate coupons: a generic authenticated table update must
-- not turn a normal coupon into ADMIN_FREE or bypass the atomic product links.
revoke insert,update,delete on public.coupons,public.coupon_products from authenticated;

create or replace function public.edu_save_coupon(p_actor uuid,p_id uuid,p_values jsonb,p_products uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; existing public.coupons%rowtype;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ADMIN_REQUIRED'; end if;
  if p_id is null then raise exception 'COUPON_INVALID'; end if;
  select * into existing from public.coupons where id=p_id for update;
  c:=jsonb_populate_record(null::public.coupons,p_values);
  c.id:=p_id; c.code:=upper(trim(c.code)); c.name:=trim(c.name);
  c.minimum_order_amount:=coalesce(c.minimum_order_amount,0);
  c.exclude_free:=coalesce(c.exclude_free,true); c.is_active:=coalesce(c.is_active,true); c.is_draft:=coalesce(c.is_draft,false);
  c.product_scope:=coalesce(c.product_scope,'paid'); c.issue_target:=coalesce(c.issue_target,'all');
  if c.issue_target<>'tag' then c.target_tag_id:=null; end if;
  if c.discount_type='ADMIN_FREE' then c.discount_value:=100; c.max_discount_amount:=null; c.exclude_free:=true; end if;
  if c.name is null or length(c.name) not between 1 and 100 or c.code is null or c.code !~ '^[A-Z0-9_-]{3,30}$'
    or c.discount_type is null or c.discount_value is null or length(coalesce(c.description,''))>2000
    or (c.product_scope='specific' and coalesce(cardinality(p_products),0)=0)
    or exists(select 1 from unnest(p_products) requested(product_id) where not exists(select 1 from public.courses course where course.id=requested.product_id and course.status<>'archived' and to_jsonb(course)->>'archived_at' is null))
  then raise exception 'COUPON_INVALID'; end if;
  insert into public.coupons(id,name,description,code,discount_type,discount_value,max_discount_amount,minimum_order_amount,usage_limit,per_user_limit,product_scope,issue_target,target_tag_id,exclude_free,starts_at,ends_at,issue_start_at,issue_end_at,is_active,is_draft,created_by)
  values(c.id,c.name,c.description,c.code,c.discount_type,c.discount_value,c.max_discount_amount,c.minimum_order_amount,c.usage_limit,c.per_user_limit,c.product_scope,c.issue_target,c.target_tag_id,c.exclude_free,c.starts_at,c.ends_at,c.issue_start_at,c.issue_end_at,c.is_active,c.is_draft,p_actor)
  on conflict(id) do update set name=excluded.name,description=excluded.description,code=excluded.code,discount_type=excluded.discount_type,discount_value=excluded.discount_value,max_discount_amount=excluded.max_discount_amount,minimum_order_amount=excluded.minimum_order_amount,usage_limit=excluded.usage_limit,per_user_limit=excluded.per_user_limit,product_scope=excluded.product_scope,issue_target=excluded.issue_target,target_tag_id=excluded.target_tag_id,exclude_free=excluded.exclude_free,starts_at=excluded.starts_at,ends_at=excluded.ends_at,issue_start_at=excluded.issue_start_at,issue_end_at=excluded.issue_end_at,is_active=excluded.is_active,is_draft=excluded.is_draft,updated_at=now()
  returning * into c;
  delete from public.coupon_products where coupon_id=c.id;
  if c.product_scope='specific' then
    insert into public.coupon_products(coupon_id,course_id) select c.id,id from (select distinct unnest(p_products) id) ids;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'coupon.saved','coupon',c.id::text,to_jsonb(existing),to_jsonb(c));
  return to_jsonb(c);
end; $$;

create or replace function public.edu_set_coupon_active(p_actor uuid,p_ids uuid[],p_active boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ADMIN_REQUIRED'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 or p_active is null then raise exception 'COUPON_INVALID'; end if;
  perform 1 from public.coupons where id=any(p_ids) order by id for update;
  update public.coupons set is_active=p_active,updated_at=now() where id=any(p_ids);
  get diagnostics affected=row_count;
  insert into public.audit_logs(actor_user_id,action,entity_type,after_data) values(p_actor,'coupon.active_changed','coupon',jsonb_build_object('ids',p_ids,'is_active',p_active));
  return affected;
end; $$;

-- Shared authoritative eligibility + quote. p_order is only used to exclude
-- this order's own reservation. All callers are service_role-only.
create or replace function public.edu_coupon_quote(p_user uuid,p_cohort uuid,p_code text,p_order uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; h public.cohorts%rowtype; product public.courses%rowtype;
  wallet public.customer_coupons%rowtype; amount integer; used_count integer; member_count integer; current_order uuid:=p_order;
begin
  if not exists(select 1 from public.profiles where id=p_user and status='active') then raise exception 'AUTH_REQUIRED'; end if;
  select * into h from public.cohorts where id=p_cohort;
  if not found then raise exception 'COHORT_NOT_FOUND'; end if;
  select * into product from public.courses where id=h.course_id and status='published';
  if not found then raise exception 'COURSE_NOT_AVAILABLE'; end if;
  if p_order is not null then
    select i.unit_price*i.quantity into h.price from public.order_items i join public.orders o on o.id=i.order_id
      where o.id=p_order and o.user_id=p_user and i.cohort_id=p_cohort limit 1;
    if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  end if;
  if nullif(trim(p_code),'') is null then return jsonb_build_object('couponCode',null,'couponDiscount',0,'originalAmount',h.price,'totalAmount',h.price); end if;
  if current_order is null then
    select o.id into current_order from public.orders o join public.order_items i on i.order_id=o.id
      where o.user_id=p_user and i.cohort_id=p_cohort and o.status='pending' and o.expires_at>now() order by o.created_at desc limit 1;
  end if;
  select * into c from public.coupons where code=upper(trim(p_code)) for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if c.discount_type='ADMIN_FREE' and not exists(select 1 from public.profiles where id=p_user and role='admin' and status='active') then raise exception 'COUPON_ADMIN_ONLY'; end if;
  if not c.is_active or c.is_draft then raise exception 'COUPON_INACTIVE'; end if;
  if c.starts_at>now() then raise exception 'COUPON_NOT_STARTED'; end if;
  if c.ends_at<=now() then raise exception 'COUPON_EXPIRED'; end if;
  select * into wallet from public.customer_coupons where coupon_id=c.id and user_id=p_user;
  if found and (wallet.status='revoked' or wallet.expires_at<=now()) then raise exception 'COUPON_REVOKED'; end if;
  if wallet.id is null and (c.issue_start_at>now() or c.issue_end_at<=now()) then raise exception 'COUPON_ISSUE_PERIOD'; end if;
  if wallet.id is null and c.discount_type<>'ADMIN_FREE' and c.usage_limit is not null and
    (select count(*) from public.customer_coupons where coupon_id=c.id and status<>'revoked')>=c.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;
  if h.price<c.minimum_order_amount then raise exception 'COUPON_MINIMUM_NOT_MET'; end if;
  if (c.exclude_free or c.product_scope='paid') and (h.price=0 or product.category='free' or coalesce(product.metadata->>'programType',product.metadata->>'productType','paid')='free') then raise exception 'COUPON_FREE_PRODUCT_EXCLUDED'; end if;
  if c.product_scope='specific' and not exists(select 1 from public.coupon_products where coupon_id=c.id and course_id=h.course_id) then raise exception 'COUPON_PRODUCT_MISMATCH'; end if;
  if c.issue_target='tag' and not exists(select 1 from public.crm_member_tags where member_id=p_user and tag_id=c.target_tag_id) then raise exception 'COUPON_MEMBER_NOT_ELIGIBLE'; end if;
  select count(*),count(*) filter(where r.user_id=p_user) into used_count,member_count
  from public.coupon_redemptions r join public.orders o on o.id=r.order_id
  where r.coupon_id=c.id and (current_order is null or r.order_id<>current_order)
    and (r.status='used' or (r.status='reserved' and o.status='pending' and o.expires_at>now()));
  if c.usage_limit is not null and used_count>=c.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;
  if c.per_user_limit is not null and member_count>=c.per_user_limit then raise exception 'COUPON_USER_LIMIT'; end if;
  amount:=case when c.discount_type='ADMIN_FREE' then h.price when c.discount_type='fixed' then least(c.discount_value,h.price) else least(floor(h.price::numeric*c.discount_value/100)::integer,h.price) end;
  if c.max_discount_amount>0 then amount:=least(amount,c.max_discount_amount); end if;
  return jsonb_build_object('couponId',c.id,'couponName',c.name,'couponCode',c.code,'couponDiscount',amount,'originalAmount',h.price,'totalAmount',h.price-amount);
end; $$;

create or replace function public.apply_coupon_to_order(p_order_id uuid,p_user_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; item public.order_items%rowtype; quote jsonb;
begin
  select * into o from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found or o.status<>'pending' or o.expires_at<=now() then raise exception 'ORDER_NOT_PENDING'; end if;
  if exists(select 1 from public.payments where order_id=o.id and status='in_progress') then raise exception 'PAYMENT_ALREADY_PENDING'; end if;
  select * into item from public.order_items where order_id=o.id order by created_at limit 1;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;
  quote:=public.edu_coupon_quote(p_user_id,item.cohort_id,p_code,p_order_id);
  if quote->>'couponId' is null then
    update public.coupon_redemptions set status='released' where order_id=o.id and status='reserved';
  else
    insert into public.coupon_redemptions(coupon_id,order_id,user_id,original_amount,discount_amount,final_amount,status)
    values((quote->>'couponId')::uuid,o.id,p_user_id,(quote->>'originalAmount')::integer,(quote->>'couponDiscount')::integer,(quote->>'totalAmount')::integer,'reserved')
    on conflict(order_id) do update set coupon_id=excluded.coupon_id,original_amount=excluded.original_amount,discount_amount=excluded.discount_amount,final_amount=excluded.final_amount,status='reserved',used_at=null,cancelled_at=null;
    insert into public.customer_coupons(coupon_id,user_id,expires_at)
      select c.id,p_user_id,c.ends_at from public.coupons c where c.id=(quote->>'couponId')::uuid and c.discount_type<>'ADMIN_FREE'
      on conflict(coupon_id,user_id) do nothing;
  end if;
  update public.order_items set unit_price=(quote->>'originalAmount')::integer where id=item.id;
  update public.orders set coupon_id=(quote->>'couponId')::uuid,coupon_code=quote->>'couponCode',
    subtotal=greatest(subtotal,(quote->>'originalAmount')::integer),
    discount_amount=greatest(subtotal,(quote->>'originalAmount')::integer)-(quote->>'totalAmount')::integer,
    total_amount=(quote->>'totalAmount')::integer where id=o.id;
  return quote;
end; $$;

-- Create + apply + zero finalization commit together. Failure leaves no new
-- order, reservation, or entitlement behind. Existing positive Toss path stays.
create or replace function public.edu_checkout_with_coupon(p_user_id uuid,p_cohort_id uuid,p_customer_name text,p_customer_email text,p_customer_phone text,p_terms_version text,p_privacy_version text,p_refund_policy_version text,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; quote jsonb;
begin
  result:=public.create_checkout_order(p_user_id,p_cohort_id,p_customer_name,p_customer_email,p_customer_phone,p_terms_version,p_privacy_version,p_refund_policy_version);
  update public.order_items set unit_price=(result->>'totalAmount')::integer where id=(result->>'orderItemId')::uuid;
  update public.orders set subtotal=greatest((result->>'subtotal')::integer,(result->>'totalAmount')::integer) where id=(result->>'orderId')::uuid;
  quote:=public.apply_coupon_to_order((result->>'orderId')::uuid,p_user_id,p_code);
  result:=result||quote;
  if (result->>'totalAmount')::integer=0 then
    perform public.finalize_zero_total_order((result->>'orderId')::uuid,p_user_id);
    result:=result||jsonb_build_object('free',true);
  end if;
  return result;
end; $$;

create or replace function public.edu_available_coupons(p_user uuid,p_cohort uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; result jsonb:='[]'; quote jsonb; pending_id uuid;
begin
  select o.id into pending_id from public.orders o join public.order_items i on i.order_id=o.id
    where o.user_id=p_user and i.cohort_id=p_cohort and o.status='pending' and o.expires_at>now() order by o.created_at desc limit 1;
  for c in select code from public.coupons where is_active and not is_draft and
    (discount_type<>'ADMIN_FREE' or exists(select 1 from public.profiles where id=p_user and role='admin' and status='active')) order by created_at desc,id limit 100
  loop
    begin
      quote:=public.edu_coupon_quote(p_user,p_cohort,c.code,pending_id);
      result:=result||jsonb_build_array(quote);
    exception when raise_exception then null; -- Ineligible coupons are not disclosed.
    end;
  end loop;
  return result;
end; $$;

create or replace function public.edu_cancel_zero_order(p_actor uuid,p_order uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ADMIN_REQUIRED'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found or o.total_amount<>0 or o.status not in ('paid','cancelled') or exists(select 1 from public.payments where order_id=o.id) then raise exception 'ZERO_ORDER_REQUIRED'; end if;
  if o.status='cancelled' then return; end if;
  update public.orders set status='cancelled' where id=o.id;
  update public.enrollments set status='revoked',revoked_at=now() where order_item_id in(select id from public.order_items where order_id=o.id);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(p_actor,'coupon.zero_order_cancelled','order',o.id::text);
end; $$;

create or replace function public.sync_coupon_redemption_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; total_used integer; member_used integer;
begin
  if new.status='paid' and old.status is distinct from 'paid' then
    if new.coupon_id is not null then
      select * into c from public.coupons where id=new.coupon_id for update;
      if c.discount_type='ADMIN_FREE' and not exists(select 1 from public.profiles where id=new.user_id and role='admin' and status='active') then raise exception 'COUPON_ADMIN_ONLY'; end if;
      select count(*),count(*) filter(where r.user_id=new.user_id) into total_used,member_used
        from public.coupon_redemptions r join public.orders o on o.id=r.order_id
        where r.coupon_id=c.id and r.order_id<>new.id and (r.status='used' or (r.status='reserved' and o.status='pending' and o.expires_at>now()));
      if c.usage_limit is not null and total_used>=c.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;
      if c.per_user_limit is not null and member_used>=c.per_user_limit then raise exception 'COUPON_USER_LIMIT'; end if;
    end if;
    update public.coupon_redemptions set status='used',used_at=coalesce(used_at,new.paid_at,now()) where order_id=new.id and status in ('reserved','released');
  elsif new.status in ('cancelled','refunded') and old.status is distinct from new.status then
    update public.coupon_redemptions set status=case when status='used' then 'cancelled' else 'released' end,cancelled_at=now() where order_id=new.id and status in ('used','reserved');
  elsif new.status='payment_failed' and old.status is distinct from new.status then
    update public.coupon_redemptions set status='released' where order_id=new.id and status='reserved';
  end if;
  return new;
end; $$;

create or replace function public.sync_customer_coupon_wallet()
returns trigger language plpgsql security definer set search_path='' as $$
declare limit_count integer; used_count integer;
begin
  if new.user_id is null then return new; end if;
  select per_user_limit into limit_count from public.coupons where id=new.coupon_id;
  select count(*) into used_count from public.coupon_redemptions where coupon_id=new.coupon_id and user_id=new.user_id and status='used';
  update public.customer_coupons set status=case when limit_count is not null and used_count>=limit_count then 'used' else 'available' end,
    used_at=case when used_count>0 then coalesce(new.used_at,used_at) else null end,updated_at=now()
    where coupon_id=new.coupon_id and user_id=new.user_id and status<>'revoked';
  return new;
end; $$;

-- Wallet joins cannot expose an administrator test code to ordinary members.
create policy customers_read_issued_coupons on public.coupons for select to authenticated
using (discount_type<>'ADMIN_FREE' and exists(select 1 from public.customer_coupons w where w.coupon_id=coupons.id and w.user_id=(select auth.uid())));

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('edu_save_coupon','edu_set_coupon_active','edu_coupon_quote','edu_checkout_with_coupon','apply_coupon_to_order','edu_available_coupons','edu_cancel_zero_order')
  loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop;
end; $$;
commit;
