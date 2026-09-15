-- DEV only. Verify creation, legacy overrides and history without retaining fixtures.
begin;
do $$
declare
  fixture uuid := gen_random_uuid(); landing uuid; account text; c public.landing_campaigns;
  stamp timestamptz := clock_timestamp(); before_metrics text;
begin
  select id into landing from public.landing_configs limit 1;
  select 'act_' || regexp_replace(btrim(value->>'adAccountId'), '^act_', '') into account
  from public.site_settings where key='edu_meta_marketing';
  assert landing is not null and account ~ '^act_[0-9]+$', 'DEV shared configuration required';
  select md5(coalesce(string_agg(row_to_json(m)::text,'|' order by campaign_id,day,meta_ad_id),'')) into before_metrics from public.landing_campaign_meta_daily m;
  insert into public.landing_campaigns(id,landing_id,name,utm_campaign,start_day,end_day)
  values(fixture,landing,'Common account regression fixture','common-fixture-'||fixture,'2026-09-01','2026-09-30');
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_ad_account_id=account, 'new campaign automatically inherits common account';
  update public.landing_campaigns set meta_ad_account_id='act_999',meta_campaign_ids=array['120000000000000001'],meta_sync_status='syncing',updated_at=stamp where id=fixture;
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_ad_account_id=account, 'legacy writer cannot override common account';
  assert c.meta_campaign_ids=array['120000000000000001'], 'campaign IDs persist';
  perform public.edu_store_campaign_meta(fixture,stamp,
    '[{"day":"2026-09-14","campaign_name":"Fixture","adset_name":"Set","creative_name":"Ad","meta_campaign_id":"120000000000000001","meta_adset_id":"101","meta_ad_id":"201","impressions":100,"link_clicks":10,"spend":12.5}]','[]',null);
  update public.landing_campaigns set meta_ad_account_id=null,meta_campaign_ids='{}' where id=fixture;
  select * into c from public.landing_campaigns where id=fixture;
  assert c.meta_ad_account_id=account, 'clearing legacy account retains shared value';
  assert (select count(*)=1 and sum(spend)=12.5 and sum(impressions)=100 from public.landing_campaign_meta_daily where campaign_id=fixture), 'settings changes preserve historical metrics';
  assert before_metrics=(select md5(coalesce(string_agg(row_to_json(m)::text,'|' order by campaign_id,day,meta_ad_id),'')) from public.landing_campaign_meta_daily m where campaign_id<>fixture), 'other campaigns unchanged';
  assert not has_function_privilege('anon','public.edu_apply_common_meta_account()','EXECUTE'), 'anonymous access denied';
  assert not has_function_privilege('authenticated','public.edu_apply_common_meta_account()','EXECUTE'), 'direct user access denied';
  assert has_function_privilege('service_role','public.edu_apply_common_meta_account()','EXECUTE'), 'server can create campaigns';
end $$;
rollback;
