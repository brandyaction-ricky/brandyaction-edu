-- BA dashboard repair: classification is a label, never part of the material identity.
-- Existing campaigns and Meta history are preserved. New pages default to organic.
alter table public.landing_campaigns
  add column if not exists uses_ads boolean not null default false;

update public.landing_campaigns
set uses_ads = true
where uses_ads = false
  and (coalesce(cardinality(meta_campaign_ids), 0) > 0 or meta_campaign_id is not null);

alter table public.landing_campaign_meta_daily
  add column if not exists registrations bigint not null default 0,
  add column if not exists registration_cost numeric(16,2);

alter table public.landing_campaign_meta_daily
  drop constraint if exists landing_campaign_meta_daily_registrations_check,
  drop constraint if exists landing_campaign_meta_daily_registration_cost_check;
alter table public.landing_campaign_meta_daily
  add constraint landing_campaign_meta_daily_registrations_check check (registrations >= 0),
  add constraint landing_campaign_meta_daily_registration_cost_check check (registration_cost is null or registration_cost >= 0);

create or replace function public.edu_store_campaign_meta(
  p_campaign uuid, p_expected_updated_at timestamptz, p_rows jsonb, p_dimensions jsonb, p_actor uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare c public.landing_campaigns; stamp timestamptz := clock_timestamp();
begin
  select * into c from public.landing_campaigns where id=p_campaign for update;
  if not found or c.updated_at is distinct from p_expected_updated_at or c.meta_sync_status <> 'syncing' then raise exception 'META_SETTINGS_CHANGED'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_dimensions)<>'array' then raise exception 'INVALID_META_ROWS'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as x(meta_campaign_id text, day date, registrations bigint, registration_cost numeric)
    where x.meta_campaign_id is null or not (x.meta_campaign_id=any(c.meta_campaign_ids)) or x.day is null or x.day<c.start_day or x.day>c.end_day
      or coalesce(x.registrations,0)<0 or coalesce(x.registration_cost,0)<0)
    then raise exception 'INVALID_META_ROWS'; end if;

  insert into public.landing_campaign_meta_daily(
    campaign_id,day,campaign_name,adset_name,creative_name,meta_campaign_id,meta_adset_id,meta_ad_id,meta_creative_id,
    impressions,link_clicks,spend,registrations,registration_cost,synced_at
  )
  select p_campaign,x.day,x.campaign_name,x.adset_name,x.creative_name,x.meta_campaign_id,x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,
    x.impressions,x.link_clicks,x.spend,coalesce(x.registrations,0),x.registration_cost,stamp
  from jsonb_to_recordset(p_rows) as x(
    day date,campaign_name text,adset_name text,creative_name text,meta_campaign_id text,meta_adset_id text,meta_ad_id text,
    meta_creative_id text,impressions bigint,link_clicks bigint,spend numeric,registrations bigint,registration_cost numeric
  )
  on conflict(campaign_id,day,meta_ad_id) do update set
    campaign_name=excluded.campaign_name,adset_name=excluded.adset_name,creative_name=excluded.creative_name,
    meta_campaign_id=excluded.meta_campaign_id,meta_adset_id=excluded.meta_adset_id,meta_creative_id=excluded.meta_creative_id,
    impressions=excluded.impressions,link_clicks=excluded.link_clicks,spend=excluded.spend,
    registrations=excluded.registrations,registration_cost=excluded.registration_cost,synced_at=excluded.synced_at;

  -- Human-readable UTM names are the canonical keys. Refreshing Meta IDs must
  -- not reset a classification that an operator already saved for the pair.
  insert into public.landing_campaign_dimensions(
    campaign_id,adset_key,creative_key,meta_adset_id,meta_ad_id,meta_creative_id,ad_type,updated_by,updated_at
  )
  select p_campaign,left(x.adset_key,250),left(x.creative_key,250),x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,'unclassified',p_actor,stamp
  from jsonb_to_recordset(p_dimensions) as x(adset_key text,creative_key text,meta_adset_id text,meta_ad_id text,meta_creative_id text)
  on conflict(campaign_id,adset_key,creative_key) do update set
    meta_adset_id=excluded.meta_adset_id,meta_ad_id=excluded.meta_ad_id,meta_creative_id=excluded.meta_creative_id,
    updated_at=case when public.landing_campaign_dimensions.meta_ad_id is distinct from excluded.meta_ad_id then stamp else public.landing_campaign_dimensions.updated_at end;

  update public.landing_campaigns set meta_sync_status='success',meta_last_synced_at=stamp,meta_sync_error=null,updated_by=p_actor,updated_at=stamp where id=p_campaign;
end $$;
revoke all on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) to service_role;

