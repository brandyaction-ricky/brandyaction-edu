-- Run against DEV only. All fixtures are rolled back.
begin;
do $$
declare
  fixture uuid := gen_random_uuid(); landing uuid; c public.landing_campaigns;
  stamp timestamptz := clock_timestamp();
  rows jsonb := '[{"day":"2026-09-14","campaign_name":"Fixture A","adset_name":"Set A","creative_name":"Ad A","meta_campaign_id":"120000000000000001","meta_adset_id":"101","meta_ad_id":"201","impressions":100,"link_clicks":10,"spend":12.5},{"day":"2026-09-14","campaign_name":"Fixture B","adset_name":"Set B","creative_name":"Ad B","meta_campaign_id":"120000000000000003","meta_adset_id":"102","meta_ad_id":"202","impressions":200,"link_clicks":20,"spend":25}]';
  report jsonb;
begin
  select id into landing from public.landing_configs limit 1;
  if landing is null then raise exception 'DEV_FIXTURE_LANDING_REQUIRED'; end if;
  insert into public.landing_campaigns(id,landing_id,name,utm_campaign,start_day,end_day,meta_ad_account_id,meta_campaign_id)
  values(fixture,landing,'Meta integration fixture','fixture-'||fixture,'2026-09-01','2026-09-30','act_123','120000000000000001');
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_campaign_ids=array['120000000000000001'], 'legacy insert compatibility';
  update public.landing_campaigns set meta_campaign_ids=array['120000000000000001','120000000000000003','120000000000000001'],meta_sync_status='syncing',updated_at=stamp where id=fixture;
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_campaign_ids=array['120000000000000001','120000000000000003'], 'deduplication and precision';
  assert c.meta_campaign_id='120000000000000001', 'legacy reader compatibility';
  perform public.edu_store_campaign_meta(fixture,stamp,rows,'[]',null);
  assert (select count(*)=2 and sum(spend)=37.5 and sum(impressions)=300 from public.landing_campaign_meta_daily where campaign_id=fixture), 'both campaigns persisted';
  select public.edu_marketing_dashboard(fixture,'2026-09-14','2026-09-14') into report;
  assert (report->'summary_b'->>'spend')::numeric=37.5, 'dashboard aggregates all linked campaigns';
  stamp:=clock_timestamp();
  update public.landing_campaigns set meta_sync_status='syncing',updated_at=stamp where id=fixture;
  perform public.edu_store_campaign_meta(fixture,stamp,rows,'[]',null);
  assert (select count(*)=2 and sum(spend)=37.5 from public.landing_campaign_meta_daily where campaign_id=fixture), 'resync is idempotent';
  stamp:=clock_timestamp();
  update public.landing_campaigns set meta_sync_status='syncing',updated_at=stamp where id=fixture;
  begin
    perform public.edu_store_campaign_meta(fixture,stamp,jsonb_set(rows,'{0,spend}','999'), '[{"adset_key":null,"creative_key":"invalid"}]',null);
    raise exception 'EXPECTED_ATOMIC_FAILURE';
  exception when not_null_violation then null; end;
  assert (select sum(spend)=37.5 from public.landing_campaign_meta_daily where campaign_id=fixture), 'dimension failure rolls back metrics';
  begin
    perform public.edu_store_campaign_meta(fixture,stamp-interval '1 second',rows,'[]',null);
    raise exception 'EXPECTED_STALE_FAILURE';
  exception when raise_exception then if sqlerrm<>'META_SETTINGS_CHANGED' then raise; end if; end;
  update public.landing_campaigns set meta_campaign_id='120000000000000005' where id=fixture;
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_campaign_ids=array['120000000000000005'], 'legacy update compatibility';
  update public.landing_campaigns set meta_campaign_ids='{}' where id=fixture;
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_campaign_id is null and cardinality(c.meta_campaign_ids)=0, 'clear IDs';
  assert (select count(*)=2 from public.landing_campaign_meta_daily where campaign_id=fixture), 'removing IDs preserves history';
  assert not has_function_privilege('anon','public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid)','EXECUTE'), 'anonymous RPC access denied';
  assert not has_function_privilege('authenticated','public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid)','EXECUTE'), 'direct user RPC access denied';
  assert has_function_privilege('service_role','public.edu_store_campaign_meta(uuid,timestamptz,jsonb,jsonb,uuid)','EXECUTE'), 'server can sync';
end $$;
rollback;
