-- A hidden (archived) job can be shown again. It returns to the state it had just before it was hidden,
-- with the learner's last review memo. Every other transition stays as reviewed.
begin;
do $migration$
declare target record; definition text;
begin
 for target in select * from (values
('private.campus_office_mutate_before_dispatch(jsonb)',$from$when act='archive' and j.status in ('awaiting_connection','review','approved','revision_requested','failed') then 'archived' else null end;$from$,$to$when act='archive' and j.status in ('awaiting_connection','review','approved','revision_requested','failed') then 'archived'
     when act='restore' and j.status='archived' then (select h.status from public.edu_campus_office_history h where h.job_id=j.id and h.revision=j.revision-1 and h.status in ('awaiting_connection','review','approved','revision_requested','failed')) else null end;$to$),
('private.campus_office_mutate_before_dispatch(jsonb)',$from$review_note=coalesce(btrim(c->>'note'),''),$from$,$to$review_note=case when act='restore' then case when next_status in ('approved','revision_requested') then coalesce((select h.note from public.edu_campus_office_history h where h.job_id=j.id and h.actor_type='learner' and h.action in ('approve','request_revision') order by h.revision desc limit 1),'') else '' end else coalesce(btrim(c->>'note'),'') end,$to$)) as patches(signature,old_clause,new_clause) loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if strpos(definition,target.old_clause)=0 or strpos(definition,target.new_clause)>0 then raise exception 'Review changed routine: %',target.signature; end if;
  execute replace(definition,target.old_clause,target.new_clause);
 end loop;
end; $migration$;
notify pgrst,'reload schema';
commit;
