-- BA-DASH-ADS-001: legacy dimension aliases may share one Meta ad ID.
-- Select one label per stable ID without deleting saved classifications.
create or replace function public.edu_marketing_dashboard(
  p_campaign uuid,p_b_start date,p_b_end date,p_a_start date default null,p_a_end date default null,p_campaigns text[] default null,p_ad_types text[] default null,p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null
) returns jsonb language sql stable security invoker set search_path='' as $$
with selected as (
  select c.* from public.landing_campaigns c where c.id=p_campaign and p_b_start between c.start_day and c.end_day and p_b_end between c.start_day and c.end_day and p_b_end>=p_b_start and p_b_end-p_b_start<=3660
    and ((p_a_start is null and p_a_end is null) or (p_a_start is not null and p_a_end is not null and p_a_end>=p_a_start and p_a_end-p_a_start=p_b_end-p_b_start))
), periods as (select 'B'::text period,p_b_start start_day,p_b_end end_day union all select 'A',p_a_start,p_a_end where p_a_start is not null),
dimensions as materialized (
  select distinct on(adset_key,creative_key) adset_key,creative_key,ad_type,meta_adset_id,meta_ad_id from public.landing_campaign_dimensions where campaign_id=p_campaign order by adset_key,creative_key,(ad_type='unclassified'),updated_at desc
), sessions as materialized (
  select p.period,s.*,(s.created_at at time zone 'Asia/Seoul')::date as day,coalesce(s.attribution->>'utm_campaign','') as campaign,coalesce(s.attribution->>'utm_term','') as adset,coalesce(s.attribution->>'utm_content','') as creative,coalesce(nullif(s.attribution->>'device',''),'unknown') as device,coalesce(d.ad_type,'unclassified') as ad_type,d.meta_adset_id,d.meta_ad_id
  from periods p join selected c on true join public.funnel_sessions s on s.landing_id=c.landing_id and (s.created_at at time zone 'Asia/Seoul')::date between p.start_day and p.end_day
  left join dimensions d on d.adset_key=coalesce(s.attribution->>'utm_term','') and d.creative_key=coalesce(s.attribution->>'utm_content','')
), filtered as materialized (
  select * from sessions where (p_campaigns is null or campaign=any(p_campaigns)) and (p_ad_types is null or ad_type=any(p_ad_types)) and (p_adsets is null or adset=any(p_adsets)) and (p_creatives is null or creative=any(p_creatives)) and (p_devices is null or device=any(p_devices)) and (p_layouts is null or layout_ver=any(p_layouts))
), visitor_period as (select period,visitor_id,bool_or(clicks>0) converted from filtered group by period,visitor_id),
session_summary as (select period,count(*) sessions,count(*) filter(where clicks>0) cta_click_sessions,coalesce(sum(clicks),0) cta_clicks,avg(page_dwell_ms) avg_dwell_ms,avg(max_scroll_depth) avg_scroll_depth from filtered group by period),
visitor_summary as (select period,count(*) visitors,count(*) filter(where converted) converted_visitors from visitor_period group by period),
meta_filtered as materialized (
  select p.period,m.*,coalesce(d.ad_type,'unclassified') ad_type from periods p join selected c on c.uses_ads=true
  join public.landing_campaign_meta_daily m on m.campaign_id=c.id and m.meta_campaign_id=any(c.meta_campaign_ids) and m.day between p.start_day and p.end_day
  left join lateral (select x.ad_type from public.landing_campaign_dimensions x where x.campaign_id=m.campaign_id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id order by (x.ad_type='unclassified'),x.updated_at desc limit 1) d on true
  where (p_campaigns is null or m.campaign_name=any(p_campaigns)) and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types)) and (p_adsets is null or m.adset_name=any(p_adsets)) and (p_creatives is null or m.creative_name=any(p_creatives)) and p_devices is null and p_layouts is null
), meta_summary as (select period,coalesce(sum(impressions),0) impressions,coalesce(sum(link_clicks),0) link_clicks,coalesce(sum(spend),0) spend,coalesce(sum(registrations),0) registrations from meta_filtered group by period),
summaries as (
 select p.period,jsonb_build_object('has_data',coalesce(ss.sessions,0)>0 or coalesce(ms.impressions,0)>0 or coalesce(ms.spend,0)>0,'sessions',coalesce(ss.sessions,0),'visitors',coalesce(vs.visitors,0),'cta_click_sessions',coalesce(ss.cta_click_sessions,0),'cta_clicks',coalesce(ss.cta_clicks,0),'converted_visitors',coalesce(vs.converted_visitors,0),'avg_dwell_ms',ss.avg_dwell_ms,'avg_scroll_depth',ss.avg_scroll_depth,'meta_impressions',coalesce(ms.impressions,0),'meta_link_clicks',coalesce(ms.link_clicks,0),'meta_registrations',coalesce(ms.registrations,0),'spend',coalesce(ms.spend,0)) value
 from periods p left join session_summary ss using(period) left join visitor_summary vs using(period) left join meta_summary ms using(period)
), web_rows as (
 select max(campaign) campaign,adset,creative,meta_adset_id,meta_ad_id,max(ad_type) ad_type,count(*) sessions,count(distinct visitor_id) visitors,count(*) filter(where clicks>0) cta_click_sessions,coalesce(sum(clicks),0) cta_clicks,avg(max_scroll_depth) avg_scroll_depth,avg(page_dwell_ms) avg_dwell_ms
 from filtered where period='B' group by adset,creative,meta_adset_id,meta_ad_id
), meta_rows as (
 select max(campaign_name) campaign,max(adset_name) adset,max(creative_name) creative,meta_adset_id,meta_ad_id,max(ad_type) ad_type,sum(impressions) impressions,sum(link_clicks) link_clicks,sum(spend) spend,sum(registrations) registrations,case when min(registration_cost) is not distinct from max(registration_cost) then max(registration_cost) else null end registration_cost
 from meta_filtered where period='B' group by meta_adset_id,meta_ad_id
), performance as (
 select coalesce(w.campaign,m.campaign,'') campaign,coalesce(w.adset,m.adset,'') adset,coalesce(w.creative,m.creative,'') creative,coalesce(w.ad_type,m.ad_type,'unclassified') ad_type,coalesce(w.sessions,0) sessions,coalesce(w.visitors,0) visitors,coalesce(w.cta_click_sessions,0) cta_click_sessions,coalesce(w.cta_clicks,0) cta_clicks,w.avg_scroll_depth,w.avg_dwell_ms,coalesce(m.impressions,0) impressions,coalesce(m.link_clicks,0) link_clicks,coalesce(m.spend,0) spend,coalesce(m.registrations,0) registrations,m.registration_cost
 from web_rows w full join meta_rows m on w.meta_adset_id=m.meta_adset_id and w.meta_ad_id=m.meta_ad_id
), campaign_actuals as (
 select a.*,coalesce(a.new_payments,0)*a.new_price_snapshot+coalesce(a.existing_payments,0)*a.existing_price_snapshot revenue from public.landing_campaign_actuals a where a.campaign_id=p_campaign
), current_kakao as (select kakao_members,lag(kakao_members) over(order by day) previous from campaign_actuals where kakao_members is not null order by day desc limit 1),
campaign_total as (
 select max(c.live_peak) live_peak,(select kakao_members from current_kakao) kakao_members,(select kakao_members-previous from current_kakao) kakao_delta,coalesce(sum(a.new_payments),0) new_payments,coalesce(sum(a.existing_payments),0) existing_payments,coalesce(sum(a.revenue),0) revenue,
 case when bool_or(c.uses_ads) then coalesce((select sum(m.spend) from public.landing_campaign_meta_daily m join selected x on x.id=m.campaign_id where m.meta_campaign_id=any(x.meta_campaign_ids)),0) else 0 end spend
 from selected c left join campaign_actuals a on true
), options as (
 select jsonb_build_object('campaigns',coalesce(to_jsonb(array_agg(distinct campaign) filter(where campaign<>'')),'[]'::jsonb),'ad_types',coalesce(to_jsonb(array_agg(distinct ad_type)),'[]'::jsonb),'adsets',coalesce(to_jsonb(array_agg(distinct adset) filter(where adset<>'')),'[]'::jsonb),'creatives',coalesce(to_jsonb(array_agg(distinct creative) filter(where creative<>'')),'[]'::jsonb),'devices',coalesce(to_jsonb(array_agg(distinct device)),'[]'::jsonb),'layouts',coalesce(to_jsonb(array_agg(distinct layout_ver)),'[]'::jsonb)) value from sessions where period='B'
)
select case when not exists(select 1 from selected) then null else jsonb_build_object(
 'summary_b',(select value from summaries where period='B'),'summary_a',(select value from summaries where period='A'),'performance',coalesce((select jsonb_agg(to_jsonb(performance) order by sessions desc,spend desc) from performance),'[]'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(x) order by day) from (select day,count(*) sessions,count(distinct visitor_id) visitors,count(*) filter(where clicks>0) cta_click_sessions,sum(clicks) cta_clicks from filtered where period='B' group by day)x),'[]'::jsonb),
 'actuals',coalesce((select jsonb_agg(to_jsonb(a) order by day desc) from campaign_actuals a where day between p_b_start and p_b_end),'[]'::jsonb),
 'campaign_summary',(select to_jsonb(t)||jsonb_build_object('roas',case when spend>0 then revenue/spend*100 else null end) from campaign_total t),'options',(select value from options),
 'data_state',jsonb_build_object('sessions_exist',exists(select 1 from sessions where period='B'),'filtered_sessions_exist',exists(select 1 from filtered where period='B'),'meta_exists',exists(select 1 from meta_filtered where period='B'))
) end $$;
revoke all on function public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;

