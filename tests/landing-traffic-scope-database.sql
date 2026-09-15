-- DEV only. Synthetic rows and every assertion are inside a rolled-back transaction.
begin;
do $$
declare
  lid uuid := gen_random_uuid(); other_lid uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); v1 uuid := gen_random_uuid();
  report jsonb; exported jsonb;
begin
  insert into public.courses(id,course_code,slug,title)
  values (lid,'scope-'||lid,'scope-'||lid,'DEV traffic scope regression'),
         (other_lid,'scope-'||other_lid,'scope-'||other_lid,'DEV other landing regression');
  insert into public.landing_configs(id) values (lid),(other_lid);
  insert into public.section_snapshots(landing_id,layout_ver,sections)
  values (lid,1,'["hero"]'),(other_lid,1,'["hero"]');
  insert into public.landing_campaigns(id,landing_id,name,utm_campaign,start_day,end_day)
  values (cid,lid,'DEV scope regression','configured-default','2026-09-14','2026-09-30');
  insert into public.funnel_sessions(landing_id,session_id,visitor_id,layout_ver,created_at,attribution,clicks)
  values
    (lid,gen_random_uuid(),v1,1,'2026-09-14 15:00:00+00','{"utm_campaign":"ad-a","utm_source":"meta","utm_content":"image"}',1),
    (lid,gen_random_uuid(),v1,1,'2026-09-15 00:00:00+00','{"utm_campaign":"ad-a","utm_source":"meta","utm_content":"image"}',0),
    (lid,gen_random_uuid(),gen_random_uuid(),1,'2026-09-15 01:00:00+00','{"utm_campaign":"ad-b","utm_source":"meta","utm_content":"video"}',1),
    (lid,gen_random_uuid(),gen_random_uuid(),1,'2026-09-15 02:00:00+00','{"utm_campaign":"organic","utm_source":"newsletter"}',1),
    (lid,gen_random_uuid(),gen_random_uuid(),1,'2026-09-15 14:59:59+00','{}',0),
    (lid,gen_random_uuid(),v1,1,'2026-09-14 14:59:59+00','{"utm_campaign":"ad-a"}',0),
    (lid,gen_random_uuid(),v1,1,'2026-09-15 15:00:00+00','{"utm_campaign":"ad-a"}',0),
    (other_lid,gen_random_uuid(),v1,1,'2026-09-15 01:00:00+00','{"utm_campaign":"ad-a"}',0);
  report := public.edu_marketing_dashboard(cid,'2026-09-15','2026-09-15','2026-09-14','2026-09-14');
  assert (report->'summary_b'->>'sessions')::int=5,
    format('all landing UTM traffic: expected 5 sessions, got %s',report->'summary_b'->>'sessions');
  assert (report->'summary_b'->>'visitors')::int=4,'visitor dedup retained';
  assert (report->'summary_b'->>'cta_click_sessions')::int=3,'CTA sessions retained';
  assert (report->'summary_a'->>'sessions')::int=1,'comparison scope and KST boundary';
  assert (report->'daily'->0->>'sessions')::int=5,'daily and summary agree';
  assert (report->'options'->'campaigns') @> '["ad-a","ad-b","organic"]'::jsonb,'all UTM filter options visible';
  assert (select sum((r->>'sessions')::int)=5 from jsonb_array_elements(report->'performance') r),'creative rows reconcile';
  report := public.edu_marketing_dashboard(cid,'2026-09-15','2026-09-15',p_campaigns=>array['ad-a','organic']);
  assert (report->'summary_b'->>'sessions')::int=3,'explicit multiple UTM selection retained';
  report := public.edu_marketing_dashboard(cid,'2026-09-15','2026-09-15',p_creatives=>array['video']);
  assert (report->'summary_b'->>'sessions')::int=1,'creative filter retained';
  report := public.edu_marketing_dashboard(cid,'2026-09-15','2026-09-15',p_campaigns=>array['']);
  assert (report->'summary_b'->>'sessions')::int=1,'explicit direct filter retained';
  exported := public.edu_marketing_export(cid,'2026-09-15','2026-09-15');
  assert (select sum((r->>'sessions')::int)=5 from jsonb_array_elements(exported) r),'CSV scope matches dashboard';
  exported := public.edu_marketing_export(cid,'2026-09-15','2026-09-15',p_campaigns=>array['ad-a','organic']);
  assert (select sum((r->>'sessions')::int)=3 from jsonb_array_elements(exported) r),'CSV explicit multi UTM filter';
  assert public.edu_marketing_dashboard(cid,'2026-09-13','2026-09-13') is null,'campaign period boundary retained';
  assert jsonb_array_length(public.edu_marketing_export(cid,'2026-09-13','2026-09-13'))=0,'export campaign period boundary';
  assert not has_function_privilege('anon','public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[])','EXECUTE'),'dashboard not anonymous';
  assert not has_function_privilege('authenticated','public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[])','EXECUTE'),'CSV remains API-only';
  assert has_function_privilege('service_role','public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[])','EXECUTE'),'server role retained';
end $$;
select 'traffic scope regression assertions passed; fixtures rolled back' as result;
rollback;
