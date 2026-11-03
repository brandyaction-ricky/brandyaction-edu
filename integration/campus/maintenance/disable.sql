-- Preserve extension, run history and all other jobs.
begin;
do $review$
declare target bigint;
begin
 if current_setting('campus.maintenance.reviewed',true) is distinct from 'space-retention-v1'
    or current_user <> 'postgres' then raise exception 'Reviewed environment required'; end if;
 select jobid into target from cron.job where jobname='edu-campus-space-prune-v1' and username=current_user
  and schedule='17 * * * *'
  and command=$command$set lock_timeout='3s'; set statement_timeout='20s'; select public.edu_campus_space_prune();$command$;
 if target is null then raise exception 'Maintenance job changed or absent; inspect before rollback'; end if;
 perform cron.unschedule(target);
end;$review$;
commit;
