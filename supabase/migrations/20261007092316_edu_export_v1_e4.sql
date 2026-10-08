begin;
set local lock_timeout='5s';
-- Never expose the hash through public settings policies or browser admin RLS.
alter table public.site_settings add constraint edu_export_setting_private check(key<>'export_v1' or not is_public);
create policy edu_export_setting_server_only on public.site_settings as restrictive for all to anon,authenticated
 using(key<>'export_v1') with check(key<>'export_v1');
insert into public.site_settings(key,value,is_public) values('export_v1','{"enabled":false,"tokenHash":null,"learningUsageSince":"2026-10-04","productTrackingSince":null}',false) on conflict(key) do nothing;

create table public.edu_export_rate_window(singleton boolean primary key default true check(singleton),window_start timestamptz not null,calls integer not null check(calls>=0));
alter table public.edu_export_rate_window enable row level security;
revoke all on public.edu_export_rate_window from public,anon,authenticated;
grant select,insert,update on public.edu_export_rate_window to service_role;
-- This private gate rechecks revocation and uses one atomic limiter across server instances.
create function public.edu_export_v1_gate(p_hash text) returns text language plpgsql security invoker
 set search_path='' set statement_timeout='4s' as $$
declare s jsonb; n integer; stamp timestamptz=date_trunc('minute',statement_timestamp());
begin
 select value into s from public.site_settings where key='export_v1' and not is_public;
 if coalesce(s->>'enabled','false')<>'true' then return 'disabled'; end if;
 if p_hash is null or length(p_hash)<>64 or s->>'tokenHash' is distinct from p_hash then return 'unauthorized'; end if;
 insert into public.edu_export_rate_window values(true,stamp,1)
 on conflict(singleton) do update set window_start=excluded.window_start,calls=case when edu_export_rate_window.window_start=excluded.window_start then least(edu_export_rate_window.calls+1,31) else 1 end returning calls into n;
 return case when n>30 then 'rate_limited' else 'ok' end;
end $$;

