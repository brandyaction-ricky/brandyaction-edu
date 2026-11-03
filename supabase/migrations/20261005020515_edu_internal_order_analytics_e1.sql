begin;

-- Explicit classification only: a real 1,000 KRW order must remain eligible.
alter table public.profiles add column is_internal boolean not null default false;
alter table public.orders add column is_test_order boolean not null default false;
update public.profiles set is_internal=true where role in ('admin','staff');

-- Profile self-service RLS also permits updates. Keep the new analytics flag
-- server-controlled even when a member can edit the rest of their profile.
create function public.edu_guard_internal_member()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role','supabase_auth_admin') then
  if (tg_op='INSERT' and new.is_internal)
   or (tg_op='UPDATE' and new.is_internal is distinct from old.is_internal)
   or new.role in ('admin','staff') and (tg_op='INSERT' or new.role is distinct from old.role) then
   raise exception 'ANALYTICS_FORBIDDEN';
  end if;
 end if;
 if new.role in ('admin','staff') then new.is_internal:=true; end if;
 return new;
end; $$;
create trigger edu_profiles_internal_guard before insert or update of is_internal,role on public.profiles
 for each row execute function public.edu_guard_internal_member();
create function public.edu_guard_test_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role') and (
  (tg_op='INSERT' and new.is_test_order) or (tg_op='UPDATE' and new.is_test_order is distinct from old.is_test_order)
 ) then raise exception 'ANALYTICS_FORBIDDEN'; end if;
 return new;
end; $$;
create trigger edu_orders_test_guard before insert or update of is_test_order on public.orders
 for each row execute function public.edu_guard_test_order();
revoke all on function public.edu_guard_internal_member(),public.edu_guard_test_order() from public,anon,authenticated,service_role;

-- Shared eligibility source for revenue, acquisition and the later edu_web export.
-- These views are private and do not alter the operational/financial ledger.
create view public.edu_analytics_members with (security_invoker=true) as
 select p.* from public.profiles p
 where p.role not in ('admin','staff') and not p.is_internal and p.status<>'withdrawn' and p.deleted_at is null;
create view public.edu_analytics_orders with (security_invoker=true) as
 select o.* from public.orders o join public.edu_analytics_members p on p.id=o.user_id
 where not o.is_test_order and o.total_amount>0;
revoke all on public.edu_analytics_members,public.edu_analytics_orders from public,anon,authenticated,service_role;
grant select on public.edu_analytics_members,public.edu_analytics_orders to service_role;

create function public.edu_set_analytics_exclusion(p_actor uuid,p_kind text,p_id uuid,p_excluded boolean,p_expected boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous boolean; forced boolean; action_name text;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and status='active' for share;
 if not found then raise exception 'ANALYTICS_FORBIDDEN'; end if;
 if p_id is null or p_excluded is null or p_expected is null or p_kind not in ('member','order')
  or p_kind is null or p_reason is null or length(btrim(p_reason)) not between 2 and 500 then
  raise exception 'ANALYTICS_INVALID';
 end if;
 if p_kind='member' then
  select is_internal,role in ('admin','staff') into previous,forced from public.profiles where id=p_id and status<>'withdrawn' for update;
  if not found then raise exception 'ANALYTICS_NOT_FOUND'; end if;
  if forced and not p_excluded then raise exception 'ANALYTICS_FORCED'; end if;
  action_name:='member.analytics_exclusion';
 else
  select is_test_order into previous from public.orders where id=p_id for update;
  if not found then raise exception 'ANALYTICS_NOT_FOUND'; end if;
  action_name:='order.analytics_exclusion';
 end if;
 if previous is distinct from p_expected then raise exception 'ANALYTICS_STALE'; end if;
 if previous=p_excluded then return jsonb_build_object('excluded',previous,'changed',false); end if;
 if p_kind='member' then update public.profiles set is_internal=p_excluded where id=p_id;
 else update public.orders set is_test_order=p_excluded where id=p_id; end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,action_name,p_kind,p_id::text,jsonb_build_object('excluded',previous),jsonb_build_object('excluded',p_excluded,'reason',btrim(p_reason)));
 return jsonb_build_object('excluded',p_excluded,'changed',true);
