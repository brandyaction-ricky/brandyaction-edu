begin;
set local lock_timeout='5s';
-- Preserve a competing editor's version without replacing the shared head or
-- any student-visible content. Existing version history can read it normally.
create function public.edu_backup_lesson_author(p_actor uuid,p_lesson uuid,p_request uuid,p_stamp text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare old public.edu_lesson_author_versions%rowtype; course uuid; target uuid;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception 'AUTHOR_FORBIDDEN'; end if;
  if p_request is null or p_stamp is null or p_stamp !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'AUTHOR_INVALID'; end if;
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=p_lesson;
  select course_id into target from public.curriculum_weeks where id=(p_payload->'form'->'basic'->>'week_id')::uuid and archived_at is null;
  if target is distinct from course then raise exception 'AUTHOR_COURSE_FIXED'; end if;
  -- Same request id is safe to retry after a lost response; no last-writer-wins.
  insert into public.edu_lesson_author_versions(id,lesson_id,payload,base_stamp,created_by)
    values(p_request,p_lesson,p_payload,p_stamp,p_actor) on conflict(id) do nothing;
  select * into old from public.edu_lesson_author_versions where id=p_request;
  if old.lesson_id is distinct from p_lesson or old.created_by is distinct from p_actor or old.payload is distinct from p_payload or old.base_stamp is distinct from p_stamp then raise exception 'AUTHOR_CHANGED'; end if;
  return jsonb_build_object('revision',old.id,'savedAt',old.created_at,'backup',true);
end;
$$;
revoke all on function public.edu_backup_lesson_author(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_backup_lesson_author(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
