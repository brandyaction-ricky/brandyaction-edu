-- Keep the scalar field compatible with earlier application deployments.
alter table public.landing_campaigns add column meta_campaign_ids text[];
update public.landing_campaigns set meta_campaign_ids = case when meta_campaign_id is null then '{}'::text[] else array[meta_campaign_id] end;
alter table public.landing_campaigns alter column meta_campaign_ids set not null;
alter table public.landing_campaigns alter column meta_campaign_ids set default '{}';

create function public.edu_normalize_meta_campaign_ids() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.meta_campaign_ids),0)=0 and new.meta_campaign_id is not null then
      new.meta_campaign_ids := array[new.meta_campaign_id];
    end if;
  elsif new.meta_campaign_ids is not distinct from old.meta_campaign_ids and new.meta_campaign_id is distinct from old.meta_campaign_id then
    new.meta_campaign_ids := case when new.meta_campaign_id is null then '{}'::text[] else array[new.meta_campaign_id] end;
  end if;
  new.meta_campaign_ids := coalesce(new.meta_campaign_ids, '{}'::text[]);
  if cardinality(new.meta_campaign_ids)>20 or exists(select 1 from unnest(new.meta_campaign_ids) id where id is null or id !~ '^[0-9]+$') then
    raise exception 'INVALID_META_CAMPAIGN_IDS';
  end if;
  select coalesce(array_agg(id order by position),'{}'::text[]) into new.meta_campaign_ids
  from (select id,min(ordinality) position from unnest(new.meta_campaign_ids) with ordinality as ids(id,ordinality) group by id) unique_ids;
  new.meta_campaign_id := new.meta_campaign_ids[1];
  return new;
end $$;
revoke all on function public.edu_normalize_meta_campaign_ids() from public,anon,authenticated;
grant execute on function public.edu_normalize_meta_campaign_ids() to service_role;
create trigger landing_campaigns_meta_ids before insert or update of meta_campaign_id,meta_campaign_ids
on public.landing_campaigns for each row execute function public.edu_normalize_meta_campaign_ids();

-- Meta rows, dimensions and successful status commit together. Repeated syncs
-- overwrite the same day/ad; failed or stale syncs leave existing rows intact.
create function public.edu_store_campaign_meta(
  p_campaign uuid, p_expected_updated_at timestamptz, p_rows jsonb, p_dimensions jsonb, p_actor uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare c public.landing_campaigns; stamp timestamptz := clock_timestamp();
begin
  select * into c from public.landing_campaigns where id=p_campaign for update;
  if not found or c.updated_at is distinct from p_expected_updated_at or c.meta_sync_status <> 'syncing' then raise exception 'META_SETTINGS_CHANGED'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_dimensions)<>'array' then raise exception 'INVALID_META_ROWS'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as x(meta_campaign_id text, day date)
    where x.meta_campaign_id is null or not (x.meta_campaign_id=any(c.meta_campaign_ids)) or x.day is null or x.day<c.start_day or x.day>c.end_day)
    then raise exception 'INVALID_META_ROWS'; end if;
  insert into public.landing_campaign_meta_daily(campaign_id,day,campaign_name,adset_name,creative_name,meta_campaign_id,meta_adset_id,meta_ad_id,meta_creative_id,impressions,link_clicks,spend,synced_at)
  select p_campaign,x.day,x.campaign_name,x.adset_name,x.creative_name,x.meta_campaign_id,x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,x.impressions,x.link_clicks,x.spend,stamp
  from jsonb_to_recordset(p_rows) as x(day date,campaign_name text,adset_name text,creative_name text,meta_campaign_id text,meta_adset_id text,meta_ad_id text,meta_creative_id text,impressions bigint,link_clicks bigint,spend numeric)
  on conflict(campaign_id,day,meta_ad_id) do update set campaign_name=excluded.campaign_name,adset_name=excluded.adset_name,creative_name=excluded.creative_name,meta_campaign_id=excluded.meta_campaign_id,meta_adset_id=excluded.meta_adset_id,meta_creative_id=excluded.meta_creative_id,impressions=excluded.impressions,link_clicks=excluded.link_clicks,spend=excluded.spend,synced_at=excluded.synced_at;
  insert into public.landing_campaign_dimensions(campaign_id,adset_key,creative_key,meta_adset_id,meta_ad_id,meta_creative_id,ad_type,updated_by,updated_at)
  select p_campaign,x.adset_key,x.creative_key,x.meta_adset_id,x.meta_ad_id,x.meta_creative_id,'unclassified',p_actor,stamp
  from jsonb_to_recordset(p_dimensions) as x(adset_key text,creative_key text,meta_adset_id text,meta_ad_id text,meta_creative_id text)
  on conflict(campaign_id,adset_key,creative_key) do nothing;
  update public.landing_campaigns set meta_sync_status='success',meta_last_synced_at=stamp,meta_sync_error=null,updated_by=p_actor,updated_at=stamp where id=p_campaign;
end $$;
revoke all on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid) to service_role;
