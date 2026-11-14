-- Approving a result no longer needs a memo. A revision request still does.
begin;
do $migration$
declare target record; definition text;
begin
 for target in select * from (values
('private.campus_office_mutate_before_dispatch(jsonb)',$from$(act in ('approve','request_revision') and coalesce(length(btrim(c->>'note')),0)<5)$from$,$to$(act='request_revision' and coalesce(length(btrim(c->>'note')),0)<5)$to$)) as patches(signature,old_clause,new_clause) loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if strpos(definition,target.old_clause)=0 then raise exception 'Review changed routine: %',target.signature; end if;
  execute replace(definition,target.old_clause,target.new_clause);
 end loop;
end; $migration$;
notify pgrst,'reload schema';
commit;
