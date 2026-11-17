-- Operator-only, explicitly reviewed environment. Not an automatic migration.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $review$
begin
 if current_setting('campus.maintenance.reviewed',true) is distinct from 'space-retention-v1'
    or current_user <> 'postgres' then raise exception 'Review the target environment and retention scope first'; end if;
 if to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('public.edu_campus_space_prune()') is null then raise exception 'Reviewed Cron and space maintenance function required'; end if;
 if exists(select 1 from cron.job where jobname='edu-campus-space-prune-v1') then raise exception 'Existing maintenance job: inspect instead of overwriting'; end if;
 if exists(select 1 from pg_proc where oid='public.edu_campus_space_prune()'::regprocedure and prosecdef)
    or has_function_privilege('anon','public.edu_campus_space_prune()','execute')
    or has_function_privilege('authenticated','public.edu_campus_space_prune()','execute') then raise exception 'Maintenance permission boundary changed'; end if;
end;$review$;
select cron.schedule('edu-campus-space-prune-v1','17 * * * *',
 $command$set lock_timeout='3s'; set statement_timeout='20s'; select public.edu_campus_space_prune();$command$) as job_id;
commit;
