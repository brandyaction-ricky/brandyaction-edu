begin;
-- One canonical E1/TIPS eligibility source and one snapshot for both populations.
-- Existing purchase fields retain their applicant-only meaning. No ledger writes.
create or replace function public.edu_manage_webinar(p_actor uuid,p_period text,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; item public.edu_webinar_campaigns%rowtype; v_free uuid; v_paid uuid; can_orders boolean; report jsonb:=null; cohort_report jsonb:=null;
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
   select o.id,o.user_id,o.total_amount,exists(select 1 from public.edu_webinar_registrations r where r.period_id=p_period and r.user_id=o.user_id and o.paid_at>=r.registered_at) as applied from public.edu_analytics_orders o
   where o.total_amount>0 and o.paid_at is not null and o.paid_at<=now() and o.status in ('paid','partially_refunded','refunded') and o.currency='KRW'
    and exists(select 1 from public.order_items oi where oi.order_id=o.id and oi.cohort_id=item.paid_cohort_id)
  ), eligible as (
   select c.* from candidates c where (select count(*) from public.order_items oi where oi.order_id=c.id)=1
  ), totals as (
   select e.id,e.user_id,e.applied,sum(p.approved_amount)::bigint as gross,sum(p.cancelled_amount)::bigint as refunds
   from eligible e join public.payments p on p.order_id=e.id and p.status in ('done','partial_cancelled','cancelled') and p.approved_amount>0 group by e.id,e.user_id,e.total_amount,e.applied having count(*)=1 and sum(p.approved_amount)=e.total_amount
  ) select
   jsonb_build_object('orders',count(*) filter(where applied),'buyers',count(distinct user_id) filter(where applied),'gross',coalesce(sum(gross) filter(where applied),0),'refunds',coalesce(sum(refunds) filter(where applied),0),'net',coalesce(sum(gross-refunds) filter(where applied),0),
    'needs_review',(select count(*) from candidates where applied)-(select count(*) from totals where applied),'as_of',now()),
   jsonb_build_object('orders',count(*),'buyers',count(distinct user_id),'gross',coalesce(sum(gross),0),'refunds',coalesce(sum(refunds),0),'net',coalesce(sum(gross-refunds),0),
    'needs_review',(select count(*) from candidates)-(select count(*) from totals),'as_of',now())
   into report,cohort_report from totals;
 end if;
 return jsonb_build_object('campaign',case when item.id is null then null else jsonb_build_object('id',item.id,'freeCourse',item.free_course_id,'paidCohort',item.paid_cohort_id,'enabled',item.enabled,'revision',item.revision) end,
  'registrations',(select count(*) from public.edu_webinar_registrations r join public.edu_analytics_members m on m.id=r.user_id where r.period_id=p_period),'participation',null,'purchases',report,'cohortPurchases',cohort_report,
  'purchase_state',case when item.paid_cohort_id is null then 'unmapped' when not coalesce(can_orders,false) then 'forbidden' else 'ready' end);
end;
$$;


revoke all on function public.edu_manage_webinar(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_manage_webinar(uuid,text,jsonb) to service_role;
commit;
