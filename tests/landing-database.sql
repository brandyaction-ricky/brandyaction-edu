-- Run after the migration inside BEGIN ... ROLLBACK against DEV. No fixture survives.
do $$
declare lid uuid; cfg jsonb; packet jsonb; report jsonb; state public.funnel_sessions; begin
 select id into lid from public.courses where list_price=0 and status='published' limit 1;
 assert lid is not null, 'published free course fixture required';
 cfg:=jsonb_build_object('id',lid,'enabled',true,'kakao_url','https://open.kakao.com/o/testOnly','pixel_enabled',false,'pixel_id','','cta_label','테스트','campaign_start','2026-09-14','campaign_end','2026-09-28','custom_sections',true,'sections','[]'::jsonb,'thresholds','{"alive_seconds":5}'::jsonb);
 perform public.edu_publish_landing(cfg,'["hero","proof","final"]','{"test":1}','test',0);
 perform public.edu_publish_landing(cfg,'["hero","proof","final"]','{"test":1}','no layout change',1);
 assert (select layout_ver=1 and revision=2 from public.landing_configs where id=lid), 'unchanged publish must retain layout';
 begin
 perform public.edu_publish_landing(cfg,'["hero","final"]','{"test":1}','stale',1);
 raise exception 'stale publish unexpectedly accepted';
 exception when raise_exception then assert SQLERRM='STALE_REVISION','optimistic revision failed'; end;
 packet:=jsonb_build_object('landing_id',lid,'session_id','11111111-aaaa-4000-8000-000000000001','visitor_id','22222222-aaaa-4000-8000-000000000001','layout_ver',1,'attribution','{"utm_source":"meta","utm_campaign":"Cold","utm_term":"SetA","utm_content":"AdA","device":"mobile","browser":"Instagram","isInApp":true}'::jsonb,'events','[
 {"id":"33333333-aaaa-4000-8000-000000000001","event_type":"view_page","payload":{}},
 {"id":"33333333-aaaa-4000-8000-000000000002","event_type":"view_section","payload":{"section":"proof","dwellMs":4200}},
 {"id":"33333333-aaaa-4000-8000-000000000003","event_type":"click_cta","payload":{"to":"sticky_cta","section":"proof","scrollPct":47}},
 {"id":"33333333-aaaa-4000-8000-000000000004","event_type":"post_click_alive","payload":{"to":"sticky_cta","clickId":"33333333-aaaa-4000-8000-000000000003","elapsedMs":5000}}
 ]'::jsonb);
 perform public.edu_ingest_landing(packet); perform public.edu_ingest_landing(packet);
 select * into state from public.funnel_sessions where landing_id=lid;
 assert state.clicks=1 and state.alive=1 and state.max_rank=2 and state.sections->>'proof'='4200','dedup summary';
 assert (select count(*)=4 from public.funnel_events where landing_id=lid),'raw dedup';
 packet:=jsonb_set(packet,'{events}','[{"id":"33333333-aaaa-4000-8000-000000000002","event_type":"view_section","payload":{"section":"proof","dwellMs":8400}}]');
 perform public.edu_ingest_landing(packet);
 assert (select sections->>'proof'='8400' from public.funnel_sessions where landing_id=lid),'cumulative dwell';
 packet:=jsonb_set(packet,'{events}','[{"id":"33333333-aaaa-4000-8000-000000000002","event_type":"view_section","payload":{"section":"proof","dwellMs":100}}]');
 perform public.edu_ingest_landing(packet);
 assert (select sections->>'proof'='8400' from public.funnel_sessions where landing_id=lid),'out of order dwell';
 -- A return visit with the same device gets a new session and returning=true.
 packet:=jsonb_set(packet,'{session_id}','"11111111-aaaa-4000-8000-000000000002"');
 packet:=jsonb_set(packet,'{events}','[{"id":"33333333-aaaa-4000-8000-000000000005","event_type":"view_page","payload":{}}]');
 perform public.edu_ingest_landing(packet);
 assert (select is_returning from public.funnel_sessions where landing_id=lid and session_id='11111111-aaaa-4000-8000-000000000002'),'return visitor';
 perform public.edu_publish_landing(cfg,'["hero","final","proof"]','{"test":2}','order change',2);
 assert (select count(*)=2 from public.section_snapshots where landing_id=lid),'snapshot history';
 packet:=jsonb_set(packet,'{layout_ver}','2');
 packet:=jsonb_set(packet,'{events}','[{"id":"33333333-aaaa-4000-8000-000000000006","event_type":"view_page","payload":{}}]');
 perform public.edu_ingest_landing(packet);
 update public.funnel_sessions set created_at='2026-09-13 15:30:00+00' where landing_id=lid;
 report:=public.edu_landing_report(lid,'2026-09-13 15:00:00+00','2026-09-14 15:00:00+00');
 assert jsonb_array_length(report->'groups')=2,'groups must remain version separated';
 assert report->'daily'->0->>'day'='2026-09-14','KST date boundary';
 assert (report->'ctas'->0->>'clicks')::int=1,'CTA aggregate';
 assert report->'cta_sections'->0->>'context'='sticky_cta:proof','CTA section';
 assert jsonb_array_length(public.edu_landing_report(lid,'2026-09-13 15:00:00+00','2026-09-14 15:00:00+00','Other')->'groups')=0,'campaign filter';
 assert not has_table_privilege('anon','public.funnel_events','SELECT'),'no anonymous events read';
 assert not has_table_privilege('authenticated','public.landing_session_facts','SELECT'),'no authenticated aggregates';
 assert not has_function_privilege('anon','public.edu_ingest_landing(jsonb)','EXECUTE'),'API-only ingestion';
 assert not has_function_privilege('authenticated','public.edu_landing_report(uuid,timestamptz,timestamptz,text,text,text,text,int)','EXECUTE'),'API-only analytics';
end $$;
select 'landing database integration assertions passed' result;
