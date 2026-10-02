begin;
create or replace function public.edu_lesson_progression_gate(p_enrollment uuid,p_lesson uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare progression jsonb; course uuid; ordinal integer; track text; cap integer; reached integer; unlocked boolean; automatic boolean:=false; reason text:='';
begin
  select v.document->'progression',w.course_id into progression,course from public.edu_lesson_block_heads h
    join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons l on l.id=h.lesson_id
    join public.curriculum_weeks w on w.id=l.week_id where h.lesson_id=p_lesson;
  if exists(select 1 from public.edu_ongoing_rules where lesson_id=p_lesson) then
    if not exists(select 1 from public.enrollments where id=p_enrollment and course_id=course) then raise exception 'BLOCK_FORBIDDEN';end if;
    unlocked:=exists(select 1 from public.edu_enrollment_progression_grants where enrollment_id=p_enrollment and daily_open_through>28)
      or exists(select 1 from public.lesson_progress p join public.edu_lesson_block_heads h on h.lesson_id=p.lesson_id
        join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons done_l on done_l.id=p.lesson_id
        join public.curriculum_weeks done_w on done_w.id=done_l.week_id
        where p.enrollment_id=p_enrollment and p.completed_at is not null and done_w.course_id=course
          and v.document->'progression'->>'track'='daily' and (v.document->'progression'->>'dayNumber')::integer>=28);
    return jsonb_build_object('lessonId',p_lesson,'isUnlocked',unlocked,'automaticApproval',false,'track',null,'dayNumber',null,
      'ongoing',true,'reason',case when unlocked then '' else '28일차 데일리 미션을 승인받은 뒤 이용할 수 있습니다.' end);
  end if;
  if progression is null then
    -- Untracked lessons (including onboarding) also require explicit completion.
    -- Completed lessons remain revisitable when an earlier lesson is added later.
    select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=p_lesson;
    if not exists(select 1 from public.enrollments where id=p_enrollment and course_id=course) then raise exception 'BLOCK_FORBIDDEN'; end if;
    unlocked:=exists(select 1 from public.lesson_progress where enrollment_id=p_enrollment and lesson_id=p_lesson and completed_at is not null)
      or not exists(
        select 1 from public.curriculum_lessons prev
        join public.curriculum_weeks pw on pw.id=prev.week_id
        join public.curriculum_lessons current on current.id=p_lesson
        join public.curriculum_weeks cw on cw.id=current.week_id
        join public.enrollments e on e.id=p_enrollment
        left join public.edu_lesson_block_heads ph on ph.lesson_id=prev.id
        left join public.edu_lesson_block_versions pv on pv.id=ph.revision
        where pw.course_id=course and (pw.week_number,prev.day_number,prev.id)<(cw.week_number,current.day_number,current.id)
          and edu_private.edu_cohort_lesson_visible(e.cohort_id,prev.id)
          and pv.document->'progression' is null
          and not exists(select 1 from public.edu_ongoing_rules where lesson_id=prev.id)
          and not exists(select 1 from public.lesson_progress p where p.enrollment_id=p_enrollment and p.lesson_id=prev.id and p.completed_at is not null)
      );
    return jsonb_build_object('lessonId',p_lesson,'isUnlocked',unlocked,'automaticApproval',false,'track',null,'dayNumber',null,'reason',case when unlocked then '' else '앞 학습에서 학습 완료하기를 눌러 주세요.' end);
  end if;
  track:=progression->>'track'; ordinal:=(progression->>'dayNumber')::integer;
  if coalesce(track,'') not in ('daily','learning') or ordinal not between 1 and 30 then raise exception 'BLOCK_INVALID'; end if;
  if not exists(select 1 from public.enrollments where id=p_enrollment and course_id=course) then raise exception 'BLOCK_FORBIDDEN'; end if;
  -- Ambiguous mappings (including an operator restoring an archived duplicate)
  -- must not accidentally unlock the wrong lesson.
  if (select count(*) from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision
      join public.curriculum_lessons l on l.id=h.lesson_id join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=course and l.archived_at is null and w.archived_at is null
        and v.document->'progression'=progression)>1 then raise exception 'BLOCK_PROGRESSION_DUPLICATE'; end if;
  if track='daily' then
    select s.auto_approve_through_week*5 into cap from public.edu_cohort_progression_settings s join public.enrollments e on e.cohort_id=s.cohort_id where e.id=p_enrollment;
    select greatest(1,coalesce(max((v.document->'progression'->>'dayNumber')::integer)+1,1),
      coalesce((select daily_open_through from public.edu_enrollment_progression_grants where enrollment_id=p_enrollment),1)) into reached
      from public.lesson_progress p join public.edu_lesson_block_heads h on h.lesson_id=p.lesson_id join public.edu_lesson_block_versions v on v.id=h.revision
      join public.curriculum_lessons done_l on done_l.id=p.lesson_id join public.curriculum_weeks done_w on done_w.id=done_l.week_id
      where done_w.course_id=course and p.enrollment_id=p_enrollment and p.completed_at is not null and v.document->'progression'->>'track'='daily';
    unlocked:=ordinal<=least(reached,coalesce(cap,31)); automatic:=cap is not null and ordinal<=cap;
    if not unlocked then reason:=case when cap is not null and ordinal>cap then '아직 공개하지 않은 주차입니다. 운영자의 안내를 기다려 주세요.' else '이전 데일리 미션의 승인이 끝나면 열립니다.' end; end if;
  else
    unlocked:=ordinal=1 or exists(select 1 from public.lesson_progress p join public.edu_lesson_block_heads h on h.lesson_id=p.lesson_id
      join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons done_l on done_l.id=p.lesson_id join public.curriculum_weeks done_w on done_w.id=done_l.week_id
      where done_w.course_id=course and p.enrollment_id=p_enrollment and p.completed_at is not null and
        v.document->'progression'->>'track'='learning' and (v.document->'progression'->>'dayNumber')::integer in (ordinal-1,ordinal));
    if not unlocked then reason:='바로 앞 학습의 시험을 통과하면 열립니다.'; end if;
  end if;
  return jsonb_build_object('lessonId',p_lesson,'track',track,'dayNumber',ordinal,'isUnlocked',unlocked,'automaticApproval',automatic,'reason',reason);
end;
$$;

-- Legacy content and downloads must not bypass the untracked lesson gate.
create or replace function edu_private.edu_progression_readable(p_lesson uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); enrollment uuid;
begin
  if actor is null then return false; end if;
  if exists(select 1 from public.profiles p where p.id=actor and p.status='active' and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and (s.value->'products'='true'::jsonb or s.value->'members'='true'::jsonb))))) then return true; end if;
  for enrollment in select e.id from public.enrollments e join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
    join public.profiles p on p.id=e.user_id where l.id=p_lesson and l.is_published and w.is_published and e.user_id=actor and p.status='active' and e.status='active' and e.revoked_at is null
    and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()) loop
    if public.edu_is_graduate_enrollment(enrollment) or (public.edu_lesson_progression_gate(enrollment,p_lesson)->>'isUnlocked')::boolean then return true; end if;
  end loop;
  return false;
end;
$$;

-- Enforce completion order on legacy progress writes and direct Data API too.
create or replace function public.edu_guard_block_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.completed_at is not null and old.enrollment_id=new.enrollment_id and old.lesson_id=new.lesson_id then return new; end if;
  if not coalesce((public.edu_lesson_progression_gate(new.enrollment_id,new.lesson_id)->>'isUnlocked')::boolean,false) then raise exception 'BLOCK_LESSON_LOCKED'; end if;
  if (new.completed_at is not null or new.progress_percent=100) and
    exists(select 1 from public.edu_lesson_block_heads where lesson_id=new.lesson_id) and
    not exists(select 1 from public.edu_lesson_block_submissions s where s.enrollment_id=new.enrollment_id and s.lesson_id=new.lesson_id
      and (s.outcome='completed' or exists(select 1 from public.edu_lesson_block_reviews r where r.submission_id=s.id and r.decision in ('approved','auto_approved'))))
    then raise exception 'BLOCK_COMPLETION_REQUIRED'; end if;
  return new;
end;
$$;
commit;
