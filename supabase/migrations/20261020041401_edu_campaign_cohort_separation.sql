begin;
set local lock_timeout='5s';
-- No historical attribution rewrite, data transfer or guessed collection state.
alter table public.landing_campaign_meta_daily add column landing_page_views bigint check(landing_page_views>=0), add column landing_page_view_available boolean;

-- Service-only management boundary: campaign settings, cohort binding and audit
-- commit together. No recruitment destination, customer or order is mutated.
create table public.edu_marketing_campaign_audit (
 id bigint generated always as identity primary key,
 campaign_id uuid not null references public.landing_campaigns(id),
 operation text not null check(operation in ('create','update')),
 request jsonb not null, before_value jsonb, after_value jsonb not null,
 actor_id uuid not null references public.profiles(id), changed_at timestamptz not null default clock_timestamp()
);
create index on public.edu_marketing_campaign_audit(campaign_id,changed_at desc);
alter table public.edu_marketing_campaign_audit enable row level security;
revoke all on public.edu_marketing_campaign_audit from public,anon,authenticated,service_role;

create function public.edu_marketing_campaign_catalog(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; perms jsonb;
begin
 select * into actor from public.profiles where id=p_actor and status='active' and deleted_at is null;
 if not found or actor.role not in ('admin','staff') then raise exception 'CAMPAIGN_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into perms from public.site_settings where key='edu_staff_permissions_'||p_actor::text;
  if perms->'marketing' is distinct from 'true'::jsonb then raise exception 'CAMPAIGN_FORBIDDEN'; end if;
 end if;
 return jsonb_build_object(
  'cohorts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',s.title,'cohort_code',c.cohort_code) order by c.cohort_code desc) from public.cohorts c join public.courses s on s.id=c.course_id where s.category='paid_class' and s.archived_at is null),'[]'),
  'bindings',coalesce((select jsonb_agg(jsonb_build_object('campaign_id',m.campaign_id,'cohort_id',m.cohort_id,'conflicted',m.conflicted,'label',concat_ws(' · ',s.title,c.cohort_code))) from public.edu_marketing_campaign_cohorts m left join public.cohorts c on c.id=m.cohort_id left join public.courses s on s.id=c.course_id),'[]'));
end $$;
revoke all on function public.edu_marketing_campaign_catalog(uuid) from public,anon,authenticated,service_role;
grant execute on function public.edu_marketing_campaign_catalog(uuid) to service_role;

