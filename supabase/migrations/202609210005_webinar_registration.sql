begin;
create table public.edu_webinar_campaigns (
 period_id text primary key references public.edu_recruitment_links(period_id),
 id uuid not null unique default gen_random_uuid(), free_course_id uuid not null references public.courses(id),
 paid_cohort_id uuid unique references public.cohorts(id), enabled boolean not null default false,
 revision integer not null check(revision>0), updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table public.edu_webinar_registrations (
 id uuid primary key default gen_random_uuid(), period_id text not null references public.edu_webinar_campaigns(period_id),
 user_id uuid references public.profiles(id) on delete set null,
 channel text not null check(channel in ('paid','organic','unknown')),
 policy_version text not null, registered_at timestamptz not null default now(),
 unique(period_id,user_id)
);
create table public.edu_webinar_campaign_history (
 period_id text not null, revision integer not null, free_course_id uuid not null, paid_cohort_id uuid,
 enabled boolean not null, actor_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),primary key(period_id,revision)
);
alter table public.edu_webinar_campaigns enable row level security;
alter table public.edu_webinar_registrations enable row level security;
alter table public.edu_webinar_campaign_history enable row level security;
revoke all on public.edu_webinar_campaigns,public.edu_webinar_registrations,public.edu_webinar_campaign_history from public,anon,authenticated,service_role;
create function public.edu_manage_webinar(p_actor uuid,p_period text,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; item public.edu_webinar_campaigns%rowtype; v_free uuid; v_paid uuid; can_orders boolean; report jsonb:=null;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if permissions->'marketing' is distinct from 'true'::jsonb or permissions->'products' is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 can_orders:=actor.role='admin' or permissions->'orders'='true'::jsonb;
 perform pg_catalog.pg_advisory_xact_lock(207260921,4);
 select * into item from public.edu_webinar_campaigns where period_id=p_period for update;
 if p_settings is not null then
  if jsonb_typeof(p_settings)<>'object' or not(p_settings ?& array['freeCourse','paidCohort','enabled','expected'])
   or p_settings-array['freeCourse','paidCohort','enabled','expected']<>'{}'::jsonb
   or jsonb_typeof(p_settings->'enabled')<>'boolean' then raise exception 'CONVERSION_INVALID'; end if;
  if (p_settings->>'expected')::integer is distinct from coalesce(item.revision,0) then raise exception 'CONVERSION_STALE'; end if;
  v_free:=(p_settings->>'freeCourse')::uuid;v_paid:=(p_settings->>'paidCohort')::uuid;
  if (p_settings->>'enabled')::boolean then
   perform 1 from public.courses where id=v_free and category='free' and list_price=0 and status='published' for share;
   if not found then raise exception 'CONVERSION_INVALID'; end if;
  end if;
  if v_paid is not null and not exists(select 1 from public.cohorts c join public.courses s on s.id=c.course_id where c.id=v_paid and c.course_id<>v_free and s.category='paid_class') then raise exception 'CONVERSION_INVALID'; end if;
  -- Once applications exist, do not silently move them to another product/cohort.
  if exists(select 1 from public.edu_webinar_registrations where period_id=p_period)
   and (item.free_course_id is distinct from v_free or (item.paid_cohort_id is not null and item.paid_cohort_id is distinct from v_paid)) then raise exception 'CONVERSION_STALE'; end if;
  insert into public.edu_webinar_campaigns(period_id,free_course_id,paid_cohort_id,enabled,revision,updated_by)
  values(p_period,v_free,v_paid,(p_settings->>'enabled')::boolean,1,p_actor)
  on conflict(period_id) do update set free_course_id=excluded.free_course_id,paid_cohort_id=excluded.paid_cohort_id,enabled=excluded.enabled,revision=edu_webinar_campaigns.revision+1,updated_by=p_actor,updated_at=now() returning * into item;
  insert into public.edu_webinar_campaign_history values(item.period_id,item.revision,item.free_course_id,item.paid_cohort_id,item.enabled,p_actor,now());
 end if;
 if item.paid_cohort_id is not null and can_orders then
  with candidates as (
   select o.id,o.user_id,o.total_amount from public.orders o
   where o.total_amount>0 and o.paid_at is not null and o.paid_at<=now() and o.status in ('paid','partially_refunded','refunded') and o.currency='KRW'
    and exists(select 1 from public.edu_webinar_registrations r where r.period_id=p_period and r.user_id=o.user_id and o.paid_at>=r.registered_at)
    and exists(select 1 from public.order_items oi where oi.order_id=o.id and oi.cohort_id=item.paid_cohort_id)
  ), eligible as (
   select c.* from candidates c where (select count(*) from public.order_items oi where oi.order_id=c.id)=1
  ), totals as (
   select e.id,e.user_id,sum(p.approved_amount)::bigint as gross,sum(p.cancelled_amount)::bigint as refunds
   from eligible e join public.payments p on p.order_id=e.id and p.status in ('done','partial_cancelled','cancelled') and p.approved_amount>0 group by e.id,e.user_id,e.total_amount having count(*)=1 and sum(p.approved_amount)=e.total_amount
  ) select jsonb_build_object('orders',count(*),'buyers',count(distinct user_id),'gross',coalesce(sum(gross),0),'refunds',coalesce(sum(refunds),0),'net',coalesce(sum(gross-refunds),0),
   'needs_review',(select count(*) from candidates)-(select count(*) from totals),'as_of',now()) into report from totals;
 end if;
 return jsonb_build_object('campaign',case when item.id is null then null else jsonb_build_object('id',item.id,'freeCourse',item.free_course_id,'paidCohort',item.paid_cohort_id,'enabled',item.enabled,'revision',item.revision) end,
  'registrations',(select count(*) from public.edu_webinar_registrations where period_id=p_period),'participation',null,'purchases',report,
  'purchase_state',case when item.paid_cohort_id is null then 'unmapped' when not coalesce(can_orders,false) then 'forbidden' else 'ready' end);
end;
$$;
create function public.edu_webinar_application(p_code uuid,p_user uuid,p_channel text,p_register boolean default false,p_expected integer default null,p_policy text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.edu_webinar_campaigns%rowtype; application public.edu_webinar_registrations%rowtype;
begin
 if p_channel is null or p_channel not in ('paid','organic','unknown') then raise exception 'CONVERSION_INVALID'; end if;
 select * into item from public.edu_webinar_campaigns where id=p_code and enabled for update;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 perform 1 from public.courses where id=item.free_course_id and category='free' and list_price=0 and status='published' for share;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 if p_user is not null then
  perform 1 from public.profiles where id=p_user and status='active' for share;
  if not found then raise exception 'CONVERSION_FORBIDDEN'; end if;
  select * into application from public.edu_webinar_registrations where period_id=item.period_id and user_id=p_user;
 end if;
 if p_register then
  if p_user is null then raise exception 'CONVERSION_FORBIDDEN'; end if;
  if p_expected is distinct from item.revision then raise exception 'CONVERSION_STALE'; end if;
  if p_policy is null or p_policy !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'CONVERSION_INVALID'; end if;
  if application.id is null then
   insert into public.edu_webinar_registrations(period_id,user_id,channel,policy_version) values(item.period_id,p_user,p_channel,p_policy) returning * into application;
  end if;
 end if;
 return jsonb_build_object('revision',item.revision,'registered',application.id is not null,'registered_at',application.registered_at);
end;
$$;
revoke all on function public.edu_manage_webinar(uuid,text,jsonb),public.edu_webinar_application(uuid,uuid,text,boolean,integer,text) from public,anon,authenticated;
grant execute on function public.edu_manage_webinar(uuid,text,jsonb),public.edu_webinar_application(uuid,uuid,text,boolean,integer,text) to service_role;
commit;
