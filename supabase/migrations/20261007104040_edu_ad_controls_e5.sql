begin;
set local lock_timeout='5s';

create table public.edu_ad_control_policies (
 cohort_id uuid primary key references public.cohorts(id),
 enabled boolean not null default false,
 budget_krw bigint not null check(budget_krw between 1 and 1000000000),
 ads_start date not null, ads_end date not null, sales_end date not null,
 mode text not null check(mode in ('auto','freeze','release')),
 reason text not null check(length(btrim(reason)) between 3 and 500),
 override_until timestamptz, revision integer not null check(revision>0),
 updated_at timestamptz not null,
 check(ads_start<=ads_end and ads_end<=sales_end and sales_end-ads_start<=180),
 check((mode='auto' and override_until is null) or
       (mode<>'auto' and override_until>updated_at and override_until<=updated_at+interval '72 hours'))
);
create table public.edu_ad_control_history (
 id bigint generated always as identity primary key,
 cohort_id uuid not null references public.cohorts(id),
 actor_id uuid references public.profiles(id) on delete set null,
 occurred_at timestamptz not null,
 revision integer not null, policy jsonb not null,
 unique(cohort_id,revision)
);
create index edu_ad_control_history_cutoff on public.edu_ad_control_history(cohort_id,occurred_at desc,revision desc);
alter table public.edu_ad_control_policies enable row level security;
alter table public.edu_ad_control_history enable row level security;
revoke all on public.edu_ad_control_policies,public.edu_ad_control_history from public,anon,authenticated,service_role;
grant select,insert,update on public.edu_ad_control_policies to service_role;
grant select,insert on public.edu_ad_control_history to service_role;
grant usage,select on sequence public.edu_ad_control_history_id_seq to service_role;