-- A single MVCC snapshot supplies only the columns used by the app aggregator.
-- No export view, row cap, contact details, text bodies, URLs or diagnosis sources.
grant select on public.edu_recruitment_marketing_links,public.edu_webinar_campaigns,public.edu_webinar_registrations,public.edu_recruitment_clicks,public.edu_broadcast_visits to service_role;
create function public.edu_export_v1_source(p_from date,p_to date,p_asof timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='4s' as $$
declare v_from timestamptz=p_from::timestamp at time zone 'Asia/Seoul';
 v_until timestamptz=(p_to+1)::timestamp at time zone 'Asia/Seoul'; result jsonb; consent jsonb='[]';
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_to>(statement_timestamp() at time zone 'Asia/Seoul')::date or p_asof is null or p_asof>statement_timestamp() then raise exception 'EXPORT_INVALID'; end if;
 select jsonb_build_object(
 'cohorts',coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,s.course_code,c.cohort_code,c.operation_start_at,c.operation_end_at,c.recruitment_start_at,c.recruitment_end_at,s.slug from public.cohorts c join public.courses s on s.id=c.course_id) x),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,o.user_id,o.status,o.created_at,o.paid_at,o.entry_src,(select h.id from public.edu_analytics_orders h where h.user_id=o.user_id and h.status in ('paid','partially_refunded','refunded') and h.paid_at<=p_asof order by h.paid_at,h.id limit 1) first_paid_order_id from public.edu_analytics_orders o where o.created_at<=p_asof and (o.created_at>=v_from or o.paid_at>=v_from) and (o.created_at<v_until or o.paid_at<v_until)) x),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(x)) from (select i.id,i.order_id,i.cohort_id from public.order_items i join public.edu_analytics_orders o on o.id=i.order_id) x),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.order_id,p.approved_amount,p.cancelled_amount,p.approved_at from public.payments p join public.edu_analytics_orders o on o.id=p.order_id where p.status in ('done','partial_cancelled','cancelled') and p.approved_at<=p_asof) x),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.payment_id,r.amount,r.completed_at from public.refunds r join public.payments p on p.id=r.payment_id join public.edu_analytics_orders o on o.id=p.order_id where r.status='done' and r.completed_at<=p_asof) x),'[]'::jsonb),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.id,e.user_id,e.cohort_id,e.access_starts_at,e.access_ends_at,e.revoked_at,e.created_at from public.enrollments e join public.edu_analytics_members m on m.id=e.user_id join public.order_items i on i.id=e.order_item_id join public.edu_analytics_orders o on o.id=i.order_id where e.source='purchase' and o.paid_at<=p_asof and o.status in ('paid','partially_refunded','refunded') and e.created_at<=p_asof) x),'[]'::jsonb),
 'usage',coalesce((select jsonb_agg(to_jsonb(x)) from (select u.enrollment_id,u.item_type,u.item_id,u.first_used_at from public.learning_usage_events u join public.enrollments e on e.id=u.enrollment_id join public.edu_analytics_members m on m.id=e.user_id join public.order_items i on i.id=e.order_item_id join public.edu_analytics_orders o on o.id=i.order_id where e.source='purchase' and u.first_used_at<=p_asof) x),'[]'::jsonb),
 'catalog',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.id enrollment_id,c.item_type,c.item_id from public.enrollments e join public.edu_analytics_members m on m.id=e.user_id join public.order_items i on i.id=e.order_item_id join public.edu_analytics_orders o on o.id=i.order_id cross join lateral public.edu_learning_usage_catalog(e.id) c where e.source='purchase') x),'[]'::jsonb),
 'visits',coalesce((select jsonb_agg(to_jsonb(x)) from (select v.user_id,v.first_seen_at from public.edu_member_visits v join public.edu_analytics_members m on m.id=v.user_id where v.first_seen_at<=p_asof) x),'[]'::jsonb),
 'campaigns',coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,c.landing_id,c.utm_campaign,c.start_day,c.end_day,c.uses_ads,w.paid_cohort_id from public.landing_campaigns c left join public.edu_recruitment_marketing_links l on l.campaign_id=c.id left join public.edu_webinar_campaigns w on w.period_id=l.period_id) x),'[]'::jsonb),
 'dimensions',coalesce((select jsonb_agg(to_jsonb(x)) from (select campaign_id,adset_key,creative_key,ad_type,meta_ad_id,meta_adset_id from public.landing_campaign_dimensions) x),'[]'::jsonb),
 'meta',coalesce((select jsonb_agg(to_jsonb(x)) from (select campaign_id,day,meta_ad_id,meta_campaign_id from public.landing_campaign_meta_daily where day between p_from and p_to) x),'[]'::jsonb),
 'funnel',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.created_at,e.landing_id,e.session_id,e.event_type,s.attribution->>'utm_campaign' utm_campaign,s.attribution->>'utm_term' utm_term,s.attribution->>'utm_content' utm_content from public.funnel_events e join public.funnel_sessions s using(landing_id,session_id,layout_ver) where e.created_at>=v_from and e.created_at<v_until and e.created_at<=p_asof and e.event_type in ('view_page','click_cta')) x),'[]'::jsonb),
 'actuals',coalesce((select jsonb_agg(to_jsonb(x)) from (select campaign_id,day,kakao_members from public.landing_campaign_actuals where day<=p_to and kakao_members is not null) x),'[]'::jsonb),
 'clicks',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.created_at,r.channel,w.paid_cohort_id from public.edu_recruitment_clicks r left join public.edu_webinar_campaigns w on w.period_id=r.period_id where r.created_at>=v_from and r.created_at<v_until and r.created_at<=p_asof) x),'[]'::jsonb),
 'registrations',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.registered_at,r.channel,w.paid_cohort_id from public.edu_webinar_registrations r join public.edu_analytics_members m on m.id=r.user_id left join public.edu_webinar_campaigns w on w.period_id=r.period_id where r.registered_at>=v_from and r.registered_at<v_until and r.registered_at<=p_asof) x),'[]'::jsonb),
 'broadcasts',coalesce((select jsonb_agg(to_jsonb(x)) from (select v.created_at,w.paid_cohort_id from public.edu_broadcast_visits v left join public.edu_webinar_campaigns w on w.id=v.campaign_id where v.target='live' and v.created_at>=v_from and v.created_at<v_until and v.created_at<=p_asof) x),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(x)) from (select j.occurred_at,j.session_id,j.path from public.customer_journey_events j left join public.edu_analytics_members m on m.id=j.user_id where (j.user_id is null or m.id is not null) and j.event_name='class_view' and j.occurred_at>=v_from and j.occurred_at<v_until and j.occurred_at<=p_asof) x),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(to_jsonb(x)) from (select q.created_at,q.archived_at,coalesce((select jsonb_agg(jsonb_build_object('created_at',a.created_at,'deleted_at',a.deleted_at)) from public.edu_question_answers a where a.question_id=q.id and a.source<>'learner'),'[]') answer_times from public.edu_questions q join public.edu_analytics_members m on m.id=q.user_id where q.created_at<=p_asof) x),'[]'::jsonb),
 'refund_requests',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.created_at from public.edu_refund_requests r join public.payments p on p.id=r.payment_id join public.edu_analytics_orders o on o.id=p.order_id where r.created_at>=v_from and r.created_at<v_until and r.created_at<=p_asof) x),'[]'::jsonb),
 'crm',coalesce((select jsonb_agg(to_jsonb(x)) from (select l.channel,l.sent_at,t.purpose from public.crm_message_logs l join public.edu_analytics_members m on m.id=l.member_id left join public.crm_campaigns c on c.id=l.campaign_id left join public.crm_templates t on t.id=c.template_id where l.status='accepted' and l.sent_at>=v_from and l.sent_at<v_until and l.sent_at<=p_asof) x),'[]'::jsonb),
 'push',coalesce((select jsonb_agg(to_jsonb(x)) from (select d.finished_at from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_analytics_members m on m.id=e.user_id where d.status='sent' and d.finished_at>=v_from and d.finished_at<v_until and d.finished_at<=p_asof) x),'[]'::jsonb),
 'settings',(select value-'tokenHash'-'enabled' from public.site_settings where key='export_v1' and not is_public)
 ) into result;
 if to_regclass('public.edu_consent_events') is not null then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into consent from (
   select e.member_id,e.kind,e.action,e.occurred_at from public.edu_consent_events e join public.edu_analytics_members m on m.id=e.member_id
   where e.wording_version='2026-10-20' and e.kind<>'legacy' and e.occurred_at<=p_asof
  ) x;
 end if;
 return result||jsonb_build_object('consent',consent);
end $$;
revoke all on function public.edu_export_v1_gate(text),public.edu_export_v1_source(date,date,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.edu_export_v1_gate(text),public.edu_export_v1_source(date,date,timestamptz) to service_role;
commit;
