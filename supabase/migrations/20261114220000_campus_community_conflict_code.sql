-- A conflict raised as SQLSTATE 40001 (serialization failure) never reaches the caller: the API layer keeps retrying the
-- transaction until it times out, so a review on a stale version or a repeated review hung for a minute instead of
-- answering "conflict". These are application conflicts, not serialization failures; raise them as 23505, which the
-- server code already maps to 409.
begin;
do $migration$
declare target text; definition text;
begin
 foreach target in array array['private.campus_community_mutate(jsonb)','private.campus_portfolio_file_prepare(jsonb)','private.campus_portfolio_file_share(jsonb)','private.campus_portfolio_file_complete(uuid,uuid,text)'] loop
  definition:=pg_get_functiondef(target::regprocedure);
  if strpos(definition,$from$errcode='40001'$from$)=0 then raise exception 'Review changed routine: %',target; end if;
  execute replace(definition,$from$errcode='40001'$from$,$to$errcode='23505'$to$);
 end loop;
end; $migration$;
notify pgrst,'reload schema';
commit;
