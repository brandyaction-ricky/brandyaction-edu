-- Free-class marketing operations are additive. Legacy landing_actuals,
-- landing_meta_daily and edu_landing_report stay intact for compatibility.
create table public.landing_campaigns (
  id uuid primary key default gen_random_uuid(),
  landing_id uuid not null references public.landing_configs(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  utm_campaign text not null check (length(utm_campaign) between 1 and 250),
  start_day date not null,
  end_day date not null,
  new_customer_price integer not null default 1650000 check (new_customer_price >= 0),
  existing_customer_price integer not null default 1100000 check (existing_customer_price >= 0),
  live_peak integer check (live_peak >= 0),
  meta_ad_account_id text check (meta_ad_account_id is null or meta_ad_account_id ~ '^act_[0-9]+$'),
  meta_campaign_id text check (meta_campaign_id is null or meta_campaign_id ~ '^[0-9]+$'),
  meta_sync_status text not null default 'not_configured' check (meta_sync_status in ('not_configured','idle','syncing','success','failed')),
  meta_last_synced_at timestamptz,
  meta_sync_error text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (landing_id, utm_campaign),
  check (end_day >= start_day),
  check (end_day - start_day <= 3660)
);

create table public.landing_campaign_dimensions (
  campaign_id uuid not null references public.landing_campaigns(id) on delete cascade,
  adset_key text not null default '',
  creative_key text not null default '',
  ad_type text not null default 'unclassified' check (ad_type in ('cold','retarget','unclassified')),
  meta_adset_id text,
  meta_ad_id text,
  meta_creative_id text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, adset_key, creative_key)
);

create table public.landing_campaign_actuals (
  campaign_id uuid not null references public.landing_campaigns(id) on delete cascade,
  day date not null,
  kakao_members integer check (kakao_members >= 0),
  new_payments integer check (new_payments >= 0),
  existing_payments integer check (existing_payments >= 0),
  new_price_snapshot integer check (new_price_snapshot >= 0),
  existing_price_snapshot integer check (existing_price_snapshot >= 0),
  memo text check (memo is null or length(memo) <= 1000),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, day)
);

