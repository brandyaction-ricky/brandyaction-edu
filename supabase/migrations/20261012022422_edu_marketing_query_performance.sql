-- Preserve existing metrics and grants; reuse the filtered snapshot for UI details.
begin;
create or replace function public.edu_decode_landing_utm_once(p_raw text)
returns text language plpgsql immutable strict set search_path = '' as $$
declare
  decoded bytea := ''::bytea;
  index_value integer := 1;
  current_char text;
  hex_pair text;
begin
  if position('%' in p_raw) = 0 then return p_raw; end if;
  while index_value <= char_length(p_raw) loop
    current_char := substr(p_raw, index_value, 1);
    if current_char = '%' then
      hex_pair := substr(p_raw, index_value + 1, 2);
      if hex_pair !~ '^[0-9A-Fa-f]{2}$' then return p_raw; end if;
      decoded := decoded || decode(hex_pair, 'hex');
      index_value := index_value + 3;
    else
      decoded := decoded || convert_to(current_char, 'UTF8');
      index_value := index_value + 1;
    end if;
  end loop;
  return convert_from(decoded, 'UTF8');
exception when others then
  return p_raw;
end $$;

create or replace function public.edu_marketing_dashboard(
  p_campaign uuid,p_b_start date,p_b_end date,p_a_start date default null,p_a_end date default null,p_campaigns text[] default null,p_ad_types text[] default null,p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null
) returns jsonb language sql stable security invoker set search_path='' as $$
with selected as (
  select c.* from public.landing_campaigns c where c.id=p_campaign and p_b_start between c.start_day and c.end_day and p_b_end between c.start_day and c.end_day and p_b_end>=p_b_start and p_b_end-p_b_start<=3660
    and ((p_a_start is null and p_a_end is null) or (p_a_start is not null and p_a_end is not null and p_a_end>=p_a_start and p_a_end-p_a_start=p_b_end-p_b_start))
), periods as (select 'B'::text period,p_b_start start_day,p_b_end end_day union all select 'A',p_a_start,p_a_end where p_a_start is not null),
dimensions as materialized (
  select distinct on(adset_key,creative_key) adset_key,creative_key,ad_type,meta_adset_id,meta_ad_id,updated_at from public.landing_campaign_dimensions where campaign_id=p_campaign order by adset_key,creative_key,(ad_type='unclassified'),updated_at desc
), sessions as materialized (
  select p.period,s.*,(s.created_at at time zone 'Asia/Seoul')::date as day,
    coalesce(s.attribution->>'utm_campaign_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_campaign',''))) as campaign,
    coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))) as adset,
    coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content',''))) as creative,
    coalesce(nullif(s.attribution->>'device',''),'unknown') as device,coalesce(d.ad_type,'unclassified') as ad_type,d.meta_adset_id,d.meta_ad_id
  from periods p join selected c on true join public.funnel_sessions s on s.landing_id=c.landing_id and s.created_at >= (p.start_day::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p.end_day + 1)::timestamp at time zone 'Asia/Seoul')
  left join lateral (
    select x.ad_type,x.meta_adset_id,x.meta_ad_id from dimensions x
    where x.adset_key in (coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))),coalesce(s.attribution->>'utm_term',''))
      and x.creative_key in (coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content',''))),coalesce(s.attribution->>'utm_content',''))
    order by (x.adset_key=coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))) and x.creative_key=coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content','')))) desc,(x.ad_type='unclassified'),x.updated_at desc limit 1
  ) d on true
), filtered as materialized (
  select * from sessions where (p_campaigns is null or campaign=any(p_campaigns)) and (p_ad_types is null or ad_type=any(p_ad_types)) and (p_adsets is null or adset=any(p_adsets)) and (p_creatives is null or creative=any(p_creatives)) and (p_devices is null or device=any(p_devices)) and (p_layouts is null or layout_ver=any(p_layouts))
), visitor_period as (select period,visitor_id,bool_or(clicks>0) converted from filtered group by period,visitor_id),
session_summary as (select period,count(*) sessions,count(*) filter(where clicks>0) cta_click_sessions,coalesce(sum(clicks),0) cta_clicks,avg(page_dwell_ms) avg_dwell_ms,avg(max_scroll_depth) avg_scroll_depth from filtered group by period),
visitor_summary as (select period,count(*) visitors,count(*) filter(where converted) converted_visitors from visitor_period group by period),
meta_source as materialized (
  select p.period,m.*,coalesce(d.ad_type,'unclassified') ad_type from periods p join selected c on c.uses_ads=true
  join public.landing_campaign_meta_daily m on m.campaign_id=c.id and m.meta_campaign_id=any(c.meta_campaign_ids) and m.day between p.start_day and p.end_day
  left join lateral (select x.ad_type from public.landing_campaign_dimensions x where x.campaign_id=m.campaign_id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id order by (x.ad_type='unclassified'),x.updated_at desc limit 1) d on true
), meta_filtered as materialized (
  select * from meta_source m where (p_campaigns is null or m.campaign_name=any(p_campaigns) or exists(select 1 from sessions s where s.period=m.period and s.meta_ad_id=m.meta_ad_id and s.meta_ad_id is not null and s.campaign=any(p_campaigns)))
    and (p_ad_types is null or m.ad_type=any(p_ad_types)) and (p_adsets is null or m.adset_name=any(p_adsets) or exists(select 1 from sessions s where s.period=m.period and s.meta_ad_id=m.meta_ad_id and s.meta_ad_id is not null and s.adset=any(p_adsets)))
    and (p_creatives is null or m.creative_name=any(p_creatives) or exists(select 1 from sessions s where s.period=m.period and s.meta_ad_id=m.meta_ad_id and s.meta_ad_id is not null and s.creative=any(p_creatives))) and p_devices is null and p_layouts is null
), meta_summary as (select period,coalesce(sum(impressions),0) impressions,coalesce(sum(link_clicks),0) link_clicks,coalesce(sum(spend),0) spend,coalesce(sum(registrations),0) registrations from meta_filtered group by period),
summaries as (
 select p.period,jsonb_build_object('has_data',coalesce(ss.sessions,0)>0 or coalesce(ms.impressions,0)>0 or coalesce(ms.spend,0)>0,'sessions',coalesce(ss.sessions,0),'visitors',coalesce(vs.visitors,0),'cta_click_sessions',coalesce(ss.cta_click_sessions,0),'cta_clicks',coalesce(ss.cta_clicks,0),'converted_visitors',coalesce(vs.converted_visitors,0),'avg_dwell_ms',ss.avg_dwell_ms,'avg_scroll_depth',ss.avg_scroll_depth,'meta_impressions',coalesce(ms.impressions,0),'meta_link_clicks',coalesce(ms.link_clicks,0),'meta_registrations',coalesce(ms.registrations,0),'spend',coalesce(ms.spend,0)) value
 from periods p left join session_summary ss using(period) left join visitor_summary vs using(period) left join meta_summary ms using(period)
), web_rows as (
 select max(campaign) campaign,max(adset) adset,max(creative) creative,max(meta_adset_id) meta_adset_id,max(meta_ad_id) meta_ad_id,max(ad_type) ad_type,count(*) sessions,count(distinct visitor_id) visitors,count(*) filter(where clicks>0) cta_click_sessions,coalesce(sum(clicks),0) cta_clicks,avg(max_scroll_depth) avg_scroll_depth,avg(page_dwell_ms) avg_dwell_ms
 from filtered where period='B' group by case when meta_ad_id is null then 'utm:'||adset||chr(31)||creative else 'meta:'||meta_ad_id end
), meta_rows as (
 select max(campaign_name) campaign,max(adset_name) adset,max(creative_name) creative,max(meta_adset_id) meta_adset_id,meta_ad_id,max(ad_type) ad_type,sum(impressions) impressions,sum(link_clicks) link_clicks,sum(spend) spend,sum(registrations) registrations,
   case when min(registration_cost) is not distinct from max(registration_cost) then max(registration_cost) else null end registration_cost,bool_and(registration_available) registration_available
 from meta_filtered where period='B' group by meta_ad_id
), performance as (
 select coalesce(w.campaign,m.campaign,'') campaign,coalesce(m.adset,w.adset,'') adset,coalesce(m.creative,w.creative,'') creative,coalesce(w.ad_type,m.ad_type,'unclassified') ad_type,
   coalesce(w.sessions,0) sessions,coalesce(w.visitors,0) visitors,coalesce(w.cta_click_sessions,0) cta_click_sessions,coalesce(w.cta_clicks,0) cta_clicks,w.avg_scroll_depth,w.avg_dwell_ms,
   coalesce(m.impressions,0) impressions,coalesce(m.link_clicks,0) link_clicks,coalesce(m.spend,0) spend,coalesce(m.registrations,0) registrations,m.registration_cost,m.registration_available
 from web_rows w full join meta_rows m on w.meta_ad_id=m.meta_ad_id and w.meta_ad_id is not null
), campaign_actuals as (select a.*,coalesce(a.new_payments,0)*a.new_price_snapshot+coalesce(a.existing_payments,0)*a.existing_price_snapshot revenue from public.landing_campaign_actuals a where a.campaign_id=p_campaign),
current_kakao as (select kakao_members,lag(kakao_members) over(order by day) previous from campaign_actuals where kakao_members is not null order by day desc limit 1),
campaign_total as (
 select max(c.live_peak) live_peak,(select kakao_members from current_kakao) kakao_members,(select kakao_members-previous from current_kakao) kakao_delta,coalesce(sum(a.new_payments),0) new_payments,coalesce(sum(a.existing_payments),0) existing_payments,coalesce(sum(a.revenue),0) revenue,
 case when bool_or(c.uses_ads) then coalesce((select sum(m.spend) from public.landing_campaign_meta_daily m join selected x on x.id=m.campaign_id where m.meta_campaign_id=any(x.meta_campaign_ids)),0) else 0 end spend
 from selected c left join campaign_actuals a on true
), meta_campaign_options as (select distinct on(meta_campaign_id) campaign_name value from meta_source where period='B' and btrim(campaign_name)<>'' order by meta_campaign_id,day desc,campaign_name),
meta_adset_options as (select distinct on(meta_adset_id) adset_name value from meta_source where period='B' and btrim(adset_name)<>'' order by meta_adset_id,day desc,adset_name),
meta_creative_options as (select distinct on(meta_ad_id) creative_name value from meta_source where period='B' and btrim(creative_name)<>'' order by meta_ad_id,day desc,creative_name),
options as (select jsonb_build_object(
 'campaigns',coalesce((select jsonb_agg(value order by value) from (select campaign value from sessions where period='B' and btrim(campaign)<>'' union select value from meta_campaign_options)x),'[]'::jsonb),
 'ad_types',coalesce((select jsonb_agg(value order by value) from (select ad_type value from sessions where period='B' and btrim(ad_type)<>'' union select ad_type from meta_source where period='B' and btrim(ad_type)<>'')x),'[]'::jsonb),
 'adsets',coalesce((select jsonb_agg(value order by value) from (select adset value from sessions where period='B' and btrim(adset)<>'' union select value from meta_adset_options)x),'[]'::jsonb),
 'creatives',coalesce((select jsonb_agg(value order by value) from (select creative value from sessions where period='B' and btrim(creative)<>'' union select value from meta_creative_options)x),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(value order by value) from (select distinct device value from sessions where period='B' and btrim(device)<>'')x),'[]'::jsonb),
 'layouts',coalesce((select jsonb_agg(value order by value) from (select distinct layout_ver value from sessions where period='B' and layout_ver is not null)x),'[]'::jsonb)) value)
