-- DEV-only rollback smoke for the 2026-09-16 dashboard improvements.
begin;

do $$
declare
  v_campaign constant uuid := 'd30240fe-15ba-4b40-a00c-f22a0567f61a';
  v_actor uuid;
  v_stamp timestamptz;
  v_report jsonb;
  v_cr08 jsonb;
begin
  select id into v_actor from public.profiles where status='active' order by created_at limit 1;
  if v_actor is null then raise exception 'QA_ACTIVE_PROFILE_REQUIRED'; end if;

  update public.landing_campaign_dimensions
  set ad_type='cold',updated_by=v_actor,updated_at=clock_timestamp()
  where campaign_id=v_campaign and adset_key='A_메인_브로드_25-54' and creative_key='cr08_jay_ai_worker_24h_img';

  select public.edu_marketing_dashboard(v_campaign,'2026-09-15','2026-09-15') into v_report;
  if jsonb_array_length(v_report->'performance')<>8 then raise exception 'QA_MATERIAL_MERGE_FAILED'; end if;
  select value into v_cr08 from jsonb_array_elements(v_report->'performance') value where value->>'creative'='cr08_jay_ai_worker_24h_img';
  if v_cr08->>'ad_type'<>'cold' or (v_cr08->>'spend')::numeric<>618623 then raise exception 'QA_CLASSIFICATION_JOIN_FAILED'; end if;

  update public.landing_campaigns set meta_sync_status='syncing',updated_by=v_actor,updated_at=clock_timestamp()
  where id=v_campaign returning updated_at into v_stamp;
  perform public.edu_store_campaign_meta(
    v_campaign,v_stamp,
    '[{"day":"2026-09-15","campaign_name":"META_Cold_카톡방입장_2609","adset_name":"A_메인_브로드_25-54","creative_name":"cr08_jay_ai_worker_24h_img","meta_campaign_id":"120252432290300270","meta_adset_id":"120252432290310270","meta_ad_id":"120252432966390270","meta_creative_id":null,"impressions":23495,"link_clicks":998,"spend":618623,"registrations":372,"registration_cost":1662.96}]'::jsonb,
    '[{"adset_key":"A_메인_브로드_25-54","creative_key":"cr08_jay_ai_worker_24h_img","meta_adset_id":"120252432290310270","meta_ad_id":"120252432966390270","meta_creative_id":null}]'::jsonb,
    v_actor
  );
  if not exists(select 1 from public.landing_campaign_dimensions where campaign_id=v_campaign and adset_key='A_메인_브로드_25-54' and creative_key='cr08_jay_ai_worker_24h_img' and ad_type='cold' and meta_ad_id='120252432966390270') then
    raise exception 'QA_SYNC_RESET_CLASSIFICATION';
  end if;
  if not exists(select 1 from public.landing_campaign_meta_daily where campaign_id=v_campaign and day='2026-09-15' and meta_ad_id='120252432966390270' and registrations=372 and registration_cost=1662.96) then
    raise exception 'QA_REGISTRATION_PERSISTENCE_FAILED';
  end if;
end $$;

rollback;
