-- Drafts for different lessons may save concurrently. Shared parent locks
-- still exclude course/week archive, reorder, move and publication operations.
-- The lesson UPDATE lock, revision checks and idempotency remain unchanged.
begin;
create or replace function public.edu_save_lesson_author(p_actor uuid,p_lesson uuid,p_expected uuid,p_request uuid,p_stamp text,p_payload jsonb,p_create boolean default false,p_rebase boolean default false) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare course uuid; target_course uuid; w uuid; head public.edu_lesson_author_heads%rowtype; old public.edu_lesson_author_versions%rowtype; snap jsonb; base text;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception 'AUTHOR_FORBIDDEN'; end if;
  if p_lesson is null or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'AUTHOR_INVALID'; end if;
  w:=(p_payload->'form'->'basic'->>'week_id')::uuid;
  select course_id into target_course from public.curriculum_weeks where id=w and archived_at is null;
  select cw.course_id into course from public.curriculum_lessons l join public.curriculum_weeks cw on cw.id=l.week_id where l.id=p_lesson;
  course:=coalesce(course,target_course);
  if course is null or target_course is distinct from course then raise exception 'AUTHOR_COURSE_FIXED'; end if;
  perform 1 from public.courses where id=course and archived_at is null for share;
  if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;
  perform 1 from public.curriculum_weeks where id=w and archived_at is null for share;
  if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  if not found then
    if not p_create or p_expected is not null then raise exception 'AUTHOR_NOT_FOUND'; end if;
    insert into public.curriculum_lessons(id,week_id,day_number,title,content_type,is_published,is_preview,display_order)
      values(p_lesson,w,(p_payload->'form'->'basic'->>'day_number')::integer,'새 수업','text',false,false,(p_payload->'form'->'basic'->>'day_number')::integer);
  elsif p_create and not exists(select 1 from public.edu_lesson_author_versions where id=p_request and lesson_id=p_lesson and created_by=p_actor) then
    raise exception 'AUTHOR_CHANGED';
  end if;
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  select * into old from public.edu_lesson_author_versions where id=p_request;
  if found then
    if old.lesson_id<>p_lesson or old.created_by<>p_actor or old.payload<>p_payload then raise exception 'AUTHOR_CHANGED'; end if;
    return jsonb_build_object('revision',old.id,'savedAt',old.created_at);
  end if;
  select * into head from public.edu_lesson_author_heads where lesson_id=p_lesson;
  if head.revision is distinct from p_expected then raise exception 'AUTHOR_CHANGED'; end if;
  snap:=public.edu_lesson_author_snapshot(p_actor,p_lesson);
  if p_stamp is distinct from snap->>'stamp' and not p_create then raise exception 'AUTHOR_PUBLIC_CHANGED'; end if;
  if head.revision is not null and not p_rebase then
    select * into old from public.edu_lesson_author_versions where id=head.revision;
    if old.base_stamp is distinct from snap->>'stamp' and not coalesce(head.revision=head.published_revision and head.published_stamp=snap->>'stamp',false) then raise exception 'AUTHOR_PUBLIC_CHANGED'; end if;
  end if;
  if head.revision is null then
    insert into public.edu_lesson_author_versions(id,lesson_id,payload,base_stamp,created_by,kind)
      values(gen_random_uuid(),p_lesson,snap->'payload',snap->>'stamp',p_actor,'baseline');
  end if;
  -- Saving explicitly uses the currently loaded public baseline. A stale draft
  -- can only be rebased via the editor's explicit restore-public workflow.
  base:=snap->>'stamp';
  insert into public.edu_lesson_author_versions(id,lesson_id,payload,base_stamp,created_by) values(p_request,p_lesson,p_payload,base,p_actor);
  insert into public.edu_lesson_author_heads(lesson_id,revision) values(p_lesson,p_request)
    on conflict(lesson_id) do update set revision=excluded.revision;
  return jsonb_build_object('revision',p_request,'savedAt',now(),'stamp',base);
end;
$$;

commit;