create or replace function public.edu_marketing_export(p_campaign uuid,p_start date,p_end date,p_campaigns text[] default null,p_ad_types text[] default null,p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null)
returns jsonb language sql stable security invoker set search_path='' as $$
with selected as (select * from public.landing_campaigns where id=p_campaign and p_start>=start_day and p_end<=end_day),
web as (
 select (s.created_at at time zone 'Asia/Seoul')::date as day,coalesce(d.ad_type,'unclassified') ad_type,coalesce(s.attribution->>'utm_campaign','') campaign,coalesce(s.attribution->>'utm_term','') adset,coalesce(s.attribution->>'utm_content','') creative,coalesce(nullif(s.attribution->>'device',''),'unknown') device,s.layout_ver,count(*) sessions,count(distinct s.visitor_id) visitors,count(*) filter(where s.clicks>0) cta_click_sessions,sum(s.clicks) cta_clicks,avg(s.max_scroll_depth) avg_scroll_depth,avg(s.page_dwell_ms) avg_dwell_ms,0::numeric impressions,0::numeric link_clicks,0::numeric spend,0::bigint registrations,null::numeric registration_cost
 from selected c join public.funnel_sessions s on s.landing_id=c.landing_id and (s.created_at at time zone 'Asia/Seoul')::date between p_start and p_end left join public.landing_campaign_dimensions d on d.campaign_id=c.id and d.adset_key=coalesce(s.attribution->>'utm_term','') and d.creative_key=coalesce(s.attribution->>'utm_content','')
 where (p_campaigns is null or coalesce(s.attribution->>'utm_campaign','')=any(p_campaigns)) and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types)) and (p_adsets is null or coalesce(s.attribution->>'utm_term','')=any(p_adsets)) and (p_creatives is null or coalesce(s.attribution->>'utm_content','')=any(p_creatives)) and (p_devices is null or coalesce(nullif(s.attribution->>'device',''),'unknown')=any(p_devices)) and (p_layouts is null or s.layout_ver=any(p_layouts))
 group by 1,2,3,4,5,6,7
), meta as (
 select m.day,coalesce(d.ad_type,'unclassified') ad_type,m.campaign_name campaign,m.adset_name adset,m.creative_name creative,'전체'::text device,null::integer layout_ver,0::bigint sessions,0::bigint visitors,0::bigint cta_click_sessions,0::bigint cta_clicks,null::numeric avg_scroll_depth,null::numeric avg_dwell_ms,sum(m.impressions) impressions,sum(m.link_clicks) link_clicks,sum(m.spend) spend,sum(m.registrations) registrations,case when min(m.registration_cost) is not distinct from max(m.registration_cost) then max(m.registration_cost) else null end registration_cost
 from selected c join public.landing_campaign_meta_daily m on c.uses_ads=true and m.campaign_id=c.id and m.meta_campaign_id=any(c.meta_campaign_ids) and m.day between p_start and p_end left join lateral (select x.ad_type from public.landing_campaign_dimensions x where x.campaign_id=m.campaign_id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id order by (x.ad_type='unclassified'),x.updated_at desc limit 1) d on true
 where (p_campaigns is null or m.campaign_name=any(p_campaigns)) and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types)) and (p_adsets is null or m.adset_name=any(p_adsets)) and (p_creatives is null or m.creative_name=any(p_creatives)) and p_devices is null and p_layouts is null group by 1,2,3,4,5
), rows as (select * from web union all select * from meta)
select coalesce(jsonb_agg(to_jsonb(rows) order by day,campaign,adset,creative,device),'[]'::jsonb) from rows $$;
revoke all on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;