create or replace function public.edu_marketing_dashboard(
  p_campaign uuid, p_b_start date, p_b_end date,
  p_a_start date default null, p_a_end date default null,
  p_campaigns text[] default null, p_ad_types text[] default null,
  p_adsets text[] default null, p_creatives text[] default null,
  p_devices text[] default null, p_layouts integer[] default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
with selected as (
  select c.* from public.landing_campaigns c where c.id=p_campaign
    and p_b_start between c.start_day and c.end_day and p_b_end between c.start_day and c.end_day
    and p_b_end>=p_b_start and p_b_end-p_b_start<=3660
    and ((p_a_start is null and p_a_end is null) or (p_a_start is not null and p_a_end is not null and p_a_end>=p_a_start and p_a_end-p_a_start=p_b_end-p_b_start))
), periods as (
  select 'B'::text period,p_b_start start_day,p_b_end end_day union all
  select 'A',p_a_start,p_a_end where p_a_start is not null
), dimensions as materialized (
  select distinct on (adset_key,creative_key) adset_key,creative_key,ad_type
  from public.landing_campaign_dimensions where campaign_id=p_campaign
  order by adset_key,creative_key,(ad_type='unclassified'),updated_at desc
), sessions as materialized (
  select p.period,s.*,(s.created_at at time zone 'Asia/Seoul')::date as day,
    coalesce(s.attribution->>'utm_campaign','') campaign,coalesce(s.attribution->>'utm_term','') adset,
    coalesce(s.attribution->>'utm_content','') creative,coalesce(nullif(s.attribution->>'device',''),'unknown') device,
    coalesce(d.ad_type,'unclassified') ad_type
  from periods p join selected c on true
  join public.funnel_sessions s on s.landing_id=c.landing_id and (s.created_at at time zone 'Asia/Seoul')::date between p.start_day and p.end_day
  left join dimensions d on d.adset_key=coalesce(s.attribution->>'utm_term','') and d.creative_key=coalesce(s.attribution->>'utm_content','')
), filtered as materialized (
  select * from sessions where
    (p_campaigns is null or campaign=any(p_campaigns)) and (p_ad_types is null or ad_type=any(p_ad_types)) and
    (p_adsets is null or adset=any(p_adsets)) and (p_creatives is null or creative=any(p_creatives)) and
    (p_devices is null or device=any(p_devices)) and (p_layouts is null or layout_ver=any(p_layouts))
), visitor_period as (
  select period,visitor_id,bool_or(clicks>0) converted from filtered group by period,visitor_id
), session_summary as (
  select period,count(*) sessions,count(*) filter(where clicks>0) cta_click_sessions,
    coalesce(sum(clicks),0) cta_clicks,avg(page_dwell_ms) avg_dwell_ms,avg(max_scroll_depth) avg_scroll_depth
  from filtered group by period
), visitor_summary as (
  select period,count(*) visitors,count(*) filter(where converted) converted_visitors from visitor_period group by period
), meta_filtered as materialized (
  select p.period,m.*,coalesce(d.ad_type,'unclassified') ad_type
  from periods p join public.landing_campaign_meta_daily m on m.campaign_id=p_campaign and m.day between p.start_day and p.end_day
  left join dimensions d on d.adset_key=m.adset_name and d.creative_key=m.creative_name
  where (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
    and (p_adsets is null or m.adset_name=any(p_adsets)) and (p_creatives is null or m.creative_name=any(p_creatives))
    and p_devices is null and p_layouts is null
), meta_summary as (
  select period,coalesce(sum(impressions),0) impressions,coalesce(sum(link_clicks),0) link_clicks,
    coalesce(sum(spend),0) spend,coalesce(sum(registrations),0) registrations
  from meta_filtered group by period
), summaries as (
  select p.period,jsonb_build_object(
    'has_data',coalesce(ss.sessions,0)>0 or coalesce(ms.impressions,0)>0 or coalesce(ms.spend,0)>0,
    'sessions',coalesce(ss.sessions,0),'visitors',coalesce(vs.visitors,0),
    'cta_click_sessions',coalesce(ss.cta_click_sessions,0),'cta_clicks',coalesce(ss.cta_clicks,0),
    'converted_visitors',coalesce(vs.converted_visitors,0),'avg_dwell_ms',ss.avg_dwell_ms,'avg_scroll_depth',ss.avg_scroll_depth,
    'meta_impressions',coalesce(ms.impressions,0),'meta_link_clicks',coalesce(ms.link_clicks,0),
    'meta_registrations',coalesce(ms.registrations,0),'spend',coalesce(ms.spend,0)
  ) value from periods p left join session_summary ss using(period) left join visitor_summary vs using(period) left join meta_summary ms using(period)
), web_rows as (
  select max(campaign) campaign,adset,creative,count(*) sessions,count(distinct visitor_id) visitors,
    count(*) filter(where clicks>0) cta_click_sessions,coalesce(sum(clicks),0) cta_clicks,
    avg(max_scroll_depth) avg_scroll_depth,avg(page_dwell_ms) avg_dwell_ms
  from filtered where period='B' group by adset,creative
), meta_rows as (
  select max(campaign_name) campaign,adset_name adset,creative_name creative,
    sum(impressions) impressions,sum(link_clicks) link_clicks,sum(spend) spend,sum(registrations) registrations,
    case when min(registration_cost) is not distinct from max(registration_cost) then max(registration_cost) else null end registration_cost
  from meta_filtered where period='B' group by adset_name,creative_name
), performance_base as (
  select coalesce(w.campaign,m.campaign,'') campaign,coalesce(w.adset,m.adset,'') adset,
    coalesce(w.creative,m.creative,'') creative,
    coalesce(w.sessions,0) sessions,coalesce(w.visitors,0) visitors,
    coalesce(w.cta_click_sessions,0) cta_click_sessions,coalesce(w.cta_clicks,0) cta_clicks,
    w.avg_scroll_depth,w.avg_dwell_ms,coalesce(m.impressions,0) impressions,
    coalesce(m.link_clicks,0) link_clicks,coalesce(m.spend,0) spend,
    coalesce(m.registrations,0) registrations,m.registration_cost
  from web_rows w full join meta_rows m using(adset,creative)
), performance as (
  select b.*,coalesce(d.ad_type,'unclassified') ad_type
  from performance_base b left join dimensions d on d.adset_key=b.adset and d.creative_key=b.creative
), campaign_actuals as (
  select a.*,coalesce(a.new_payments,0)*a.new_price_snapshot+coalesce(a.existing_payments,0)*a.existing_price_snapshot revenue
  from public.landing_campaign_actuals a where a.campaign_id=p_campaign
), current_kakao as (
  select kakao_members,lag(kakao_members) over(order by day) previous from campaign_actuals where kakao_members is not null order by day desc limit 1
), campaign_total as (
  select max(c.live_peak) live_peak,(select kakao_members from current_kakao) kakao_members,
    (select kakao_members-previous from current_kakao) kakao_delta,
    coalesce(sum(a.new_payments),0) new_payments,coalesce(sum(a.existing_payments),0) existing_payments,
    coalesce(sum(a.revenue),0) revenue,
    coalesce((select sum(spend) from public.landing_campaign_meta_daily where campaign_id=p_campaign),0) spend
  from selected c left join campaign_actuals a on true
), options as (
  select jsonb_build_object(
    'campaigns',coalesce(to_jsonb(array_agg(distinct campaign) filter(where campaign<>'')),'[]'::jsonb),
    'ad_types',coalesce(to_jsonb(array_agg(distinct ad_type)),'[]'::jsonb),
    'adsets',coalesce(to_jsonb(array_agg(distinct adset) filter(where adset<>'')),'[]'::jsonb),
    'creatives',coalesce(to_jsonb(array_agg(distinct creative) filter(where creative<>'')),'[]'::jsonb),
    'devices',coalesce(to_jsonb(array_agg(distinct device)),'[]'::jsonb),
    'layouts',coalesce(to_jsonb(array_agg(distinct layout_ver)),'[]'::jsonb)
  ) value from sessions where period='B'
)
select case when not exists(select 1 from selected) then null else jsonb_build_object(
  'summary_b',(select value from summaries where period='B'),
  'summary_a',(select value from summaries where period='A'),
  'performance',coalesce((select jsonb_agg(to_jsonb(performance) order by sessions desc,spend desc) from performance),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(to_jsonb(x) order by day) from (
    select day,count(*) sessions,count(distinct visitor_id) visitors,count(*) filter(where clicks>0) cta_click_sessions,sum(clicks) cta_clicks
    from filtered where period='B' group by day
  ) x),'[]'::jsonb),
  'actuals',coalesce((select jsonb_agg(to_jsonb(a) order by day desc) from campaign_actuals a where day between p_b_start and p_b_end),'[]'::jsonb),
  'campaign_summary',(select to_jsonb(t)||jsonb_build_object('roas',case when spend>0 then revenue/spend*100 else null end) from campaign_total t),
  'options',(select value from options),
  'data_state',jsonb_build_object('sessions_exist',exists(select 1 from sessions where period='B'),'filtered_sessions_exist',exists(select 1 from filtered where period='B'),'meta_exists',exists(select 1 from meta_filtered where period='B'))
) end
$$;
revoke all on function public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;
