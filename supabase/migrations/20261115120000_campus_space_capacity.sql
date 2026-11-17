-- Study-room presence: raise the per-cohort cap and stop serializing heartbeats.
-- Before: every heartbeat (an UPDATE every 15 s per learner) took a cohort-wide advisory lock and counted the room, so
-- heartbeats queued behind each other (DEV, 24 learners: mean 88 ms, max 2 s per update), and the room admitted only 24
-- learners while the largest cohort has 121. Now the lock and the count run only when a learner becomes present (insert,
-- or a stale row coming back); an ongoing heartbeat only refreshes its own row. Each browser still follows at most 24
-- peers (loadSpace lists 24), so realtime fan-out per learner does not grow with the cap.
begin;
create or replace function public.edu_campus_space_presence_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' or old.expires_at<=now() then
  perform pg_advisory_xact_lock(hashtextextended(new.cohort_id::text,74));
  if (select count(*) from public.edu_campus_space_presence p where p.cohort_id=new.cohort_id and p.user_id<>new.user_id and p.expires_at>now())>=200 then raise exception 'Campus capacity reached' using errcode='54000';end if;
 end if;
 if TG_OP='UPDATE' then
  if row(new.cohort_id,new.user_id) is distinct from row(old.cohort_id,old.user_id) then raise exception 'Presence identity is immutable' using errcode='23514'; end if;
  if old.touched_at>clock_timestamp()-interval '4 seconds' then raise exception 'Presence rate limit' using errcode='P0001'; end if;
 end if;
 new.touched_at=clock_timestamp();new.expires_at=new.touched_at+interval '75 seconds';
 if new.focus_until is not null and (new.focus_until<new.touched_at-interval '5 seconds' or new.focus_until>new.touched_at+interval '51 minutes') then raise exception 'Invalid focus time' using errcode='23514';end if;
 return new;
end;$$;
notify pgrst,'reload schema';
commit;
