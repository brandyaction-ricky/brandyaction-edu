-- 결과물 올리기 is now for two things: landing pages and ad creatives. Older kinds stay readable.
begin;
alter table public.edu_campus_posts drop constraint edu_campus_posts_kind_check;
alter table public.edu_campus_posts add constraint edu_campus_posts_kind_check check(kind in ('landing','ad','portfolio','feedback','process','failure','talent_offer','talent_request','demo_day'));
do $migration$
declare definition text; old_clause text:=$from$c->>'kind' not in ('portfolio','feedback','process','failure','talent_offer','talent_request','demo_day')$from$;
begin
 definition:=pg_get_functiondef('private.campus_community_mutate(jsonb)'::regprocedure);
 if strpos(definition,old_clause)=0 then raise exception 'Review changed routine: private.campus_community_mutate(jsonb)'; end if;
 execute replace(definition,old_clause,$to$c->>'kind' not in ('landing','ad','portfolio','feedback','process','failure','talent_offer','talent_request','demo_day')$to$);
end; $migration$;
notify pgrst,'reload schema';
commit;