create table public.landing_campaign_actual_audit (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.landing_campaigns(id) on delete cascade,
  day date not null,
  before_value jsonb,
  after_value jsonb not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.landing_campaign_meta_daily (
  campaign_id uuid not null references public.landing_campaigns(id) on delete cascade,
  day date not null,
  campaign_name text not null,
  adset_name text not null default '',
  creative_name text not null default '',
  meta_campaign_id text not null,
  meta_adset_id text not null,
  meta_ad_id text not null,
  meta_creative_id text,
  impressions bigint not null check (impressions >= 0),
  link_clicks bigint not null check (link_clicks >= 0),
  spend numeric(16,2) not null check (spend >= 0),
  synced_at timestamptz not null default now(),
  primary key (campaign_id, day, meta_ad_id)
);

create index landing_campaigns_landing_period on public.landing_campaigns (landing_id, start_day, end_day);
create index landing_campaign_actuals_period on public.landing_campaign_actuals (campaign_id, day);
create index landing_campaign_actual_audit_lookup on public.landing_campaign_actual_audit (campaign_id, day, changed_at desc);
create index landing_campaign_meta_period on public.landing_campaign_meta_daily (campaign_id, day);
create index landing_campaign_dimensions_adset on public.landing_campaign_dimensions (campaign_id, adset_key);

do $$ declare t text; begin
  foreach t in array array[
    'landing_campaigns','landing_campaign_dimensions','landing_campaign_actuals',
    'landing_campaign_actual_audit','landing_campaign_meta_daily'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- One compatible campaign is created for each existing landing. Nothing is
-- copied out of the legacy actual/meta tables because those rows do not carry a
-- reliable internal campaign identity.
insert into public.landing_campaigns (landing_id, name, utm_campaign, start_day, end_day)
select l.id, c.title || ' 캠페인', 'default-' || l.id::text, l.campaign_start, l.campaign_end
from public.landing_configs l join public.courses c on c.id = l.id
on conflict (landing_id, utm_campaign) do nothing;

create or replace function public.edu_upsert_campaign_actual(
  p_campaign uuid, p_day date, p_values jsonb, p_clear text[], p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campaign public.landing_campaigns;
  old_row public.landing_campaign_actuals;
  saved public.landing_campaign_actuals;
  allowed text[] := array['kakao_members','new_payments','existing_payments','memo'];
  key text;
begin
  if p_day is null or p_values is null or jsonb_typeof(p_values) <> 'object' or p_actor is null then
    raise exception 'INVALID_ACTUAL_INPUT';
  end if;
  if exists (select 1 from jsonb_object_keys(p_values) as fields(key) where not (fields.key = any(allowed)))
     or exists (select 1 from unnest(coalesce(p_clear, array[]::text[])) as fields(key) where not (fields.key = any(allowed))) then
    raise exception 'INVALID_ACTUAL_FIELD';
  end if;
  select * into campaign from public.landing_campaigns where id = p_campaign;
  if not found or p_day < campaign.start_day or p_day > campaign.end_day then raise exception 'INVALID_CAMPAIGN_DAY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_campaign::text || p_day::text, 0));
  select * into old_row from public.landing_campaign_actuals where campaign_id=p_campaign and day=p_day for update;
  insert into public.landing_campaign_actuals (
    campaign_id, day, kakao_members, new_payments, existing_payments,
    new_price_snapshot, existing_price_snapshot, memo, updated_by
  ) values (
    p_campaign, p_day,
    case when 'kakao_members'=any(coalesce(p_clear,array[]::text[])) then null when p_values ? 'kakao_members' then (p_values->>'kakao_members')::integer else old_row.kakao_members end,
    case when 'new_payments'=any(coalesce(p_clear,array[]::text[])) then null when p_values ? 'new_payments' then (p_values->>'new_payments')::integer else old_row.new_payments end,
    case when 'existing_payments'=any(coalesce(p_clear,array[]::text[])) then null when p_values ? 'existing_payments' then (p_values->>'existing_payments')::integer else old_row.existing_payments end,
    coalesce(old_row.new_price_snapshot, campaign.new_customer_price),
    coalesce(old_row.existing_price_snapshot, campaign.existing_customer_price),
    case when 'memo'=any(coalesce(p_clear,array[]::text[])) then null when p_values ? 'memo' then nullif(left(p_values->>'memo',1000),'') else old_row.memo end,
    p_actor
  ) on conflict (campaign_id, day) do update set
    kakao_members=excluded.kakao_members, new_payments=excluded.new_payments,
    existing_payments=excluded.existing_payments, memo=excluded.memo,
    new_price_snapshot=coalesce(public.landing_campaign_actuals.new_price_snapshot, excluded.new_price_snapshot),
    existing_price_snapshot=coalesce(public.landing_campaign_actuals.existing_price_snapshot, excluded.existing_price_snapshot),
    updated_by=p_actor, updated_at=now()
  returning * into saved;
  insert into public.landing_campaign_actual_audit(campaign_id,day,before_value,after_value,changed_by)
  values(p_campaign,p_day,case when old_row.campaign_id is null then null else to_jsonb(old_row) end,to_jsonb(saved),p_actor);
  return to_jsonb(saved) || jsonb_build_object('revenue',coalesce(saved.new_payments,0)*saved.new_price_snapshot+coalesce(saved.existing_payments,0)*saved.existing_price_snapshot);
end $$;
revoke all on function public.edu_upsert_campaign_actual(uuid,date,jsonb,text[],uuid) from public,anon,authenticated;
grant execute on function public.edu_upsert_campaign_actual(uuid,date,jsonb,text[],uuid) to service_role;

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
), sessions as materialized (
  select p.period,s.*,(s.created_at at time zone 'Asia/Seoul')::date as day,
    coalesce(s.attribution->>'utm_campaign','') campaign,coalesce(s.attribution->>'utm_term','') adset,
    coalesce(s.attribution->>'utm_content','') creative,coalesce(nullif(s.attribution->>'device',''),'unknown') device,
    coalesce(d.ad_type,'unclassified') ad_type
  from periods p join selected c on true
  join public.funnel_sessions s on s.landing_id=c.landing_id and (s.created_at at time zone 'Asia/Seoul')::date between p.start_day and p.end_day
  left join public.landing_campaign_dimensions d on d.campaign_id=c.id and d.adset_key=coalesce(s.attribution->>'utm_term','') and d.creative_key=coalesce(s.attribution->>'utm_content','')
  where coalesce(s.attribution->>'utm_campaign','') in (c.utm_campaign,'')
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
  left join public.landing_campaign_dimensions d on d.campaign_id=m.campaign_id and d.meta_adset_id=m.meta_adset_id and d.meta_ad_id=m.meta_ad_id
  where (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
    and (p_adsets is null or m.adset_name=any(p_adsets)) and (p_creatives is null or m.creative_name=any(p_creatives))
    and p_devices is null and p_layouts is null
), meta_summary as (
  select period,coalesce(sum(impressions),0) impressions,coalesce(sum(link_clicks),0) link_clicks,coalesce(sum(spend),0) spend
  from meta_filtered group by period
), summaries as (
  select p.period,jsonb_build_object(
    'has_data',coalesce(ss.sessions,0)>0 or coalesce(ms.impressions,0)>0 or coalesce(ms.spend,0)>0,
    'sessions',coalesce(ss.sessions,0),'visitors',coalesce(vs.visitors,0),
    'cta_click_sessions',coalesce(ss.cta_click_sessions,0),'cta_clicks',coalesce(ss.cta_clicks,0),
    'converted_visitors',coalesce(vs.converted_visitors,0),'avg_dwell_ms',ss.avg_dwell_ms,'avg_scroll_depth',ss.avg_scroll_depth,
    'meta_impressions',coalesce(ms.impressions,0),'meta_link_clicks',coalesce(ms.link_clicks,0),'spend',coalesce(ms.spend,0)
  ) value from periods p left join session_summary ss using(period) left join visitor_summary vs using(period) left join meta_summary ms using(period)
), web_rows as (
  select campaign,adset,creative,ad_type,count(*) sessions,count(distinct visitor_id) visitors,
    count(*) filter(where clicks>0) cta_click_sessions,coalesce(sum(clicks),0) cta_clicks,
    avg(max_scroll_depth) avg_scroll_depth,avg(page_dwell_ms) avg_dwell_ms
  from filtered where period='B' group by campaign,adset,creative,ad_type
), meta_rows as (
  select campaign_name campaign,adset_name adset,creative_name creative,ad_type,
    sum(impressions) impressions,sum(link_clicks) link_clicks,sum(spend) spend
  from meta_filtered where period='B' group by campaign_name,adset_name,creative_name,ad_type
), performance as (
  select coalesce(w.campaign,m.campaign,'') campaign,coalesce(w.adset,m.adset,'') adset,
    coalesce(w.creative,m.creative,'') creative,coalesce(w.ad_type,m.ad_type,'unclassified') ad_type,
    coalesce(w.sessions,0) sessions,coalesce(w.visitors,0) visitors,
    coalesce(w.cta_click_sessions,0) cta_click_sessions,coalesce(w.cta_clicks,0) cta_clicks,
    w.avg_scroll_depth,w.avg_dwell_ms,coalesce(m.impressions,0) impressions,
    coalesce(m.link_clicks,0) link_clicks,coalesce(m.spend,0) spend
  from web_rows w full join meta_rows m using(campaign,adset,creative,ad_type)
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

create or replace function public.edu_marketing_export(
  p_campaign uuid,p_start date,p_end date,p_campaigns text[] default null,p_ad_types text[] default null,
  p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
with selected as (select * from public.landing_campaigns where id=p_campaign and p_start>=start_day and p_end<=end_day),
web as (
  select (s.created_at at time zone 'Asia/Seoul')::date as day,coalesce(d.ad_type,'unclassified') ad_type,
    coalesce(s.attribution->>'utm_campaign','') campaign,coalesce(s.attribution->>'utm_term','') adset,coalesce(s.attribution->>'utm_content','') creative,
    coalesce(nullif(s.attribution->>'device',''),'unknown') device,s.layout_ver,
    count(*) sessions,count(distinct s.visitor_id) visitors,count(*) filter(where s.clicks>0) cta_click_sessions,
    sum(s.clicks) cta_clicks,avg(s.max_scroll_depth) avg_scroll_depth,avg(s.page_dwell_ms) avg_dwell_ms
  from selected c join public.funnel_sessions s on s.landing_id=c.landing_id and (s.created_at at time zone 'Asia/Seoul')::date between p_start and p_end and coalesce(s.attribution->>'utm_campaign','') in (c.utm_campaign,'')
  left join public.landing_campaign_dimensions d on d.campaign_id=c.id and d.adset_key=coalesce(s.attribution->>'utm_term','') and d.creative_key=coalesce(s.attribution->>'utm_content','')
  where (p_campaigns is null or coalesce(s.attribution->>'utm_campaign','')=any(p_campaigns)) and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
    and (p_adsets is null or coalesce(s.attribution->>'utm_term','')=any(p_adsets)) and (p_creatives is null or coalesce(s.attribution->>'utm_content','')=any(p_creatives))
    and (p_devices is null or coalesce(nullif(s.attribution->>'device',''),'unknown')=any(p_devices)) and (p_layouts is null or s.layout_ver=any(p_layouts))
  group by (s.created_at at time zone 'Asia/Seoul')::date,coalesce(d.ad_type,'unclassified'),coalesce(s.attribution->>'utm_campaign',''),coalesce(s.attribution->>'utm_term',''),coalesce(s.attribution->>'utm_content',''),coalesce(nullif(s.attribution->>'device',''),'unknown'),s.layout_ver
), meta as (
  select m.day,coalesce(d.ad_type,'unclassified') ad_type,m.campaign_name campaign,m.adset_name adset,m.creative_name creative,
    '전체'::text device,null::integer layout_ver,0::bigint sessions,0::bigint visitors,0::bigint cta_click_sessions,0::bigint cta_clicks,
    null::numeric avg_scroll_depth,null::numeric avg_dwell_ms,sum(m.impressions) impressions,sum(m.link_clicks) link_clicks,sum(m.spend) spend
  from selected c join public.landing_campaign_meta_daily m on m.campaign_id=c.id and m.day between p_start and p_end
  left join public.landing_campaign_dimensions d on d.campaign_id=m.campaign_id and d.meta_adset_id=m.meta_adset_id and d.meta_ad_id=m.meta_ad_id
  where (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types)) and (p_adsets is null or m.adset_name=any(p_adsets))
    and (p_creatives is null or m.creative_name=any(p_creatives)) and p_devices is null and p_layouts is null
  group by m.day,coalesce(d.ad_type,'unclassified'),m.campaign_name,m.adset_name,m.creative_name
), rows as (
  select day,ad_type,campaign,adset,creative,device,layout_ver,sessions,visitors,cta_click_sessions,cta_clicks,avg_scroll_depth,avg_dwell_ms,
    0::numeric impressions,0::numeric link_clicks,0::numeric spend from web
  union all select * from meta
)
select coalesce(jsonb_agg(to_jsonb(rows) order by day, campaign, adset, creative, device),'[]'::jsonb) from rows
$$;
revoke all on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;