select case when not exists(select 1 from selected) then null else jsonb_build_object(
 'ui',jsonb_build_object(
   'daily_a',case when p_a_start is null then null else coalesce((select jsonb_agg(to_jsonb(x) order by day) from (select day,count(*) sessions,count(distinct visitor_id) visitors,count(*) filter(where clicks>0) cta_click_sessions,sum(clicks) cta_clicks from filtered where period='A' group by day)x),'[]'::jsonb) end,
   'last_collected_at',(select max(last_seen_at) from filtered where period='B'),
   'actual_presence',jsonb_build_object('new_payments',exists(select 1 from campaign_actuals where new_payments is not null),'existing_payments',exists(select 1 from campaign_actuals where existing_payments is not null)),
   'previous_day_members',coalesce((select jsonb_object_agg(a.day,previous.kakao_members) from campaign_actuals a left join campaign_actuals previous on previous.day=a.day-1),'{}'::jsonb),
   'period_actuals',jsonb_build_object(
     'kakao_members',(select kakao_members from campaign_actuals where day=p_b_end),
     'kakao_delta',(select kakao_members from campaign_actuals where day=p_b_end)-(select kakao_members from campaign_actuals where day=p_b_start-1),
     'kakao_day',(select day from campaign_actuals where day=p_b_end and kakao_members is not null),
     'baseline_day',p_b_start-1,
     'payments',(select sum(coalesce(new_payments,0)+coalesce(existing_payments,0)) from campaign_actuals where day between p_b_start and p_b_end and (new_payments is not null or existing_payments is not null))),
   'errors','{}'::jsonb),
 'summary_b',(select value from summaries where period='B'),'summary_a',(select value from summaries where period='A'),'performance',coalesce((select jsonb_agg(to_jsonb(performance) order by sessions desc,spend desc) from performance),'[]'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(x) order by day) from (select day,count(*) sessions,count(distinct visitor_id) visitors,count(*) filter(where clicks>0) cta_click_sessions,sum(clicks) cta_clicks from filtered where period='B' group by day)x),'[]'::jsonb),
 'actuals',coalesce((select jsonb_agg(to_jsonb(a) order by day desc) from campaign_actuals a where day between p_b_start and p_b_end),'[]'::jsonb),
 'campaign_summary',(select to_jsonb(t)||jsonb_build_object('roas',case when spend>0 then revenue/spend*100 else null end) from campaign_total t),'options',(select value from options),
 'data_state',jsonb_build_object('sessions_exist',exists(select 1 from sessions where period='B'),'filtered_sessions_exist',exists(select 1 from filtered where period='B'),'meta_exists',exists(select 1 from meta_filtered where period='B'))
) end $$;
revoke all on function public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;


commit;
