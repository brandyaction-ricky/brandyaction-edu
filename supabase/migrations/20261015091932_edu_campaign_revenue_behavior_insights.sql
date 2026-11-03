begin;
set local lock_timeout = '5s';

-- Read-only supplement. Reuses E1 eligible orders and the existing recruitment
-- mapping; no new sales ledger, tracking identifiers, source writes or backfill.
-- Revenue/spend are the lifetime cohort aggregate (including late payments),
-- independent of the landing inspection window and creative/device filters.
-- This is a display metric, not the E5 provisional reserve or execution gate.
create function public.edu_marketing_insights(
 p_actor uuid, p_campaign uuid, p_from date, p_to date, p_filters jsonb default '{}'
) returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='4s' as $$
declare
 actor public.profiles; perms jsonb; campaign public.landing_campaigns;
 cohort uuid; cohort_label text; revenue jsonb; behavior jsonb;
 allowed_orders boolean; from_at timestamptz; until_at timestamptz;
begin
 select * into actor from public.profiles where id=p_actor and status='active' and deleted_at is null;
 if not found or actor.role not in ('admin','staff') then raise exception 'INSIGHTS_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into perms from public.site_settings where key='edu_staff_permissions_'||p_actor::text;
  if perms->'marketing' is distinct from 'true'::jsonb then raise exception 'INSIGHTS_FORBIDDEN'; end if;
 end if;
 allowed_orders := actor.role='admin' or perms->'orders'='true'::jsonb;
 select * into campaign from public.landing_campaigns where id=p_campaign;
 if not found or p_from is null or p_to is null or p_to<p_from or p_to-p_from>3660
  or p_from<campaign.start_day or p_to>campaign.end_day
  or p_filters is null or jsonb_typeof(p_filters)<>'object'
  or p_filters-array['utm_campaign','adset','creative','device','layout','ad_type']<>'{}'::jsonb then raise exception 'INSIGHTS_INVALID'; end if;
 if exists(select 1 from jsonb_each(p_filters) x where jsonb_typeof(x.value)<>'array' or jsonb_array_length(x.value)>50)
  or exists(select 1 from jsonb_each(p_filters) x cross join lateral jsonb_array_elements(x.value) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>250)
  then raise exception 'INSIGHTS_INVALID'; end if;
 from_at:=p_from::timestamp at time zone 'Asia/Seoul';
 until_at:=(p_to+1)::timestamp at time zone 'Asia/Seoul';
 select w.paid_cohort_id,concat_ws(' · ',s.title,c.cohort_code) into cohort,cohort_label
 from public.edu_recruitment_marketing_links l join public.edu_webinar_campaigns w using(period_id)
 join public.cohorts c on c.id=w.paid_cohort_id join public.courses s on s.id=c.course_id
 where l.campaign_id=p_campaign;
 revenue:=jsonb_build_object('state',case when not coalesce(allowed_orders,false) then 'forbidden' else 'unmapped' end,
  'cohort_id',null,'cohort_label',null,'orders',null,'new_orders',null,'existing_orders',null,
  'gross',null,'refunds',null,'net',null,'spend',null,'roas',null,'needs_review',0);
 if coalesce(allowed_orders,false) and cohort is not null then
  with candidates as materialized (
   select o.* from public.edu_analytics_orders o where o.currency='KRW' and o.paid_at is not null and o.paid_at<=statement_timestamp()
    and o.status in ('paid','partially_refunded','refunded')
    and exists(select 1 from public.order_items i where i.order_id=o.id and i.cohort_id=cohort)
  ), ledger as (
   select o.id,
    (select count(*) from public.order_items i where i.order_id=o.id)=1
     and count(p.id)>0 and sum(p.approved_amount)=o.total_amount
     and bool_and(p.approved_amount>0 and p.cancelled_amount between 0 and p.approved_amount)
     and coalesce(sum(p.cancelled_amount),0)=(select coalesce(sum(r.amount),0) from public.refunds r join public.payments q on q.id=r.payment_id where q.order_id=o.id and r.status='done' and r.completed_at<=statement_timestamp()) as valid,
    coalesce(sum(p.approved_amount),0) gross,coalesce(sum(p.cancelled_amount),0) refunds,
    o.id=(select h.id from public.edu_analytics_orders h where h.user_id=o.user_id and h.status in ('paid','partially_refunded','refunded') and h.paid_at<=statement_timestamp() order by h.paid_at,h.id limit 1) is_new
   from candidates o left join public.payments p on p.order_id=o.id and p.status in ('done','partial_cancelled','cancelled') and p.approved_at<=statement_timestamp()
   group by o.id,o.user_id,o.total_amount
  ), totals as (
   select count(*) filter(where not coalesce(valid,false)) needs_review,count(*) orders,
    count(*) filter(where is_new) new_orders,count(*) filter(where not is_new) existing_orders,
    coalesce(sum(gross),0) gross,coalesce(sum(refunds),0) refunds from ledger
  ), campaigns as materialized (
   select c.* from public.landing_campaigns c join public.edu_recruitment_marketing_links l on l.campaign_id=c.id
   join public.edu_webinar_campaigns w using(period_id) where w.paid_cohort_id=cohort and c.uses_ads and c.start_day<=(statement_timestamp() at time zone 'Asia/Seoul')::date
  ), ad_rows as (
   -- The same Meta ad/day may be linked from several free pages. Count it once.
   select distinct on(m.day,m.meta_campaign_id,m.meta_ad_id) m.* from public.landing_campaign_meta_daily m
   join campaigns c on c.id=m.campaign_id where m.day between c.start_day and c.end_day and m.day<=(statement_timestamp() at time zone 'Asia/Seoul')::date
   order by m.day,m.meta_campaign_id,m.meta_ad_id,m.synced_at desc,m.campaign_id
  ), ad_state as (
   select exists(select 1 from campaigns) and not exists(select 1 from campaigns c where c.meta_sync_status is distinct from 'success' or c.meta_last_synced_at is null or (c.meta_last_synced_at at time zone 'Asia/Seoul')::date<least(c.end_day+1,(statement_timestamp() at time zone 'Asia/Seoul')::date))
    and not exists(select 1 from ad_rows where spend is null or spend<0 or spend::text in ('NaN','Infinity','-Infinity'))
    and not exists(select 1 from ad_rows a join public.landing_campaign_meta_daily m on m.day=a.day and m.meta_campaign_id=a.meta_campaign_id and m.meta_ad_id=a.meta_ad_id
     join public.edu_recruitment_marketing_links l on l.campaign_id=m.campaign_id join public.edu_webinar_campaigns w using(period_id) where w.paid_cohort_id is distinct from cohort) ready,
    coalesce((select sum(spend) from ad_rows),0) spend
  ) select jsonb_build_object('state',case when t.needs_review=0 then 'ready' else 'review' end,
   'cohort_id',cohort,'cohort_label',cohort_label,'as_of',statement_timestamp(),'needs_review',t.needs_review,
   'orders',case when t.needs_review=0 then t.orders end,'new_orders',case when t.needs_review=0 then t.new_orders end,'existing_orders',case when t.needs_review=0 then t.existing_orders end,
   'gross',case when t.needs_review=0 then t.gross end,'refunds',case when t.needs_review=0 then t.refunds end,'net',case when t.needs_review=0 then t.gross-t.refunds end,
   'spend',case when a.ready then a.spend end,'roas',case when t.needs_review=0 and a.ready and a.spend>0 then (t.gross-t.refunds)/a.spend*100 end)
   into revenue from totals t cross join ad_state a;
 end if;
 with sessions as materialized (
  select s.* from public.funnel_sessions s
  left join lateral (select d.ad_type from public.landing_campaign_dimensions d where d.campaign_id=p_campaign
   and d.adset_key=coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term','')))
   and d.creative_key=coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content',''))) order by (d.ad_type='unclassified'),d.updated_at desc limit 1) d on true
  where s.landing_id=campaign.landing_id and s.created_at>=from_at and s.created_at<until_at
   and (not p_filters?'utm_campaign' or p_filters->'utm_campaign'='[]' or coalesce(s.attribution->>'utm_campaign_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_campaign',''))) in(select jsonb_array_elements_text(p_filters->'utm_campaign')))
   and (not p_filters?'adset' or p_filters->'adset'='[]' or coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))) in(select jsonb_array_elements_text(p_filters->'adset')))
   and (not p_filters?'creative' or p_filters->'creative'='[]' or coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content',''))) in(select jsonb_array_elements_text(p_filters->'creative')))
   and (not p_filters?'device' or p_filters->'device'='[]' or coalesce(nullif(s.attribution->>'device',''),'unknown') in(select jsonb_array_elements_text(p_filters->'device')))
   and (not p_filters?'layout' or p_filters->'layout'='[]' or s.layout_ver::text in(select jsonb_array_elements_text(p_filters->'layout')))
   and (not p_filters?'ad_type' or p_filters->'ad_type'='[]' or coalesce(d.ad_type,'unclassified') in(select jsonb_array_elements_text(p_filters->'ad_type')))
 ), versions as (
  select v.layout_ver,v.created_at,left(v.note,500) note,
   (select count(*) from sessions s where s.layout_ver=v.layout_ver) sessions,
   (select count(*) from sessions s where s.layout_ver=v.layout_ver and s.clicks>0) cta_sessions,
   (select min(created_at) from sessions s where s.layout_ver=v.layout_ver) first_seen,
   (select max(created_at) from sessions s where s.layout_ver=v.layout_ver) last_seen,
   (select coalesce(jsonb_agg(jsonb_build_object('section',e.section,'reached',r.reached,'not_continued',r.not_continued,'avg_dwell_ms',r.dwell) order by e.n),'[]')
    from (select value section,ordinality n,lead(value) over(order by ordinality) next_section from jsonb_array_elements_text(v.sections) with ordinality) e
    cross join lateral (select count(*) filter(where s.sections?e.section) reached,
     case when e.next_section is not null then count(*) filter(where s.sections?e.section and not s.sections?e.next_section) end not_continued,
     avg((s.sections->>e.section)::numeric) filter(where s.sections?e.section) dwell
     from sessions s where s.layout_ver=v.layout_ver) r) sections
  from public.section_snapshots v where v.landing_id=campaign.landing_id and v.created_at<until_at
   and (not p_filters?'layout' or p_filters->'layout'='[]' or v.layout_ver::text in(select jsonb_array_elements_text(p_filters->'layout')))
 ) select jsonb_build_object('sessions',(select count(*) from sessions),'measured_sessions',(select count(*) from sessions where max_scroll_depth is not null),
  'scroll',(select jsonb_agg(jsonb_build_object('depth',d,'reached',(select count(*) from sessions where max_scroll_depth>=d),'not_continued',case when d<100 then (select count(*) from sessions where max_scroll_depth>=d and max_scroll_depth<next_d) end) order by d)
   from (select d,lead(d) over(order by d) next_d from unnest(array[0,25,50,75,90,100]) d) bins),
  'versions',coalesce((select jsonb_agg(to_jsonb(v) order by layout_ver) from versions v),'[]')) into behavior;
 return jsonb_build_object('revenue',revenue,'behavior',behavior);
end $$;
revoke all on function public.edu_marketing_insights(uuid,uuid,date,date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.edu_marketing_insights(uuid,uuid,date,date,jsonb) to service_role;
commit;
