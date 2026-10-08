begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No coupon, disclosure, or live campaign is seeded. Configure after approval.
create table public.edu_consent_reward_config (
 singleton boolean primary key default true check(singleton),
 coupon_id uuid not null unique references public.coupons(id),
 valid_days integer not null check(valid_days=30),
 enabled boolean not null default false
);
create table public.edu_consent_reward_requests (
 member_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(member_id,request_id)
);
create table public.edu_consent_reward_awards (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 wallet_id uuid not null unique references public.customer_coupons(id),
 request_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.edu_consent_reward_config enable row level security;
alter table public.edu_consent_reward_requests enable row level security;
alter table public.edu_consent_reward_awards enable row level security;
revoke all on public.edu_consent_reward_config,public.edu_consent_reward_requests,public.edu_consent_reward_awards from public,anon,authenticated,service_role;
grant select on public.edu_consent_reward_config to service_role;
grant select,insert on public.edu_consent_reward_requests,public.edu_consent_reward_awards to service_role;
create function public.edu_consent_reward_config_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.coupon_id is distinct from old.coupon_id or new.valid_days is distinct from old.valid_days then raise exception 'REWARD_CONFIG_IMMUTABLE';end if;
 return new;
end$$;
create trigger edu_consent_reward_config_immutable before update on public.edu_consent_reward_config for each row execute function public.edu_consent_reward_config_immutable();

create function public.edu_consent_reward(p_member uuid,p_request uuid default null,p_payload jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg public.edu_consent_reward_config; c public.coupons; a public.edu_consent_reward_awards;
 receipt public.edu_consent_reward_requests; personal jsonb; marketing jsonb; result jsonb; chosen jsonb;
 available boolean; wallet uuid; expiry timestamptz; k text;
begin
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'CONSENT_FORBIDDEN';end if;
 personal:=public.edu_personalization_consent(p_member);
 marketing:=public.edu_account_consent(p_member);
 if p_request is not null then
  select * into receipt from public.edu_consent_reward_requests where member_id=p_member and request_id=p_request;
  if found then
   if receipt.payload is distinct from p_payload then raise exception 'CONSENT_CONFLICT';end if;
   -- Replays only return the original award acknowledgement; never replay consent writes.
   return receipt.result;
  end if;
 end if;
 select * into cfg from public.edu_consent_reward_config where singleton;
 select * into c from public.coupons where id=cfg.coupon_id for update;
 select * into a from public.edu_consent_reward_awards where member_id=p_member;
 available:=coalesce(cfg.enabled and c.is_active and not c.is_draft and c.discount_type='fixed' and c.discount_value=10000
  and (c.max_discount_amount is null or c.max_discount_amount=0 or c.max_discount_amount>=10000)
  and c.minimum_order_amount=0 and c.product_scope='paid' and c.issue_target='all' and c.per_user_limit=1
  and (c.issue_start_at is null or c.issue_start_at<=now()) and (c.issue_end_at is null or c.issue_end_at>now())
  and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now()+make_interval(days=>cfg.valid_days))
  and (c.usage_limit is null or (select count(*) from public.customer_coupons where coupon_id=c.id and status<>'revoked')<c.usage_limit),false);
 if p_payload is not null then
  if p_request is null or jsonb_typeof(p_payload)<>'object' or (select count(*) from jsonb_object_keys(p_payload))<>5
    or jsonb_typeof(p_payload->'choices')<>'object' or (select count(*) from jsonb_object_keys(p_payload->'choices'))<>3
    or p_payload->>'marketingVersion' is distinct from '2026-10-20'
    or not(p_payload ?& array['personalRevision','marketingRevision','wordingVersion']) then raise exception 'CONSENT_INVALID';end if;
  foreach k in array array['analysis','overseas','kakao'] loop
   if jsonb_typeof(p_payload->'choices'->k) is distinct from 'boolean' then raise exception 'CONSENT_INVALID';end if;
  end loop;
  if not available then raise exception 'REWARD_UNAVAILABLE';end if;
  if personal->>'revision' is distinct from p_payload->>'personalRevision' or marketing->>'revision' is distinct from p_payload->>'marketingRevision' then raise exception 'CONSENT_CONFLICT';end if;
  chosen:=p_payload->'choices';
  if not ((chosen->>'analysis')::boolean or (chosen->>'overseas')::boolean or (chosen->>'kakao')::boolean) then raise exception 'CONSENT_INVALID';end if;
  -- This invitation grants only explicitly selected choices. Withdrawal stays in settings.
  -- Never carry an old-version grant into a new wording version.
  if (chosen->>'analysis')::boolean or (chosen->>'overseas')::boolean then
   personal:=public.edu_personalization_consent(p_member,p_request,jsonb_build_object(
    'analysis',(chosen->>'analysis')::boolean or (not (personal->>'needsRenewal')::boolean and (personal->'choices'->>'analysis')::boolean),
    'overseas',(chosen->>'overseas')::boolean or (not (personal->>'needsRenewal')::boolean and (personal->'choices'->>'overseas')::boolean)),
    p_payload->>'wordingVersion',(p_payload->>'personalRevision')::uuid);
  end if;
  if (chosen->>'kakao')::boolean then
   marketing:=public.edu_account_consent(p_member,p_request,
    (marketing->'choices') || jsonb_build_object('marketingUse',true,'kakao',true),
    'profile','2026-10-20',(p_payload->>'marketingRevision')::uuid);
   if a.member_id is null then
    -- Existing issuance trigger enforces coupon status, issue window, and stock under lock.
    expiry:=now()+make_interval(days=>cfg.valid_days);
    insert into public.customer_coupons(coupon_id,user_id,expires_at) values(c.id,p_member,expiry)
     on conflict(coupon_id,user_id) do nothing returning id into wallet;
    if wallet is null then
     select id into wallet from public.customer_coupons where coupon_id=c.id and user_id=p_member;
    end if;
    insert into public.edu_consent_reward_awards(member_id,wallet_id,request_id) values(p_member,wallet,p_request);
   end if;
  end if;
  result:=jsonb_build_object('saved',true,'awarded',exists(select 1 from public.edu_consent_reward_awards where member_id=p_member));
  insert into public.edu_consent_reward_requests(member_id,request_id,payload,result) values(p_member,p_request,p_payload,result);
  return result;
 end if;
 return jsonb_build_object('available',available,'handled',exists(select 1 from public.edu_consent_reward_requests where member_id=p_member),
  'personalRevision',personal->'revision','marketingRevision',marketing->'revision','terms',personal->'terms',
  'reward',jsonb_build_object('days',cfg.valid_days,'minimum',c.minimum_order_amount),'awarded',a.member_id is not null);
end$$;
revoke all on function public.edu_consent_reward(uuid,uuid,jsonb),public.edu_consent_reward_config_immutable() from public,anon,authenticated;
grant execute on function public.edu_consent_reward(uuid,uuid,jsonb) to service_role;

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
  -- A shared reward code must not bypass the explicit consent-and-issue transaction.
  if exists(select 1 from public.edu_consent_reward_config where coupon_id=c.id) and not exists(
    select 1 from public.edu_consent_reward_awards a join public.customer_coupons w on w.id=a.wallet_id
    where a.member_id=p_user and w.user_id=p_user and w.coupon_id=c.id) then raise exception 'COUPON_MEMBER_NOT_ELIGIBLE';end if;
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


commit;
