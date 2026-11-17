-- Shared links are opt-in; existing individual invitations keep their access rules.
alter table public.edu_event_zones add column shared_link boolean not null default false;

create or replace function public.edu_event_claim(p_user uuid,p_slug text,p_hash text,p_live boolean default false)
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
  if not z.shared_link then
  select * into i from public.edu_event_invites where zone_id=z.id and token_hash=p_hash and revoked_at is null for update;
  if not found or (i.user_id is not null and i.user_id<>p_user) then raise exception 'EVENT_INVITE_REQUIRED';end if;
  end if;
  insert into public.customer_coupons(coupon_id,user_id,expires_at)
  select c.id,p_user,c.ends_at from public.coupons c where c.id=z.bonus_coupon_id
  on conflict(coupon_id,user_id) do nothing;
  select id into wallet from public.customer_coupons where coupon_id=z.bonus_coupon_id and user_id=p_user and status<>'revoked';
  if wallet is null then raise exception 'COUPON_REVOKED';end if;
  insert into public.edu_event_awards(zone_id,user_id,wallet_id) values(z.id,p_user,wallet);
  if not z.shared_link then
   update public.edu_event_invites set user_id=p_user,claimed_at=now() where id=i.id;
  end if;
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

create or replace function public.edu_event_save(p_actor uuid,p_values jsonb,p_expected uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare z public.edu_event_zones%rowtype; live public.coupons%rowtype; bonus uuid; course uuid; zid uuid; deadline timestamptz; expiry timestamptz; live_expiry timestamptz;
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
 deadline:=(p_values->>'claimEndsAt')::timestamptz;expiry:=(p_values->>'couponEndsAt')::timestamptz;live_expiry:=(p_values->>'liveEndsAt')::timestamptz;
 if deadline is null or expiry is null or live_expiry is null or deadline>expiry then raise exception 'EVENT_INVALID';end if;
 if z.id is not null and (z.cohort_id<>(p_values->>'cohortId')::uuid or z.live_coupon_id<>live.id) then raise exception 'EVENT_TARGET_IMMUTABLE';end if;
 update public.coupons set ends_at=live_expiry where id=live.id;
 zid:=coalesce(z.id,gen_random_uuid());bonus:=coalesce(z.bonus_coupon_id,gen_random_uuid());
 if z.id is null then
  insert into public.coupons(id,name,code,discount_type,discount_value,per_user_limit,product_scope,exclude_free,issue_target,issue_end_at,ends_at,created_by)
  values(bonus,'이벤트 당첨 10만원','WIN_'||upper(substr(replace(bonus::text,'-',''),1,24)),'fixed',100000,1,'specific',true,'all',deadline,expiry,p_actor);
  insert into public.coupon_products(coupon_id,course_id) values(bonus,course);
 else
  update public.coupons set issue_end_at=deadline,ends_at=expiry where id=bonus;
 end if;
 insert into public.edu_event_zones(id,slug,title,description,cohort_id,live_coupon_id,bonus_coupon_id,claim_ends_at,enabled,resources,shared_link)
 values(zid,p_values->>'slug',p_values->>'title',p_values->>'description',(p_values->>'cohortId')::uuid,live.id,bonus,deadline,(p_values->>'enabled')::boolean,p_values->'resources',coalesce((p_values->>'sharedLink')::boolean,z.shared_link,false))
 on conflict(id) do update set title=excluded.title,description=excluded.description,claim_ends_at=excluded.claim_ends_at,enabled=excluded.enabled,resources=excluded.resources,shared_link=excluded.shared_link,revision=gen_random_uuid();
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(p_actor,'campus.event.saved','event_zone',zid::text);
 return zid;
end; $$;

revoke all on function public.edu_event_claim(uuid,text,text,boolean),public.edu_event_save(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edu_event_claim(uuid,text,text,boolean),public.edu_event_save(uuid,jsonb,uuid) to service_role;
