begin;

-- Keep previous replies from appearing as new when the bell is introduced.
alter table public.edu_question_answers add column learner_read_at timestamptz default now();
alter table public.edu_question_answers alter column learner_read_at drop default;
create index edu_question_unread_mentor_replies
 on public.edu_question_answers(question_id, created_at desc)
 where learner_read_at is null and deleted_at is null and source<>'learner';

create function public.edu_unread_mentor_replies(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_message_actor(p_actor);
 return (
  with by_question as (
   select q.id, q.title, count(*) as unread, max(a.created_at) as latest_at
   from public.edu_questions q
   join public.edu_question_answers a on a.question_id=q.id
   where q.user_id=p_actor and q.category='learning' and not q.is_archived
    and a.learner_read_at is null and a.deleted_at is null and a.source<>'learner'
   group by q.id
  ), latest as (
   select * from by_question order by latest_at desc,id limit 20
  )
  select jsonb_build_object(
   'count', coalesce((select sum(unread) from by_question),0),
   'questions', coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'count',unread
   ) order by latest_at desc,id) from latest),'[]'::jsonb)
  )
 );
end; $$;

create function public.edu_mark_mentor_replies_read(p_actor uuid,p_question uuid,p_answers uuid[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_question is null or p_answers is null or cardinality(p_answers) not between 1 and 20 then
  raise exception 'QUESTION_INVALID';
 end if;
 update public.edu_question_answers a set learner_read_at=clock_timestamp()
 from public.edu_questions q
 where q.id=p_question and q.user_id=p_actor and q.category='learning' and not q.is_archived
  and a.question_id=q.id and a.id=any(p_answers) and a.source<>'learner'
  and a.learner_read_at is null and a.deleted_at is null;
end; $$;
grant update(learner_read_at) on public.edu_question_answers to service_role;
revoke all on function public.edu_unread_mentor_replies(uuid),
 public.edu_mark_mentor_replies_read(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.edu_unread_mentor_replies(uuid),
 public.edu_mark_mentor_replies_read(uuid,uuid,uuid[]) to service_role;

-- Limit repeated student requests in a rolling minute under the existing actor lock.
create or replace function public.edu_ai_begin(p_actor uuid,p_request uuid,p_mode text,p_enrollment uuid,p_lesson uuid,p_question uuid,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.enrollments%rowtype; q public.edu_questions%rowtype; policy public.edu_ai_cohort_settings%rowtype;
 request_time timestamptz; oldest_recent timestamptz;
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
 request_time:=clock_timestamp();
 if p_mode='student' then
  select created_at into oldest_recent
  from public.edu_ai_requests
  where actor_id=p_actor and mode='student' and created_at>request_time-interval '1 minute'
  order by created_at desc
  offset 5 limit 1;
  if found then
   raise exception using message='AI_BURST_LIMIT',
    detail=greatest(1,ceil(extract(epoch from oldest_recent+interval '1 minute'-request_time))::integer)::text;
  end if;
 end if;
 if (p_mode<>'student' and (select count(*) from public.edu_ai_requests where cohort_id=e.cohort_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=policy.daily_limit)
  or (select count(*) from public.edu_ai_requests where actor_id=p_actor and status='pending' and created_at>now()-interval '2 minutes')>=(case when p_mode='student' then 1 else 2 end)
  then raise exception 'AI_LIMIT'; end if;
 insert into public.edu_ai_requests(id,actor_id,cohort_id,enrollment_id,lesson_id,question_id,mode,fingerprint,created_at)
 values(p_request,p_actor,e.cohort_id,e.id,p_lesson,p_question,p_mode,p_fingerprint,request_time);
 return jsonb_build_object('requestId',p_request,'lessonId',p_lesson,'enrollmentId',e.id,'cohortId',e.cohort_id);
end; $$;

commit;
