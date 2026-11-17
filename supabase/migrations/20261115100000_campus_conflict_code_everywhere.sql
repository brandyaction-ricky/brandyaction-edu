-- Follow-up to 20261114220000. Every remaining campus routine that reports an application conflict (stale revision,
-- repeated request, limit, lease or transition conflict) as SQLSTATE 40001 hangs at the API layer, which retries
-- serialization failures until it times out: approving from two windows, a bot report with an old revision number and
-- pairing an already connected employee all waited 10-60 seconds instead of answering. Raise them as 23505; every
-- caller already maps both codes to 409. No routine catches either code, so nothing downstream changes.
begin;
do $migration$
declare routine record; definition text; changed integer:=0;
begin
 for routine in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f' and p.proname like '%campus%' order by p.oid loop
  definition:=pg_get_functiondef(routine.oid);
  if strpos(definition,$from$errcode='40001'$from$)>0 then
   execute replace(definition,$from$errcode='40001'$from$,$to$errcode='23505'$to$);changed:=changed+1;
  end if;
 end loop;
 if changed=0 then raise exception 'No campus routine raised 40001; review before applying'; end if;
end; $migration$;
notify pgrst,'reload schema';
commit;