end; $$;
revoke all on function public.edu_set_analytics_exclusion(uuid,text,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.edu_set_analytics_exclusion(uuid,text,uuid,boolean,boolean,text) to service_role;

create or replace function public.edu_admin_summary()
returns jsonb language sql stable security definer set search_path='' as $$
 with eligible_payments as (
  select p.* from public.payments p join public.edu_analytics_orders o on o.id=p.order_id
  where o.status in ('paid','partially_refunded','refunded') and p.status in ('done','partial_cancelled','cancelled')
 )
 select jsonb_build_object(
   'members',(select count(*) from public.profiles),
   'activeEnrollments',(select count(*) from public.enrollments where status='active' and revoked_at is null and access_starts_at<=now() and (access_ends_at is null or access_ends_at>now())),
   'pendingReviews',(select count(*) from public.mission_submissions where status='submitted'),
   'openQuestions',(select count(*) from public.edu_questions where status='open' and not is_archived),
   'approvedRevenue',coalesce((select sum(approved_amount) from eligible_payments),0),
   'refundedRevenue',coalesce((select sum(cancelled_amount) from eligible_payments),0),
   'netRevenue',coalesce((select sum(approved_amount-cancelled_amount) from eligible_payments),0)
 );
$$;

create or replace function public.edu_analytics_report(p_from timestamptz,p_to timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with events as (
   select * from public.customer_journey_events e
   where occurred_at>=p_from and occurred_at<p_to
     and (e.user_id is null or exists(select 1 from public.edu_analytics_members m where m.id=e.user_id))
     and path ~ '^/(|classes(/[a-zA-Z0-9_-]+)?|articles(/[a-zA-Z0-9_-]+)?|stories|checkout|apply)$'
 ),
 paths as (select path,count(*) filter(where event_name in ('page_view','class_view','article_view','checkout_view')) as views,count(distinct session_id) as visitors,count(*) filter(where event_name in ('application_click','article_click','click')) as clicks from events group by path),
 payments as (select p.* from public.payments p join public.edu_analytics_orders o on o.id=p.order_id where p.approved_at>=p_from and p.approved_at<p_to and o.status in ('paid','partially_refunded','refunded') and p.status in ('done','partial_cancelled','cancelled')),
 stages as (select event_name,count(distinct session_id) as sessions from events group by event_name)
 select jsonb_build_object('visitors',(select count(distinct session_id) from events),'events',(select count(*) from events),
 'stages',coalesce((select jsonb_object_agg(event_name,sessions) from stages),'{}'::jsonb),
 'paths',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from paths order by views desc limit 100) p),'[]'::jsonb),
 'paidOrders',(select count(distinct order_id) from payments),'revenue',coalesce((select sum(approved_amount-cancelled_amount) from payments),0));
$$;

create or replace function public.edu_manage_webinar(p_actor uuid,p_period text,p_settings jsonb default null)
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
   select o.id,o.user_id,o.total_amount from public.edu_analytics_orders o
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
  'registrations',(select count(*) from public.edu_webinar_registrations r join public.edu_analytics_members m on m.id=r.user_id where r.period_id=p_period),'participation',null,'purchases',report,
  'purchase_state',case when item.paid_cohort_id is null then 'unmapped' when not coalesce(can_orders,false) then 'forbidden' else 'ready' end);
end;
$$;

revoke all on function public.edu_admin_summary(),public.edu_analytics_report(timestamptz,timestamptz),public.edu_manage_webinar(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_admin_summary(),public.edu_analytics_report(timestamptz,timestamptz),public.edu_manage_webinar(uuid,text,jsonb) to service_role;
commit;