-- The app checks the server-only representative allowlist. Only its service role can invoke this RPC.
-- Lock even a not-yet-created policy; optimistic revision prevents lost updates and duplicate retries.
create function public.edu_ad_control_save(p_actor uuid,p_policy jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid=(p_policy->>'cohort_id')::uuid; old_revision integer; stamp timestamptz=clock_timestamp();
 v public.edu_ad_control_policies; hours integer=(p_policy->>'hours')::integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'AD_CONTROL_DENIED'; end if;
 if p_policy is null or hours not between 1 and 72 or jsonb_typeof(p_policy->'enabled')<>'boolean'
    or p_policy->>'mode' not in ('auto','freeze','release') then raise exception 'AD_CONTROL_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select revision into old_revision from public.edu_ad_control_policies where cohort_id=c for update;
 if coalesce(old_revision,0) is distinct from (p_policy->>'revision')::integer then raise exception 'AD_CONTROL_CHANGED'; end if;
 insert into public.edu_ad_control_policies values(c,(p_policy->>'enabled')::boolean,(p_policy->>'budget_krw')::bigint,
  (p_policy->>'ads_start')::date,(p_policy->>'ads_end')::date,(p_policy->>'sales_end')::date,p_policy->>'mode',btrim(p_policy->>'reason'),
  case when p_policy->>'mode'='auto' then null else stamp+make_interval(hours=>hours) end,coalesce(old_revision,0)+1,stamp)
 on conflict(cohort_id) do update set enabled=excluded.enabled,budget_krw=excluded.budget_krw,
  ads_start=excluded.ads_start,ads_end=excluded.ads_end,sales_end=excluded.sales_end,mode=excluded.mode,reason=excluded.reason,
  override_until=excluded.override_until,revision=excluded.revision,updated_at=excluded.updated_at returning * into v;
 insert into public.edu_ad_control_history(cohort_id,actor_id,occurred_at,revision,policy) values(c,p_actor,stamp,v.revision,to_jsonb(v));
 return to_jsonb(v);
end $$;

-- Private source only. No contact details, diagnosis, raw reason or actor ever enters the export.
-- Settings are reconstructed as of each day, so today's release cannot change yesterday's controls.
create function public.edu_ad_control_source(p_from date,p_to date,p_asof timestamptz)
returns jsonb language sql stable security invoker set search_path='' set statement_timeout='4s' as $$
with days as (
 select d::date as day,least(p_asof,((d::date+1)::timestamp at time zone 'Asia/Seoul')-interval '1 millisecond') cutoff
 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
 where p_from is not null and p_to>=p_from and p_to-p_from<=30 and p_asof<=statement_timestamp()
), states as (
 select d.*,h.cohort_id,h.policy,c.operation_end_at,s.course_code||':'||c.cohort_code cohort_code,
  (h.policy->>'ads_start')::date ads_start,(h.policy->>'ads_end')::date ads_end,(h.policy->>'sales_end')::date sales_end,
  least((h.policy->>'ads_end')::date,case when d.cutoff<((d.day+1)::timestamp at time zone 'Asia/Seoul')-interval '1 millisecond' then d.day-1 else d.day end) metric_day
 from days d cross join public.cohorts c join public.courses s on s.id=c.course_id
 join lateral(select * from public.edu_ad_control_history h where h.cohort_id=c.id and h.occurred_at<=d.cutoff order by h.occurred_at desc,h.revision desc limit 1) h on true
 where (h.policy->>'enabled')::boolean and (h.policy->>'ads_start')::date<=d.day
), campaigns as (
 select distinct st.day,st.cohort_id,c.id,c.meta_campaign_ids,c.meta_sync_status,c.meta_last_synced_at
 from states st join public.edu_webinar_campaigns w on w.paid_cohort_id=st.cohort_id
 join public.edu_recruitment_marketing_links l on l.period_id=w.period_id
 join public.landing_campaigns c on c.id=l.campaign_id and c.uses_ads
), snapshots as (
 select st.*,financial.net_krw,financial.valid ledger_valid,
  -- The promised denominator/history needed for provisional reserves is not yet authoritative.
  -- Keep it unknown until maturity, never replace the reserve with zero during a course.
  case when st.operation_end_at is not null and st.cutoff>=st.operation_end_at+interval '7 days' then 0 else null end reserve_krw,
  (select count(*) from public.edu_refund_requests r join public.payments p on p.id=r.payment_id
   join public.edu_analytics_orders o on o.id=p.order_id
   where exists(select 1 from public.order_items i where i.order_id=o.id and i.cohort_id=st.cohort_id)
    and (r.created_at at time zone 'Asia/Seoul')::date=st.day and r.created_at<=st.cutoff) refund_requests,
  meta.spend_krw,meta.complete spend_complete,
  (select jsonb_agg(to_jsonb(x)) from (
    select target.day,coalesce(sum(m.spend),0) spend,
     bool_and(m.day is not null and m.synced_at<=p_asof and c.meta_sync_status='success'
       and c.meta_last_synced_at>=((target.day+1)::timestamp at time zone 'Asia/Seoul')) complete,
     sum(a.kakao_members-b.kakao_members) joins,
     bool_and(a.kakao_members is not null and b.kakao_members is not null and a.kakao_members>=b.kakao_members) joins_complete
    from (values(st.metric_day),(st.metric_day-1)) target(day)
    join campaigns c on c.day=st.day and c.cohort_id=st.cohort_id
    left join lateral(select sum(m.spend) spend,max(m.synced_at) synced_at,min(m.day) as day
      from public.landing_campaign_meta_daily m where m.campaign_id=c.id and m.day=target.day and m.meta_campaign_id=any(c.meta_campaign_ids)
      having count(distinct m.meta_campaign_id)=cardinality(c.meta_campaign_ids)) m on true
    left join public.landing_campaign_actuals a on a.campaign_id=c.id and a.day=target.day
    left join public.landing_campaign_actuals b on b.campaign_id=c.id and b.day=target.day-1
    group by target.day
  ) x) cpr_days,
  -- The same Meta campaign mapped to two local campaigns/cohorts would double count its spend.
  (select count(*) from campaigns c cross join lateral unnest(c.meta_campaign_ids) mid where c.day=st.day)
   = (select count(distinct mid) from campaigns c cross join lateral unnest(c.meta_campaign_ids) mid where c.day=st.day) mapping_valid
 from states st
 left join lateral(
  select coalesce(sum(p.approved_amount-coalesce(r.refunded,0)),0) net_krw,
   coalesce(bool_and(p.id is not null and (select count(distinct i.cohort_id) from public.order_items i where i.order_id=o.id)=1),true) valid
  from public.edu_analytics_orders o left join public.payments p on p.order_id=o.id and p.approved_at<=st.cutoff and p.status in ('done','partial_cancelled','cancelled')
  left join lateral(select sum(r.amount) refunded from public.refunds r where r.payment_id=p.id and r.status='done' and r.completed_at<=st.cutoff) r on true
  where o.status in ('paid','partially_refunded','refunded') and o.paid_at<=st.cutoff
   and (o.paid_at at time zone 'Asia/Seoul')::date between st.ads_start and st.sales_end+7
   and exists(select 1 from public.order_items i where i.order_id=o.id and i.cohort_id=st.cohort_id)
 ) financial on true
 left join lateral(
  select sum(m.spend) spend_krw,
   count(*)>0 and bool_and(m.day is not null and m.synced_at<=p_asof and c.meta_sync_status='success'
      and c.meta_last_synced_at>=((d.day+1)::timestamp at time zone 'Asia/Seoul')) complete
  from generate_series(st.ads_start::timestamp,least(st.day,st.ads_end)::timestamp,interval '1 day') d0
  cross join lateral(select d0::date as day) d
  join campaigns c on c.day=st.day and c.cohort_id=st.cohort_id
  left join lateral(select sum(m.spend) spend,max(m.synced_at) synced_at,min(m.day) as day
    from public.landing_campaign_meta_daily m where m.campaign_id=c.id and m.day=d.day and m.meta_campaign_id=any(c.meta_campaign_ids)
    having count(distinct m.meta_campaign_id)=cardinality(c.meta_campaign_ids)) m on true
 ) meta on true
)
select coalesce(jsonb_agg(jsonb_build_object('date_kst',day,'cohort_id',cohort_id,'cohort_code',cohort_code,'policy',policy,
 'spend_krw',case when spend_complete and mapping_valid then spend_krw else null end,
 'cpr_today',(select case when (v->>'complete')::boolean and (v->>'joins_complete')::boolean and (v->>'joins')::numeric>0 and mapping_valid
    then (v->>'spend')::numeric/(v->>'joins')::numeric else null end from jsonb_array_elements(cpr_days) v where (v->>'day')::date=metric_day),
 'cpr_previous',(select case when (v->>'complete')::boolean and (v->>'joins_complete')::boolean and (v->>'joins')::numeric>0 and mapping_valid
    then (v->>'spend')::numeric/(v->>'joins')::numeric else null end from jsonb_array_elements(cpr_days) v where (v->>'day')::date=metric_day-1),
 'net_krw',case when ledger_valid then net_krw else null end,'reserve_krw',reserve_krw,'refund_requests',refund_requests)),'[]'::jsonb)
from snapshots $$;

create function public.edu_export_v1_source_e5(p_from date,p_to date,p_asof timestamptz)
returns jsonb language sql stable security invoker set search_path='' set statement_timeout='4s' as $$
 select public.edu_export_v1_source(p_from,p_to,p_asof)||jsonb_build_object('ad_controls',public.edu_ad_control_source(p_from,p_to,p_asof))
$$;
revoke all on function public.edu_ad_control_save(uuid,jsonb),public.edu_ad_control_source(date,date,timestamptz),public.edu_export_v1_source_e5(date,date,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.edu_ad_control_save(uuid,jsonb),public.edu_ad_control_source(date,date,timestamptz),public.edu_export_v1_source_e5(date,date,timestamptz) to service_role;
commit;
