-- BA-META-SYNC-502-001: one insight per day can repeat the same ad dimension.
-- Deduplicate before the upsert so a single INSERT never targets one PK twice.
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
  insert into public.landing_campaign_meta_daily(campaign_id,day,campaign_name,adset_name,creative_name,meta_campaign_id,meta_adset_id,meta_ad_id,meta_creative_id,impressions,link_clicks,spend,registrations,registration_cost,synced_at)
  select p_campaign,x.day,x.campaign_name,x.adset_name,x.creative_name,x.meta_campaign_id,x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,x.impressions,x.link_clicks,x.spend,coalesce(x.registrations,0),x.registration_cost,stamp
  from jsonb_to_recordset(p_rows) as x(day date,campaign_name text,adset_name text,creative_name text,meta_campaign_id text,meta_adset_id text,meta_ad_id text,meta_creative_id text,impressions bigint,link_clicks bigint,spend numeric,registrations bigint,registration_cost numeric)
  on conflict(campaign_id,day,meta_ad_id) do update set campaign_name=excluded.campaign_name,adset_name=excluded.adset_name,creative_name=excluded.creative_name,meta_campaign_id=excluded.meta_campaign_id,meta_adset_id=excluded.meta_adset_id,meta_creative_id=excluded.meta_creative_id,impressions=excluded.impressions,link_clicks=excluded.link_clicks,spend=excluded.spend,registrations=excluded.registrations,registration_cost=excluded.registration_cost,synced_at=excluded.synced_at;
  insert into public.landing_campaign_dimensions(campaign_id,adset_key,creative_key,meta_adset_id,meta_ad_id,meta_creative_id,ad_type,updated_by,updated_at)
  select p_campaign,left(x.adset_key,250),left(x.creative_key,250),x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,'unclassified',p_actor,stamp
  from (
    select distinct on(adset_key,creative_key) adset_key,creative_key,meta_adset_id,meta_ad_id,meta_creative_id
    from jsonb_to_recordset(p_dimensions) as d(adset_key text,creative_key text,meta_adset_id text,meta_ad_id text,meta_creative_id text)
    order by adset_key,creative_key,meta_ad_id
  ) x
  on conflict(campaign_id,adset_key,creative_key) do update set meta_adset_id=excluded.meta_adset_id,meta_ad_id=excluded.meta_ad_id,meta_creative_id=excluded.meta_creative_id,updated_at=case when public.landing_campaign_dimensions.meta_ad_id is distinct from excluded.meta_ad_id then stamp else public.landing_campaign_dimensions.updated_at end;
  update public.landing_campaigns set meta_sync_status='success',meta_last_synced_at=stamp,meta_sync_attempted_at=coalesce(meta_sync_attempted_at,stamp),meta_sync_error=null,updated_by=p_actor,updated_at=stamp where id=p_campaign;
end $$;
revoke all on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) to service_role;
