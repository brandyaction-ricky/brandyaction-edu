-- Metadata only. Supplements the original preflight; no function bodies/customer rows.
select jsonb_build_object(
 'missionScope', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),'service_execute',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='mission_has_scope'),
 'facilities',jsonb_build_object('storageObjects',to_regclass('storage.objects')::text,'storageBuckets',to_regclass('storage.buckets')::text,'realtimeMessages',to_regclass('realtime.messages')::text),
 'candidateBucket',(select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets where id='campus-portfolio-private'),
 'sharedPolicies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'permissive',permissive)) from pg_policies where (schemaname='storage' and tablename='objects') or (schemaname='realtime' and tablename='messages'))
) as metadata;
