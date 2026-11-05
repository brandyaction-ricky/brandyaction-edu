begin;

-- Private bucket: no anonymous or authenticated policies. Short signed downloads only.
insert into storage.buckets(id,name,public,file_size_limit) values('campus-event-assets','campus-event-assets',false,20971520);

-- Link-only winner zones. No public table grants; all writes pass bounded server APIs.
create table public.edu_event_zones (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 title text not null, description text not null default '', cohort_id uuid not null references public.cohorts(id),
 live_coupon_id uuid not null references public.coupons(id), bonus_coupon_id uuid not null unique references public.coupons(id),
 claim_ends_at timestamptz not null, enabled boolean not null default false, resources jsonb not null default '[]',
 revision uuid not null default gen_random_uuid(), created_at timestamptz not null default now(),
 check(live_coupon_id<>bonus_coupon_id), check(jsonb_typeof(resources)='array' and jsonb_array_length(resources)<=12)
);
create table public.edu_event_invites (
 id uuid primary key default gen_random_uuid(), zone_id uuid not null references public.edu_event_zones(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), label text not null default '',
 user_id uuid references public.profiles(id), claimed_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index edu_event_invites_zone on public.edu_event_invites(zone_id,created_at);
create table public.edu_event_awards (
 zone_id uuid not null references public.edu_event_zones(id), user_id uuid not null references public.profiles(id),
 wallet_id uuid not null references public.customer_coupons(id), created_at timestamptz not null default now(),
 primary key(zone_id,user_id)
);
create index edu_event_awards_user on public.edu_event_awards(user_id,created_at);
create table public.edu_event_actions (
 id bigint generated always as identity primary key, zone_id uuid not null references public.edu_event_zones(id),
 user_id uuid not null references public.profiles(id), action text not null check(action in ('download','detail','live_claim')),
 target text, created_at timestamptz not null default now()
);
create index edu_event_actions_zone_time on public.edu_event_actions(zone_id,created_at);

alter table public.edu_event_zones enable row level security;
alter table public.edu_event_invites enable row level security;
alter table public.edu_event_awards enable row level security;
alter table public.edu_event_actions enable row level security;
revoke all on public.edu_event_zones,public.edu_event_invites,public.edu_event_awards,public.edu_event_actions from anon,authenticated;
grant all on public.edu_event_zones,public.edu_event_invites,public.edu_event_awards,public.edu_event_actions to service_role;
grant usage,select on sequence public.edu_event_actions_id_seq to service_role;

-- Preserve existing one-coupon callers while recording both coupons separately.
alter table public.coupon_redemptions drop constraint coupon_redemptions_order_id_key;
alter table public.coupon_redemptions add constraint coupon_redemptions_order_coupon_key unique(order_id,coupon_id);
alter table public.orders add column coupon_codes text[];

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
  if exists(select 1 from public.edu_event_zones where bonus_coupon_id=c.id) and not exists(
    select 1 from public.edu_event_awards a join public.edu_event_zones z on z.id=a.zone_id
    join public.customer_coupons w on w.id=a.wallet_id
    where a.user_id=p_user and z.bonus_coupon_id=c.id and z.cohort_id=p_cohort and w.status<>'revoked'
  ) then raise exception 'COUPON_MEMBER_NOT_ELIGIBLE'; end if;
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



create function public.edu_event_quote(p_user uuid,p_cohort uuid,p_code text,p_order uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare codes text[]; c text; q jsonb; lines jsonb:='[]'; base integer; remaining integer; discount integer; first_id uuid;
begin
 codes:=case when nullif(trim(p_code),'') is null then array[]::text[] else string_to_array(upper(trim(p_code)),'+') end;
 if cardinality(codes)>2 or exists(select 1 from unnest(codes) x where x !~ '^[A-Z0-9_-]{3,30}$')
 or cardinality(codes)<>(select count(distinct x) from unnest(codes) x) then raise exception 'COUPON_INVALID'; end if;
 -- A consistent coupon lock order covers reversed inputs and simultaneous claims.
 perform 1 from public.coupons where code=any(codes) order by id for update;
 if cardinality(codes)=2 then
   select array[l.code,b.code] into codes from public.edu_event_zones z
   join public.coupons l on l.id=z.live_coupon_id join public.coupons b on b.id=z.bonus_coupon_id
   join public.edu_event_awards a on a.zone_id=z.id and a.user_id=p_user
   where z.cohort_id=p_cohort and l.code=any(codes) and b.code=any(codes) limit 1;
   if codes is null then raise exception 'COUPON_STACK_NOT_ALLOWED'; end if;
 end if;
 q:=public.edu_coupon_quote(p_user,p_cohort,null,p_order);
 base:=(q->>'originalAmount')::integer; remaining:=base;
 foreach c in array codes loop
   q:=public.edu_coupon_quote(p_user,p_cohort,c,p_order);
   discount:=least(remaining,(q->>'couponDiscount')::integer);
   if discount=0 then continue;end if; -- Do not consume an unused second coupon.
   if first_id is null then first_id:=(q->>'couponId')::uuid;end if;
   remaining:=remaining-discount;
   lines:=lines||jsonb_build_array(q||jsonb_build_object('couponDiscount',discount,'totalAmount',remaining));
 end loop;
 codes:=array(select value->>'couponCode' from jsonb_array_elements(lines));
 return jsonb_build_object('couponId',first_id,'couponCode',nullif(array_to_string(codes,'+'),''),
 'couponName',case when cardinality(codes)=2 then '라이브 + 이벤트 중복 할인' else lines->0->>'couponName' end,
 'coupons',lines,'couponDiscount',base-remaining,'originalAmount',base,'totalAmount',remaining);
end; $$;

create or replace function public.apply_coupon_to_order(p_order_id uuid,p_user_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; item public.order_items%rowtype; quote jsonb; line jsonb;
begin
 select * into o from public.orders where id=p_order_id and user_id=p_user_id for update;
 if not found or o.status<>'pending' or o.expires_at<=now() then raise exception 'ORDER_NOT_PENDING';end if;
 if exists(select 1 from public.payments where order_id=o.id and status='in_progress') then raise exception 'PAYMENT_ALREADY_PENDING';end if;
 select * into item from public.order_items where order_id=o.id order by created_at limit 1;
 if not found then raise exception 'ORDER_ITEM_NOT_FOUND';end if;
 quote:=public.edu_event_quote(p_user_id,item.cohort_id,p_code,p_order_id);
 update public.coupon_redemptions set status='released' where order_id=o.id and status='reserved';
 for line in select value from jsonb_array_elements(quote->'coupons') loop
   insert into public.coupon_redemptions(coupon_id,order_id,user_id,original_amount,discount_amount,final_amount,status)
   values((line->>'couponId')::uuid,o.id,p_user_id,(quote->>'originalAmount')::integer,(line->>'couponDiscount')::integer,(quote->>'totalAmount')::integer,'reserved')
   on conflict(order_id,coupon_id) do update set original_amount=excluded.original_amount,discount_amount=excluded.discount_amount,
   final_amount=excluded.final_amount,status='reserved',used_at=null,cancelled_at=null;
   insert into public.customer_coupons(coupon_id,user_id,expires_at)
   select c.id,p_user_id,c.ends_at from public.coupons c where c.id=(line->>'couponId')::uuid and c.discount_type<>'ADMIN_FREE'
   on conflict(coupon_id,user_id) do nothing;
 end loop;
 update public.orders set coupon_id=(quote->>'couponId')::uuid,coupon_code=quote->>'couponCode',
 coupon_codes=array(select value->>'couponCode' from jsonb_array_elements(quote->'coupons')),
 subtotal=greatest(subtotal,(quote->>'originalAmount')::integer),
 discount_amount=greatest(subtotal,(quote->>'originalAmount')::integer)-(quote->>'totalAmount')::integer,
 total_amount=(quote->>'totalAmount')::integer where id=o.id;
 return quote;
end; $$;

-- Payment success/failure/refund must update both wallets; old replaced coupons stay released.
create or replace function public.sync_coupon_redemption_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; total_used integer; member_used integer; codes text[];
begin
 codes:=coalesce(new.coupon_codes,array[new.coupon_code]);
 if new.status='paid' and old.status is distinct from 'paid' then
  for c in select * from public.coupons where code=any(codes) order by id for update loop
   if c.discount_type='ADMIN_FREE' and not exists(select 1 from public.profiles where id=new.user_id and role='admin' and status='active') then raise exception 'COUPON_ADMIN_ONLY';end if;
   if not exists(select 1 from public.coupon_redemptions r where r.order_id=new.id and r.coupon_id=c.id and r.user_id=new.user_id and r.status in ('reserved','released')) then raise exception 'COUPON_REDEMPTION_MISSING';end if;
   select count(*),count(*) filter(where r.user_id=new.user_id) into total_used,member_used
   from public.coupon_redemptions r join public.orders o on o.id=r.order_id where r.coupon_id=c.id and r.order_id<>new.id
   and (r.status='used' or (r.status='reserved' and o.status='pending' and o.expires_at>now()));
   if c.usage_limit is not null and total_used>=c.usage_limit then raise exception 'COUPON_SOLD_OUT';end if;
   if c.per_user_limit is not null and member_used>=c.per_user_limit then raise exception 'COUPON_USER_LIMIT';end if;
  end loop;
  update public.coupon_redemptions r set status='used',used_at=coalesce(used_at,new.paid_at,now())
  where order_id=new.id and status in ('reserved','released') and exists(select 1 from public.coupons chosen where chosen.id=r.coupon_id and chosen.code=any(codes));
 elsif new.status in ('cancelled','refunded') and old.status is distinct from new.status then
  update public.coupon_redemptions set status=case when status='used' then 'cancelled' else 'released' end,cancelled_at=now() where order_id=new.id and status in ('used','reserved');
 elsif new.status='payment_failed' and old.status is distinct from new.status then
  update public.coupon_redemptions set status='released' where order_id=new.id and status='reserved';
 end if;
 return new;
end; $$;

-- Claims are atomic and idempotent. Tokens are stored hashed; the first account binds an invitation.
create function public.edu_event_claim(p_user uuid,p_slug text,p_hash text,p_live boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare z public.edu_event_zones%rowtype; i public.edu_event_invites%rowtype; wallet uuid;
begin
 if not exists(select 1 from public.profiles where id=p_user and status='active') then raise exception 'AUTH_REQUIRED';end if;
 select * into z from public.edu_event_zones where slug=p_slug and enabled for update;
 if not found then raise exception 'EVENT_UNAVAILABLE';end if;
 perform 1 from public.coupons where id in(z.live_coupon_id,z.bonus_coupon_id) order by id for update;
 if not exists(select 1 from public.edu_event_awards where zone_id=z.id and user_id=p_user) then
  if z.claim_ends_at<=now() then raise exception 'EVENT_CLAIM_ENDED';end if;
  if not exists(select 1 from public.coupons where id=z.bonus_coupon_id and is_active and not is_draft and (ends_at is null or ends_at>now()) and (issue_start_at is null or issue_start_at<=now()) and (issue_end_at is null or issue_end_at>now())) then raise exception 'COUPON_INACTIVE';end if;
  select * into i from public.edu_event_invites where zone_id=z.id and token_hash=p_hash and revoked_at is null for update;
  if not found or (i.user_id is not null and i.user_id<>p_user) then raise exception 'EVENT_INVITE_REQUIRED';end if;
  insert into public.customer_coupons(coupon_id,user_id,expires_at)
  select c.id,p_user,c.ends_at from public.coupons c where c.id=z.bonus_coupon_id
  on conflict(coupon_id,user_id) do nothing;
  select id into wallet from public.customer_coupons where coupon_id=z.bonus_coupon_id and user_id=p_user and status<>'revoked';
  if wallet is null then raise exception 'COUPON_REVOKED';end if;
  insert into public.edu_event_awards(zone_id,user_id,wallet_id) values(z.id,p_user,wallet);
  update public.edu_event_invites set user_id=p_user,claimed_at=now() where id=i.id;
 end if;
 if exists(select 1 from public.edu_event_awards a join public.customer_coupons w on w.id=a.wallet_id where a.zone_id=z.id and a.user_id=p_user and w.status='revoked') then raise exception 'COUPON_REVOKED';end if;
 if p_live then
  perform public.edu_coupon_quote(p_user,z.cohort_id,(select code from public.coupons where id=z.live_coupon_id));
  insert into public.customer_coupons(coupon_id,user_id,expires_at)
  select c.id,p_user,c.ends_at from public.coupons c where c.id=z.live_coupon_id
  on conflict(coupon_id,user_id) do nothing;
  insert into public.edu_event_actions(zone_id,user_id,action) values(z.id,p_user,'live_claim');
 end if;
end; $$;

-- Only the named pair may stack. Configuration does not alter an existing live coupon.
create function public.edu_event_save(p_actor uuid,p_values jsonb,p_expected uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare z public.edu_event_zones%rowtype; live public.coupons%rowtype; bonus uuid; course uuid; zid uuid; deadline timestamptz; expiry timestamptz;
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) then raise exception 'ADMIN_REQUIRED';end if;
 select * into z from public.edu_event_zones where slug=p_values->>'slug' for update;
 if (z.id is not null and z.revision is distinct from p_expected) or (z.id is null and p_expected is not null) then raise exception 'EVENT_CONFLICT';end if;
 select course_id into course from public.cohorts where id=(p_values->>'cohortId')::uuid and status<>'archived';
 if course is null then raise exception 'COHORT_NOT_FOUND';end if;
 perform 1 from public.coupons where code='1108' or id=z.bonus_coupon_id order by id for update;
 select * into live from public.coupons where code='1108';
 if not found or live.discount_type<>'fixed' or live.discount_value<>300000 or not live.is_active or live.is_draft then raise exception 'EVENT_LIVE_COUPON_REQUIRED';end if;
 if live.product_scope='specific' and not exists(select 1 from public.coupon_products where coupon_id=live.id and course_id=course) then raise exception 'COUPON_PRODUCT_MISMATCH';end if;
 deadline:=(p_values->>'claimEndsAt')::timestamptz;expiry:=(p_values->>'couponEndsAt')::timestamptz;
 if deadline is null or expiry is null or deadline>expiry then raise exception 'EVENT_INVALID';end if;
 if z.id is not null and (z.cohort_id<>(p_values->>'cohortId')::uuid or z.live_coupon_id<>live.id) then raise exception 'EVENT_TARGET_IMMUTABLE';end if;
 zid:=coalesce(z.id,gen_random_uuid());bonus:=coalesce(z.bonus_coupon_id,gen_random_uuid());
 if z.id is null then
  insert into public.coupons(id,name,code,discount_type,discount_value,per_user_limit,product_scope,exclude_free,issue_target,issue_end_at,ends_at,created_by)
  values(bonus,'이벤트 당첨 10만원','WIN_'||upper(substr(replace(bonus::text,'-',''),1,24)),'fixed',100000,1,'specific',true,'all',deadline,expiry,p_actor);
  insert into public.coupon_products(coupon_id,course_id) values(bonus,course);
 else
  update public.coupons set issue_end_at=deadline,ends_at=expiry where id=bonus;
 end if;
 insert into public.edu_event_zones(id,slug,title,description,cohort_id,live_coupon_id,bonus_coupon_id,claim_ends_at,enabled,resources)
 values(zid,p_values->>'slug',p_values->>'title',p_values->>'description',(p_values->>'cohortId')::uuid,live.id,bonus,deadline,(p_values->>'enabled')::boolean,p_values->'resources')
 on conflict(id) do update set title=excluded.title,description=excluded.description,claim_ends_at=excluded.claim_ends_at,enabled=excluded.enabled,resources=excluded.resources,revision=gen_random_uuid();
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(p_actor,'campus.event.saved','event_zone',zid::text);
 return zid;
end; $$;

revoke all on function public.edu_event_quote(uuid,uuid,text,uuid),public.edu_event_claim(uuid,text,text,boolean),public.edu_event_save(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edu_event_quote(uuid,uuid,text,uuid),public.edu_event_claim(uuid,text,text,boolean),public.edu_event_save(uuid,jsonb,uuid) to service_role;
-- Auto-apply only coupons already issued to this account; never enumerate public codes.
create function public.edu_event_owned_quote(p_user uuid,p_cohort uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare z record; code text; codes text[]; q jsonb; best jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_user and status='active') then raise exception 'AUTH_REQUIRED';end if;
 perform 1 from public.coupons c where exists(select 1 from public.edu_event_zones target_zone join public.edu_event_awards a on a.zone_id=target_zone.id and a.user_id=p_user where target_zone.cohort_id=p_cohort and c.id in(target_zone.live_coupon_id,target_zone.bonus_coupon_id)) order by c.id for update;
 for z in select e.* from public.edu_event_zones e join public.edu_event_awards a on a.zone_id=e.id and a.user_id=p_user where e.cohort_id=p_cohort order by e.id loop
  select array_agg(c.code order by c.id) into codes from public.coupons c join public.customer_coupons w on w.coupon_id=c.id
  where c.id in(z.live_coupon_id,z.bonus_coupon_id) and w.user_id=p_user and w.status='available' and (w.expires_at is null or w.expires_at>now());
  if codes is null then continue;end if;
  foreach code in array array_prepend(array_to_string(codes,'+'),codes) loop
   begin
    q:=public.edu_event_quote(p_user,p_cohort,code);
    if best is null or (q->>'couponDiscount')::integer>(best->>'couponDiscount')::integer then best:=q;end if;
   exception when raise_exception then
    if sqlerrm not like 'COUPON_%' then raise;end if;
   end;
  end loop;
 end loop;
 return best;
end; $$;

create function public.edu_event_stats(p_zone uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('awards',(select count(*) from public.edu_event_awards where zone_id=p_zone),
 'downloads',(select count(*) from public.edu_event_actions where zone_id=p_zone and action='download'),
 'details',(select count(*) from public.edu_event_actions where zone_id=p_zone and action='detail'),
 'used',(select count(*) from public.coupon_redemptions r join public.edu_event_zones z on z.bonus_coupon_id=r.coupon_id where z.id=p_zone and r.status='used'));
$$;

create function public.edu_event_invite_batch(p_actor uuid,p_zone uuid,p_rows jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) then raise exception 'ADMIN_REQUIRED';end if;
 perform 1 from public.edu_event_zones where id=p_zone for update;
 if not found or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'EVENT_INVALID';end if;
 if (select count(*) from public.edu_event_invites where zone_id=p_zone)+jsonb_array_length(p_rows)>1000 then raise exception 'EVENT_INVITE_LIMIT';end if;
 insert into public.edu_event_invites(id,zone_id,label,token_hash)
 select (r->>'id')::uuid,p_zone,r->>'label',r->>'token_hash' from jsonb_array_elements(p_rows) r;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data) values(p_actor,'campus.event.invites_created','event_zone',p_zone::text,jsonb_build_object('count',jsonb_array_length(p_rows)));
end; $$;
revoke all on function public.edu_event_owned_quote(uuid,uuid),public.edu_event_stats(uuid),public.edu_event_invite_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_event_owned_quote(uuid,uuid),public.edu_event_stats(uuid),public.edu_event_invite_batch(uuid,uuid,jsonb) to service_role;

commit;
