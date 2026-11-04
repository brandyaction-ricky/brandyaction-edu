-- Student questions bypass both daily quotas. Keep the in-flight request guard.
create or replace function public.edu_ai_begin(p_actor uuid,p_request uuid,p_mode text,p_enrollment uuid,p_lesson uuid,p_question uuid,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.enrollments%rowtype; q public.edu_questions%rowtype; policy public.edu_ai_cohort_settings%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_request is null or p_mode is null or p_mode not in ('student','mentor','batch') or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'AI_INVALID'; end if;
 if p_mode='student' then
  if p_question is not null then raise exception 'AI_INVALID'; end if;
  perform public.edu_assert_question_access(p_actor,p_lesson,p_enrollment);
  select * into e from public.enrollments where id=p_enrollment and user_id=p_actor;
 else
  if not public.edu_message_operator(p_actor) then raise exception 'AI_FORBIDDEN'; end if;
  select * into q from public.edu_questions where id=p_question and not is_archived;
  if not found or q.enrollment_id is null or q.lesson_id is null then raise exception 'AI_LESSON_REQUIRED'; end if;
  if p_mode='batch' and (q.answer_head_id is not null or q.is_resolved or q.status<>'open') then raise exception 'AI_ANSWERED'; end if;
  if p_enrollment is not null or p_lesson is not null then raise exception 'AI_INVALID'; end if;
  select * into e from public.enrollments where id=q.enrollment_id;
  if q.course_id is distinct from e.course_id then raise exception 'AI_FORBIDDEN'; end if;
  p_lesson:=q.lesson_id;
 end if;
 if e.id is null or not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id join public.courses c on c.id=w.course_id
   where l.id=p_lesson and w.course_id=e.course_id and c.archived_at is null and w.archived_at is null and l.archived_at is null
   and edu_private.edu_cohort_lesson_visible(e.cohort_id,l.id)) then raise exception 'AI_FORBIDDEN'; end if;
 -- Same lock order for all users: cohort before actor; neither is a lesson-save lock.
 perform pg_advisory_xact_lock(hashtextextended('edu-ai-cohort:'||e.cohort_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('edu-ai-actor:'||p_actor::text,0));
 select * into policy from public.edu_ai_cohort_settings where cohort_id=e.cohort_id and enabled;
 if not found then raise exception 'AI_DISABLED'; end if;
 if exists(select 1 from public.edu_ai_requests where id=p_request) then raise exception 'AI_DUPLICATE'; end if;
 if (p_mode<>'student' and (select count(*) from public.edu_ai_requests where cohort_id=e.cohort_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=policy.daily_limit)
  or (select count(*) from public.edu_ai_requests where actor_id=p_actor and status='pending' and created_at>now()-interval '2 minutes')>=(case when p_mode='student' then 1 else 2 end)
  then raise exception 'AI_LIMIT'; end if;
 insert into public.edu_ai_requests(id,actor_id,cohort_id,enrollment_id,lesson_id,question_id,mode,fingerprint)
 values(p_request,p_actor,e.cohort_id,e.id,p_lesson,p_question,p_mode,p_fingerprint);
 return jsonb_build_object('requestId',p_request,'lessonId',p_lesson,'enrollmentId',e.id,'cohortId',e.cohort_id);
end; $$;
