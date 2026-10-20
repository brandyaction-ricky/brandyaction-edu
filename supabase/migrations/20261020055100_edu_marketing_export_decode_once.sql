begin;
set local lock_timeout='5s';
create or replace function public.edu_marketing_export(p_campaign uuid,p_start date,p_end date,p_campaigns text[] default null,p_ad_types text[] default null,p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null)
returns jsonb language sql stable security invoker set search_path='' as $$
with selected as (select * from public.landing_campaigns where id=p_campaign and p_start>=start_day and p_end<=end_day),
-- Decode distinct legacy strings once, rather than per session/dimension.
raw_sessions as materialized (
 select s.landing_id,s.visitor_id,s.created_at,s.attribution,s.clicks,s.layout_ver,s.max_scroll_depth,s.page_dwell_ms
 from selected c join public.funnel_sessions s on s.landing_id=c.landing_id
  and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul')
  and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul')
), encoded_values as materialized (
 select distinct v.value from raw_sessions s cross join lateral(values
  (coalesce(s.attribution->>'utm_campaign','')),(coalesce(s.attribution->>'utm_term','')),(coalesce(s.attribution->>'utm_content',''))
 ) v(value)
), decoded as materialized (
 select value,public.edu_decode_landing_utm_once(value) normalized from encoded_values
), sessions as materialized (
 select s.*,coalesce(s.attribution->>'utm_campaign_normalized',dc.normalized) campaign_key,
  coalesce(s.attribution->>'utm_term_normalized',da.normalized) adset_key,
  coalesce(s.attribution->>'utm_content_normalized',dr.normalized) creative_key
 from raw_sessions s
 left join decoded dc on dc.value=coalesce(s.attribution->>'utm_campaign','')
 left join decoded da on da.value=coalesce(s.attribution->>'utm_term','')
 left join decoded dr on dr.value=coalesce(s.attribution->>'utm_content','')
),
web as (
 select (s.created_at at time zone 'Asia/Seoul')::date as day,coalesce(d.ad_type,'unclassified') ad_type,
   s.campaign_key campaign,
   s.adset_key adset,
   s.creative_key creative,
   coalesce(nullif(s.attribution->>'device',''),'unknown') device,s.layout_ver,count(*) sessions,count(distinct s.visitor_id) visitors,count(*) filter(where s.clicks>0) cta_click_sessions,sum(s.clicks) cta_clicks,avg(s.max_scroll_depth) avg_scroll_depth,avg(s.page_dwell_ms) avg_dwell_ms,
   0::numeric impressions,0::numeric link_clicks,0::numeric spend,0::bigint registrations,null::numeric registration_cost,false registration_available,null::bigint landing_page_views,false landing_page_view_available
 from selected c join sessions s on s.landing_id=c.landing_id
 left join lateral (select x.ad_type from public.landing_campaign_dimensions x where x.campaign_id=c.id
   and x.adset_key in (s.adset_key,coalesce(s.attribution->>'utm_term',''))
   and x.creative_key in (s.creative_key,coalesce(s.attribution->>'utm_content',''))
   order by (x.adset_key=s.adset_key and x.creative_key=s.creative_key) desc,(x.ad_type='unclassified'),x.updated_at desc limit 1) d on true
 where (p_campaigns is null or s.campaign_key=any(p_campaigns))
   and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
   and (p_adsets is null or s.adset_key=any(p_adsets))
   and (p_creatives is null or s.creative_key=any(p_creatives))
   and (p_devices is null or coalesce(nullif(s.attribution->>'device',''),'unknown')=any(p_devices)) and (p_layouts is null or s.layout_ver=any(p_layouts))
 group by 1,2,3,4,5,6,7
), meta as (
 select m.day,coalesce(d.ad_type,'unclassified') ad_type,m.campaign_name campaign,m.adset_name adset,m.creative_name creative,'전체'::text device,null::integer layout_ver,
   0::bigint sessions,0::bigint visitors,0::bigint cta_click_sessions,0::bigint cta_clicks,null::numeric avg_scroll_depth,null::numeric avg_dwell_ms,
   sum(m.impressions) impressions,sum(m.link_clicks) link_clicks,sum(m.spend) spend,sum(m.registrations) registrations,
   case when count(*)=1 then max(m.registration_cost) else null end registration_cost,case when bool_and(m.registration_available is true) then true when bool_or(m.registration_available is false) then false end registration_available,
   sum(m.landing_page_views) landing_page_views,case when bool_and(m.landing_page_view_available is true) then true when bool_or(m.landing_page_view_available is false) then false end landing_page_view_available
 from selected c join public.landing_campaign_meta_daily m on c.uses_ads=true and m.campaign_id=c.id and m.meta_campaign_id=any(c.meta_campaign_ids) and m.day between p_start and p_end
 left join lateral (select x.ad_type from public.landing_campaign_dimensions x where x.campaign_id=m.campaign_id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id order by (x.ad_type='unclassified'),x.updated_at desc limit 1) d on true
 where (p_campaigns is null or m.campaign_name=any(p_campaigns) or exists(select 1 from sessions s join public.landing_campaign_dimensions x on x.campaign_id=c.id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id where s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul') and s.campaign_key=any(p_campaigns)))
   and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
   and (p_adsets is null or m.adset_name=any(p_adsets) or exists(select 1 from sessions s join public.landing_campaign_dimensions x on x.campaign_id=c.id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id where s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul') and s.adset_key=any(p_adsets)))
   and (p_creatives is null or m.creative_name=any(p_creatives) or exists(select 1 from sessions s join public.landing_campaign_dimensions x on x.campaign_id=c.id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id where s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul') and s.creative_key=any(p_creatives)))
   and p_devices is null and p_layouts is null group by 1,2,3,4,5
), rows as (select * from web union all select * from meta)
select coalesce(jsonb_agg(to_jsonb(rows) order by day,campaign,adset,creative,device),'[]'::jsonb) from rows $$;
revoke all on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;
commit;
