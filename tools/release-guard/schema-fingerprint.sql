-- Read-only structural contract; data rows are never included.
with objects as (
 -- information_schema.columns hides tables without data privileges. The
 -- preflight role must see structural drift without receiving customer SELECT.
 select 'column' as kind, n.nspname||'.'||c.relname||'.'||a.attname as name,
 jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) as definition
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where n.nspname in ('public','edu_private') and c.relkind in ('r','p','v','m','f') and a.attnum>0 and not a.attisdropped
 union all
 select 'constraint', n.nspname||'.'||c.relname||'.'||x.conname, to_jsonb(pg_get_constraintdef(x.oid))
 from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','edu_private')
 union all
 select 'policy',schemaname||'.'||tablename||'.'||policyname,to_jsonb(p) from pg_policies p where schemaname in ('public','edu_private')
 union all
 select 'table-permission',n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','edu_private') and c.relkind in ('r','p','v','m','S')
 union all
 select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','edu_private') and p.prokind in ('f','p')
 union all
 select 'index',schemaname||'.'||indexname,to_jsonb(indexdef) from pg_indexes where schemaname in ('public','edu_private')
 union all
 select 'view',schemaname||'.'||viewname,to_jsonb(definition) from pg_views where schemaname in ('public','edu_private')
 union all
 select 'migration',version,to_jsonb(m) from supabase_migrations.schema_migrations m
) select kind,name,definition from objects order by kind,name;