create function public.edu_manage_marketing_campaign(p_actor uuid,p_campaign uuid,p_landing uuid,p_create boolean,p_expected_updated_at timestamptz,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; c public.landing_campaigns; saved public.landing_campaigns;
 before_value jsonb; cohort uuid; requested_cohort uuid; ids text[]; account text; stamp timestamptz:=clock_timestamp(); connection_changed boolean;
begin
 select * into actor from public.profiles where id=p_actor and status='active' and deleted_at is null;
 if not found or actor.role<>'admin' then raise exception 'CAMPAIGN_FORBIDDEN'; end if;
 if p_campaign is null or p_landing is null or p_create is null or p_values is null or jsonb_typeof(p_values)<>'object'
  or p_values-array['name','utm_campaign','start_day','end_day','new_customer_price','existing_customer_price','live_peak','uses_ads','meta_campaign_ids','paid_cohort_id']<>'{}'::jsonb
  or coalesce(length(btrim(p_values->>'name')),0) not between 1 and 200 or coalesce(length(btrim(p_values->>'utm_campaign')),0) not between 1 and 250
  or jsonb_typeof(p_values->'meta_campaign_ids') is distinct from 'array'
  or jsonb_array_length(p_values->'meta_campaign_ids')>20 or jsonb_typeof(p_values->'uses_ads') is distinct from 'boolean'
  or (p_values->>'start_day')::date is null or (p_values->>'end_day')::date is null
  or (p_values->>'end_day')::date<(p_values->>'start_day')::date or (p_values->>'end_day')::date-(p_values->>'start_day')::date>3660
  or (p_values->>'new_customer_price')::int is null or (p_values->>'new_customer_price')::int<0
  or (p_values->>'existing_customer_price')::int is null or (p_values->>'existing_customer_price')::int<0 or (p_values->>'live_peak')::int<0
  then raise exception 'CAMPAIGN_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_values->'meta_campaign_ids') v where jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^[0-9]+$' or length(v#>>'{}')>50) then raise exception 'CAMPAIGN_INVALID'; end if;
 select coalesce(array_agg(distinct v order by v),'{}') into ids from jsonb_array_elements_text(p_values->'meta_campaign_ids') v;
 select value->>'adAccountId' into account from public.site_settings where key='edu_meta_marketing';
 account:=nullif(btrim(account),'');
 if account ~ '^[0-9]+$' then account:='act_'||account; end if;
 if account is not null and account!~'^act_[0-9]+$' then raise exception 'CAMPAIGN_INVALID_ACCOUNT'; end if;
 -- Same lock order as recruitment management, then campaign rows. Serializes
 -- overlapping-ID validation across concurrent campaign creations.
 perform pg_advisory_xact_lock(207260921,9);
 select * into c from public.landing_campaigns where id=p_campaign for update;
 if p_create and found then
  if exists(select 1 from public.edu_marketing_campaign_audit where campaign_id=p_campaign and operation='create' and actor_id=p_actor and request=p_values)
   then return to_jsonb(c)||jsonb_build_object('paid_cohort_id',(select cohort_id from public.edu_marketing_campaign_cohorts where campaign_id=p_campaign)); end if;
  raise exception 'CAMPAIGN_ID_CONFLICT';
 elsif not p_create and (c.id is null or c.landing_id<>p_landing) then raise exception 'CAMPAIGN_NOT_FOUND';
 elsif not p_create and (p_expected_updated_at is null or c.updated_at is distinct from p_expected_updated_at) then raise exception 'CAMPAIGN_CHANGED'; end if;
 if c.meta_sync_status='syncing' then raise exception 'CAMPAIGN_SYNCING'; end if;
 if p_create and not exists(select 1 from public.landing_configs l join public.courses s on s.id=l.id where l.id=p_landing and s.category='free' and s.archived_at is null) then raise exception 'CAMPAIGN_INVALID_LANDING'; end if;
 if exists(select 1 from public.landing_campaigns x where x.id<>p_campaign and x.landing_id=p_landing
   and x.start_day<=(p_values->>'end_day')::date and x.end_day>=(p_values->>'start_day')::date and x.uses_ads and (p_values->>'uses_ads')::boolean and x.meta_campaign_ids && ids)
   then raise exception 'CAMPAIGN_META_OVERLAP'; end if;
 if exists(select 1 from public.edu_marketing_campaign_cohorts where campaign_id=p_campaign and conflicted) then raise exception 'CAMPAIGN_COHORT_CONFLICT'; end if;
 select cohort_id into cohort from public.edu_marketing_campaign_cohorts where campaign_id=p_campaign;
 requested_cohort:=case when p_values?'paid_cohort_id' then nullif(p_values->>'paid_cohort_id','')::uuid else cohort end;
 if cohort is not null and cohort is distinct from requested_cohort then raise exception 'CAMPAIGN_COHORT_REVIEW'; end if;
 if requested_cohort is not null and not exists(select 1 from public.cohorts pc join public.courses s on s.id=pc.course_id where pc.id=requested_cohort and s.category='paid_class' and (s.archived_at is null or pc.id=cohort)) then raise exception 'CAMPAIGN_INVALID_COHORT'; end if;
 stamp:=clock_timestamp();
 before_value:=case when c.id is not null then to_jsonb(c)||jsonb_build_object('paid_cohort_id',cohort) end;
 connection_changed:=c.meta_ad_account_id is distinct from account or coalesce(c.meta_campaign_ids,'{}') is distinct from ids;
 if p_create then
  insert into public.landing_campaigns(id,landing_id,name,utm_campaign,start_day,end_day,new_customer_price,existing_customer_price,live_peak,uses_ads,meta_ad_account_id,meta_campaign_ids,meta_campaign_id,meta_sync_status,created_by,updated_by,updated_at)
  values(p_campaign,p_landing,btrim(p_values->>'name'),btrim(p_values->>'utm_campaign'),(p_values->>'start_day')::date,(p_values->>'end_day')::date,(p_values->>'new_customer_price')::int,(p_values->>'existing_customer_price')::int,(p_values->>'live_peak')::int,(p_values->>'uses_ads')::boolean,account,ids,ids[1],case when account is null or cardinality(ids)=0 then 'not_configured' else 'idle' end,p_actor,p_actor,stamp) returning * into saved;
 else
  update public.landing_campaigns set name=btrim(p_values->>'name'),utm_campaign=btrim(p_values->>'utm_campaign'),start_day=(p_values->>'start_day')::date,end_day=(p_values->>'end_day')::date,
   new_customer_price=(p_values->>'new_customer_price')::int,existing_customer_price=(p_values->>'existing_customer_price')::int,live_peak=(p_values->>'live_peak')::int,uses_ads=(p_values->>'uses_ads')::boolean,
   meta_ad_account_id=account,meta_campaign_ids=ids,meta_campaign_id=ids[1],meta_sync_status=case when account is null or cardinality(ids)=0 then 'not_configured' when connection_changed or c.meta_sync_status='not_configured' then 'idle' else c.meta_sync_status end,
   meta_sync_error=case when connection_changed then null else c.meta_sync_error end,updated_by=p_actor,updated_at=stamp where id=p_campaign returning * into saved;
 end if;
 if requested_cohort is not null and cohort is null then
  insert into public.edu_marketing_approved_cohort_links(campaign_id,cohort_id,confirmation_basis,confirmed_at)
  values(p_campaign,requested_cohort,'관리자가 광고·웨비나 성과의 유료 기수 연결에서 직접 확인',stamp);
 end if;
 insert into public.edu_marketing_campaign_audit(campaign_id,operation,request,before_value,after_value,actor_id)
 values(p_campaign,case when p_create then 'create' else 'update' end,p_values,before_value,to_jsonb(saved)||jsonb_build_object('paid_cohort_id',requested_cohort),p_actor);
 return to_jsonb(saved)||jsonb_build_object('paid_cohort_id',requested_cohort);
end $$;
revoke all on function public.edu_manage_marketing_campaign(uuid,uuid,uuid,boolean,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.edu_manage_marketing_campaign(uuid,uuid,uuid,boolean,timestamptz,jsonb) to service_role;


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
  select * into campaign from public.landing_campaigns where id = p_campaign for share;
  if not found or p_day < campaign.start_day-1 or p_day > campaign.end_day then raise exception 'INVALID_CAMPAIGN_DAY'; end if;
  if p_day=campaign.start_day-1 and (p_values ?| array['new_payments','existing_payments'] or coalesce(p_clear,'{}') && array['new_payments','existing_payments']) then raise exception 'INVALID_BASELINE_FIELDS'; end if;
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

create or replace function public.edu_store_campaign_meta(
  p_campaign uuid, p_expected_updated_at timestamptz, p_rows jsonb, p_dimensions jsonb, p_actor uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare c public.landing_campaigns; stamp timestamptz := clock_timestamp();
begin
  select * into c from public.landing_campaigns where id=p_campaign for update;
  if not found or c.updated_at is distinct from p_expected_updated_at or c.meta_sync_status <> 'syncing' then raise exception 'META_SETTINGS_CHANGED'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_dimensions)<>'array' then raise exception 'INVALID_META_ROWS'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as x(meta_campaign_id text, day date, registrations bigint, registration_cost numeric, landing_page_views bigint)
    where x.meta_campaign_id is null or not (x.meta_campaign_id=any(c.meta_campaign_ids)) or x.day is null or x.day<c.start_day or x.day>c.end_day
      or coalesce(x.landing_page_views,0)<0 or coalesce(x.registrations,0)<0 or coalesce(x.registration_cost,0)<0)
    then raise exception 'INVALID_META_ROWS'; end if;
  insert into public.landing_campaign_meta_daily(campaign_id,day,campaign_name,adset_name,creative_name,meta_campaign_id,meta_adset_id,meta_ad_id,meta_creative_id,impressions,link_clicks,spend,registrations,registration_cost,registration_available,landing_page_views,landing_page_view_available,synced_at)
  select p_campaign,x.day,x.campaign_name,x.adset_name,x.creative_name,x.meta_campaign_id,x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,x.impressions,x.link_clicks,x.spend,coalesce(x.registrations,0),x.registration_cost,coalesce(x.registration_available,false),x.landing_page_views,coalesce(x.landing_page_view_available,false),stamp
  from jsonb_to_recordset(p_rows) as x(day date,campaign_name text,adset_name text,creative_name text,meta_campaign_id text,meta_adset_id text,meta_ad_id text,meta_creative_id text,impressions bigint,link_clicks bigint,spend numeric,registrations bigint,registration_cost numeric,registration_available boolean,landing_page_views bigint,landing_page_view_available boolean)
  on conflict(campaign_id,day,meta_ad_id) do update set campaign_name=excluded.campaign_name,adset_name=excluded.adset_name,creative_name=excluded.creative_name,meta_campaign_id=excluded.meta_campaign_id,meta_adset_id=excluded.meta_adset_id,meta_creative_id=excluded.meta_creative_id,impressions=excluded.impressions,link_clicks=excluded.link_clicks,spend=excluded.spend,registrations=excluded.registrations,registration_cost=excluded.registration_cost,registration_available=excluded.registration_available,landing_page_views=excluded.landing_page_views,landing_page_view_available=excluded.landing_page_view_available,synced_at=excluded.synced_at;
  insert into public.landing_campaign_dimensions(campaign_id,adset_key,creative_key,meta_adset_id,meta_ad_id,meta_creative_id,ad_type,updated_by,updated_at)
  select p_campaign,left(x.adset_key,250),left(x.creative_key,250),x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,'unclassified',p_actor,stamp
  from jsonb_to_recordset(p_dimensions) as x(adset_key text,creative_key text,meta_adset_id text,meta_ad_id text,meta_creative_id text)
  on conflict(campaign_id,adset_key,creative_key) do update set meta_adset_id=excluded.meta_adset_id,meta_ad_id=excluded.meta_ad_id,meta_creative_id=excluded.meta_creative_id,updated_at=case when public.landing_campaign_dimensions.meta_ad_id is distinct from excluded.meta_ad_id then stamp else public.landing_campaign_dimensions.updated_at end;
  update public.landing_campaigns set meta_sync_status='success',meta_last_synced_at=stamp,meta_sync_attempted_at=coalesce(meta_sync_attempted_at,stamp),meta_sync_error=null,updated_by=p_actor,updated_at=stamp where id=p_campaign;
end $$;
revoke all on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) to service_role;

create or replace function public.edu_marketing_dashboard(
  p_campaign uuid,p_b_start date,p_b_end date,p_a_start date default null,p_a_end date default null,p_campaigns text[] default null,p_ad_types text[] default null,p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null
) returns jsonb language sql stable security invoker set search_path='' as $$
with selected as (
  select c.* from public.landing_campaigns c where c.id=p_campaign and p_b_start between c.start_day and c.end_day and p_b_end between c.start_day and c.end_day and p_b_end>=p_b_start and p_b_end-p_b_start<=3660
    and ((p_a_start is null and p_a_end is null) or (p_a_start is not null and p_a_end is not null and p_a_end>=p_a_start and p_a_end-p_a_start=p_b_end-p_b_start))
), periods as (select 'B'::text period,p_b_start start_day,p_b_end end_day union all select 'A',p_a_start,p_a_end where p_a_start is not null),
dimensions as materialized (
  select distinct on(adset_key,creative_key) adset_key,creative_key,ad_type,meta_adset_id,meta_ad_id,updated_at from public.landing_campaign_dimensions where campaign_id=p_campaign order by adset_key,creative_key,(ad_type='unclassified'),updated_at desc
), session_source as materialized (
  select p.period,s.visitor_id,s.layout_ver,s.clicks,s.page_dwell_ms,s.max_scroll_depth,s.last_seen_at,
    (s.created_at at time zone 'Asia/Seoul')::date as day,
    coalesce(s.attribution->>'utm_campaign','') raw_campaign,
    coalesce(s.attribution->>'utm_term','') raw_adset,
    coalesce(s.attribution->>'utm_content','') raw_creative,
    s.attribution->>'utm_campaign_normalized' normalized_campaign,
    s.attribution->>'utm_term_normalized' normalized_adset,
    s.attribution->>'utm_content_normalized' normalized_creative,
    coalesce(nullif(s.attribution->>'device',''),'unknown') device
  from periods p join selected c on true join public.funnel_sessions s on s.landing_id=c.landing_id
    and s.created_at >= (p.start_day::timestamp at time zone 'Asia/Seoul')
    and s.created_at < ((p.end_day + 1)::timestamp at time zone 'Asia/Seoul')
), decoded_values as materialized (
  -- Decode each distinct missing-normalized value once, rather than per visit/join.
  select raw_value,public.edu_decode_landing_utm_once(raw_value) decoded_value from (
    select raw_campaign raw_value from session_source where normalized_campaign is null
    union select raw_adset from session_source where normalized_adset is null
    union select raw_creative from session_source where normalized_creative is null
  ) values_to_decode
), normalized_sessions as materialized (
  select s.*,coalesce(s.normalized_campaign,dc.decoded_value) campaign,
    coalesce(s.normalized_adset,da.decoded_value) adset,coalesce(s.normalized_creative,di.decoded_value) creative
  from session_source s
  left join decoded_values dc on s.normalized_campaign is null and dc.raw_value=s.raw_campaign
  left join decoded_values da on s.normalized_adset is null and da.raw_value=s.raw_adset
  left join decoded_values di on s.normalized_creative is null and di.raw_value=s.raw_creative
), dimension_matches as materialized (
  select k.*,d.ad_type,d.meta_adset_id,d.meta_ad_id
  from (select distinct adset,raw_adset,creative,raw_creative from normalized_sessions) k
  left join lateral (
    select x.ad_type,x.meta_adset_id,x.meta_ad_id from dimensions x
    where x.adset_key in (k.adset,k.raw_adset) and x.creative_key in (k.creative,k.raw_creative)
    order by (x.adset_key=k.adset and x.creative_key=k.creative) desc,(x.ad_type='unclassified'),x.updated_at desc limit 1
  ) d on true
), sessions as materialized (
  select s.period,s.visitor_id,s.layout_ver,s.clicks,s.page_dwell_ms,s.max_scroll_depth,s.last_seen_at,
    s.day,s.campaign,s.adset,s.creative,s.device,coalesce(d.ad_type,'unclassified') ad_type,d.meta_adset_id,d.meta_ad_id
  from normalized_sessions s join dimension_matches d
    on d.adset=s.adset and d.raw_adset=s.raw_adset and d.creative=s.creative and d.raw_creative=s.raw_creative
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
   case when count(*)=1 then max(registration_cost) else null end registration_cost,case when bool_and(registration_available is true) then true when bool_or(registration_available is false) then false end registration_available,
   sum(landing_page_views) landing_page_views,case when bool_and(landing_page_view_available is true) then true when bool_or(landing_page_view_available is false) then false end landing_page_view_available
 from meta_filtered where period='B' group by meta_ad_id
), performance as (
 select coalesce(w.campaign,m.campaign,'') campaign,coalesce(m.adset,w.adset,'') adset,coalesce(m.creative,w.creative,'') creative,coalesce(w.ad_type,m.ad_type,'unclassified') ad_type,
   coalesce(w.sessions,0) sessions,coalesce(w.visitors,0) visitors,coalesce(w.cta_click_sessions,0) cta_click_sessions,coalesce(w.cta_clicks,0) cta_clicks,w.avg_scroll_depth,w.avg_dwell_ms,
   coalesce(m.impressions,0) impressions,coalesce(m.link_clicks,0) link_clicks,coalesce(m.spend,0) spend,coalesce(m.registrations,0) registrations,m.registration_cost,m.registration_available,m.landing_page_views,m.landing_page_view_available
 from web_rows w full join meta_rows m on w.meta_ad_id=m.meta_ad_id and w.meta_ad_id is not null
), campaign_actuals as (select a.*,coalesce(a.new_payments,0)*a.new_price_snapshot+coalesce(a.existing_payments,0)*a.existing_price_snapshot revenue from public.landing_campaign_actuals a where a.campaign_id=p_campaign),
current_kakao as (select kakao_members,lag(kakao_members) over(order by day) previous from campaign_actuals where kakao_members is not null order by day desc limit 1),
campaign_total as (
 select max(c.live_peak) live_peak,(select kakao_members from current_kakao) kakao_members,(select kakao_members-previous from current_kakao) kakao_delta,coalesce(sum(a.new_payments),0) new_payments,coalesce(sum(a.existing_payments),0) existing_payments,coalesce(sum(a.revenue),0) revenue,
 case when bool_or(c.uses_ads) then coalesce((select sum(m.spend) from public.landing_campaign_meta_daily m join selected x on x.id=m.campaign_id where m.meta_campaign_id=any(x.meta_campaign_ids) and m.day between x.start_day and x.end_day),0) else 0 end spend
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
     'baseline_day',p_b_start-1,'baseline_members',(select kakao_members from campaign_actuals where day=p_b_start-1),
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

create or replace function public.edu_marketing_export(p_campaign uuid,p_start date,p_end date,p_campaigns text[] default null,p_ad_types text[] default null,p_adsets text[] default null,p_creatives text[] default null,p_devices text[] default null,p_layouts integer[] default null)
returns jsonb language sql stable security invoker set search_path='' as $$
with selected as (select * from public.landing_campaigns where id=p_campaign and p_start>=start_day and p_end<=end_day),
web as (
 select (s.created_at at time zone 'Asia/Seoul')::date as day,coalesce(d.ad_type,'unclassified') ad_type,
   coalesce(s.attribution->>'utm_campaign_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_campaign',''))) campaign,
   coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))) adset,
   coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content',''))) creative,
   coalesce(nullif(s.attribution->>'device',''),'unknown') device,s.layout_ver,count(*) sessions,count(distinct s.visitor_id) visitors,count(*) filter(where s.clicks>0) cta_click_sessions,sum(s.clicks) cta_clicks,avg(s.max_scroll_depth) avg_scroll_depth,avg(s.page_dwell_ms) avg_dwell_ms,
   0::numeric impressions,0::numeric link_clicks,0::numeric spend,0::bigint registrations,null::numeric registration_cost,false registration_available,null::bigint landing_page_views,false landing_page_view_available
 from selected c join public.funnel_sessions s on s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul')
 left join lateral (select x.ad_type from public.landing_campaign_dimensions x where x.campaign_id=c.id
   and x.adset_key in (coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))),coalesce(s.attribution->>'utm_term',''))
   and x.creative_key in (coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content',''))),coalesce(s.attribution->>'utm_content',''))
   order by (x.adset_key=coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term',''))) and x.creative_key=coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content','')))) desc,(x.ad_type='unclassified'),x.updated_at desc limit 1) d on true
 where (p_campaigns is null or coalesce(s.attribution->>'utm_campaign_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_campaign','')))=any(p_campaigns))
   and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
   and (p_adsets is null or coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term','')))=any(p_adsets))
   and (p_creatives is null or coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content','')))=any(p_creatives))
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
 where (p_campaigns is null or m.campaign_name=any(p_campaigns) or exists(select 1 from public.funnel_sessions s join public.landing_campaign_dimensions x on x.campaign_id=c.id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id where s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul') and coalesce(s.attribution->>'utm_campaign_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_campaign','')))=any(p_campaigns)))
   and (p_ad_types is null or coalesce(d.ad_type,'unclassified')=any(p_ad_types))
   and (p_adsets is null or m.adset_name=any(p_adsets) or exists(select 1 from public.funnel_sessions s join public.landing_campaign_dimensions x on x.campaign_id=c.id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id where s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul') and coalesce(s.attribution->>'utm_term_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_term','')))=any(p_adsets)))
   and (p_creatives is null or m.creative_name=any(p_creatives) or exists(select 1 from public.funnel_sessions s join public.landing_campaign_dimensions x on x.campaign_id=c.id and x.meta_adset_id=m.meta_adset_id and x.meta_ad_id=m.meta_ad_id where s.landing_id=c.landing_id and s.created_at >= (p_start::timestamp at time zone 'Asia/Seoul') and s.created_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul') and coalesce(s.attribution->>'utm_content_normalized',public.edu_decode_landing_utm_once(coalesce(s.attribution->>'utm_content','')))=any(p_creatives)))
   and p_devices is null and p_layouts is null group by 1,2,3,4,5
), rows as (select * from web union all select * from meta)
select coalesce(jsonb_agg(to_jsonb(rows) order by day,campaign,adset,creative,device),'[]'::jsonb) from rows $$;
revoke all on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) from public,anon,authenticated;
grant execute on function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) to service_role;

create or replace function public.edu_marketing_insights(
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
 if exists(select 1 from public.edu_marketing_campaign_cohorts where campaign_id=p_campaign and conflicted) then
  raise exception 'INSIGHTS_COHORT_CONFLICT';
 end if;
 select m.cohort_id,concat_ws(' · ',s.title,c.cohort_code) into cohort,cohort_label
 from public.edu_marketing_campaign_cohorts m
 join public.cohorts c on c.id=m.cohort_id join public.courses s on s.id=c.course_id
 where m.campaign_id=p_campaign;
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
   select c.* from public.landing_campaigns c join public.edu_marketing_campaign_cohorts m on m.campaign_id=c.id
   where m.cohort_id=cohort and not m.conflicted and c.uses_ads and c.start_day<=(statement_timestamp() at time zone 'Asia/Seoul')::date
  ), ad_rows as (
   -- The same Meta ad/day may be linked from several free pages. Count it once.
   select distinct on(m.day,m.meta_campaign_id,m.meta_ad_id) m.* from public.landing_campaign_meta_daily m
   join campaigns c on c.id=m.campaign_id where m.meta_campaign_id=any(c.meta_campaign_ids) and m.day between c.start_day and c.end_day and m.day<=(statement_timestamp() at time zone 'Asia/Seoul')::date
   order by m.day,m.meta_campaign_id,m.meta_ad_id,m.synced_at desc,m.campaign_id
  ), ad_state as (
   select exists(select 1 from campaigns) and not exists(select 1 from campaigns c where c.meta_sync_status is distinct from 'success' or c.meta_last_synced_at is null or (c.meta_last_synced_at at time zone 'Asia/Seoul')::date<least(c.end_day+1,(statement_timestamp() at time zone 'Asia/Seoul')::date))
    and not exists(select 1 from ad_rows where spend is null or spend<0 or spend::text in ('NaN','Infinity','-Infinity'))
    and not exists(select 1 from public.edu_marketing_campaign_cohorts where conflicted and (native_cohort_id=cohort or approved_cohort_id=cohort))
    and not exists(select 1 from ad_rows a join public.landing_campaign_meta_daily m on m.day=a.day and m.meta_campaign_id=a.meta_campaign_id and m.meta_ad_id=a.meta_ad_id
     join public.edu_marketing_campaign_cohorts linked on linked.campaign_id=m.campaign_id join public.landing_campaigns other on other.id=m.campaign_id where other.uses_ads and m.meta_campaign_id=any(other.meta_campaign_ids) and m.day between other.start_day and other.end_day and (linked.cohort_id is distinct from cohort or linked.conflicted)) ready,
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
