begin;
-- The DEV substrate already has this adapter. Production keeps its existing
-- authoritative mission_operator_allowed implementation; no role is widened.
create schema if not exists private;
grant usage on schema private to authenticated;
do $migration$
begin
 if to_regprocedure('public.mission_operator_allowed(uuid,text)') is null then raise exception 'Missing authoritative operator permission function'; end if;
 if to_regprocedure('private.mission_has_scope(text)') is null then
  execute $ddl$create function private.mission_has_scope(p_scope text) returns boolean language sql stable security definer set search_path='' as $body$
   select public.mission_operator_allowed((select auth.uid()),p_scope);
  $body$$ddl$;
  revoke all on function private.mission_has_scope(text) from public,anon;
  grant execute on function private.mission_has_scope(text) to authenticated;
 end if;
end;$migration$;
commit;
