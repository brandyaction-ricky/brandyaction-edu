begin;

-- No cohort is enabled by this migration. Pilot activation is a separate change.
create table public.edu_ai_cohort_settings (
 cohort_id uuid primary key references public.cohorts(id) on delete cascade,
 enabled boolean not null default false,
 daily_limit integer not null default 500 check(daily_limit between 1 and 10000),
 student_daily_limit integer not null default 30 check(student_daily_limit between 1 and 100),
 updated_at timestamptz not null default now()
);
create table public.edu_ai_requests (
 id uuid primary key,
 actor_id uuid references public.profiles(id) on delete set null,
 cohort_id uuid references public.cohorts(id) on delete set null,
 enrollment_id uuid references public.enrollments(id) on delete set null,
 lesson_id uuid references public.curriculum_lessons(id) on delete set null,
 question_id uuid references public.edu_questions(id) on delete set null,
 mode text not null check(mode in ('student','mentor','batch')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','succeeded','failed')),
 created_at timestamptz not null default now(), finished_at timestamptz
);
create index edu_ai_requests_actor on public.edu_ai_requests(actor_id,created_at desc);
create index edu_ai_requests_cohort on public.edu_ai_requests(cohort_id,created_at desc);
create index edu_ai_requests_enrollment on public.edu_ai_requests(enrollment_id);
create index edu_ai_requests_lesson on public.edu_ai_requests(lesson_id);
create index edu_ai_requests_question on public.edu_ai_requests(question_id);
create table public.edu_ai_calls (
 request_id uuid not null references public.edu_ai_requests(id) on delete cascade,
 attempt integer not null check(attempt between 1 and 2),
 model text not null check(length(model) between 1 and 100),
 status text not null default 'started' check(status in ('started','succeeded','failed','unknown')),
 input_tokens bigint check(input_tokens between 0 and 10000000),
 cached_tokens bigint check(cached_tokens between 0 and input_tokens),
 output_tokens bigint check(output_tokens between 0 and 10000000),
 estimated_usd numeric(16,8) check(estimated_usd>=0),
 rates jsonb,
 created_at timestamptz not null default now(), finished_at timestamptz,
 primary key(request_id,attempt)
);
alter table public.edu_ai_cohort_settings enable row level security;
alter table public.edu_ai_requests enable row level security;
alter table public.edu_ai_calls enable row level security;
revoke all on public.edu_ai_cohort_settings,public.edu_ai_requests,public.edu_ai_calls from public,anon,authenticated;
grant select on public.edu_ai_cohort_settings to service_role;
grant select,insert,update on public.edu_ai_requests,public.edu_ai_calls to service_role;

create function public.edu_ai_begin(p_actor uuid,p_request uuid,p_mode text,p_enrollment uuid,p_lesson uuid,p_question uuid,p_fingerprint text)
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
 if (select count(*) from public.edu_ai_requests where cohort_id=e.cohort_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=policy.daily_limit
  or (p_mode='student' and (select count(*) from public.edu_ai_requests where actor_id=p_actor and mode='student' and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=policy.student_daily_limit)
  or (select count(*) from public.edu_ai_requests where actor_id=p_actor and status='pending' and created_at>now()-interval '2 minutes')>=(case when p_mode='student' then 1 else 2 end)
  then raise exception 'AI_LIMIT'; end if;
 insert into public.edu_ai_requests(id,actor_id,cohort_id,enrollment_id,lesson_id,question_id,mode,fingerprint)
 values(p_request,p_actor,e.cohort_id,e.id,p_lesson,p_question,p_mode,p_fingerprint);
 return jsonb_build_object('requestId',p_request,'lessonId',p_lesson,'enrollmentId',e.id,'cohortId',e.cohort_id);
end; $$;

create function public.edu_ai_assert(p_actor uuid,p_request uuid)
returns public.edu_ai_requests language plpgsql stable security invoker set search_path='' as $$
declare r public.edu_ai_requests%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into r from public.edu_ai_requests where id=p_request and actor_id=p_actor and status='pending' and created_at>now()-interval '2 minutes';
 if not found then raise exception 'AI_FORBIDDEN'; end if;
 if not exists(select 1 from public.edu_ai_cohort_settings where cohort_id=r.cohort_id and enabled) then raise exception 'AI_DISABLED'; end if;
 if not exists(select 1 from public.enrollments e join public.courses c on c.id=e.course_id
  join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
  where e.id=r.enrollment_id and e.cohort_id=r.cohort_id and l.id=r.lesson_id
   and c.archived_at is null and w.archived_at is null and l.archived_at is null
   and edu_private.edu_cohort_lesson_visible(e.cohort_id,l.id)) then raise exception 'AI_FORBIDDEN'; end if;
 if r.mode='student' then perform public.edu_assert_question_access(p_actor,r.lesson_id,r.enrollment_id);
 else
  if not public.edu_message_operator(p_actor) then raise exception 'AI_FORBIDDEN'; end if;
  if not exists(select 1 from public.edu_questions where id=r.question_id and not is_archived and enrollment_id=r.enrollment_id and lesson_id=r.lesson_id
   and (r.mode<>'batch' or (answer_head_id is null and not is_resolved and status='open'))) then raise exception 'AI_ANSWERED'; end if;
 end if;
 return r;
end; $$;

create function public.edu_ai_curriculum(p_actor uuid,p_request uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r public.edu_ai_requests%rowtype; result jsonb;
begin
 r:=public.edu_ai_assert(p_actor,p_request);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.week_number,t.day_number,t.id),'[]'::jsonb) into result from (
  select l.id,l.title,l.description,w.week_number,l.day_number,h.revision,v.document,lc.body_text
  from public.enrollments e join public.curriculum_weeks w on w.course_id=e.course_id
  join public.curriculum_lessons l on l.week_id=w.id
  left join public.edu_lesson_block_heads h on h.lesson_id=l.id
  left join public.edu_lesson_block_versions v on v.id=h.revision and v.lesson_id=l.id
  left join public.lesson_contents lc on lc.lesson_id=l.id
  where e.id=r.enrollment_id and w.archived_at is null and l.archived_at is null
   and edu_private.edu_cohort_lesson_visible(e.cohort_id,l.id)
   and (r.mode<>'student' or public.edu_is_graduate_enrollment(e.id) or coalesce((public.edu_lesson_progression_gate(e.id,l.id)->>'isUnlocked')::boolean,false))
  order by w.week_number,l.day_number,l.id limit 121
 ) t;
 if jsonb_array_length(result)>120 then raise exception 'AI_CONTEXT_LIMIT'; end if;
 return result;
end; $$;

create function public.edu_ai_usage(p_actor uuid,p_days integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.edu_message_operator(p_actor) then raise exception 'AI_FORBIDDEN'; end if;
 if p_days is null or p_days not between 1 and 90 then raise exception 'AI_INVALID'; end if;
 return jsonb_build_object('days',p_days,'rows',coalesce((
  with requests as materialized (select * from public.edu_ai_requests where created_at>=now()-make_interval(days=>p_days)),
  totals as (select cohort_id,count(*) requests,count(*) filter(where status='succeeded') succeeded,
   count(*) filter(where status='failed') failed,count(*) filter(where status='pending') pending from requests group by cohort_id),
  calls as (select r.cohort_id,count(*) api_calls,count(*) filter(where c.status='succeeded') successful_calls,
   count(*) filter(where c.status in ('started','unknown') or c.input_tokens is null or c.output_tokens is null) unmeasured_calls,
   coalesce(sum(c.input_tokens),0) input_tokens,coalesce(sum(c.cached_tokens),0) cached_tokens,coalesce(sum(c.output_tokens),0) output_tokens,
   coalesce(sum(c.estimated_usd),0) estimated_usd,count(*) filter(where c.estimated_usd is null) unpriced_calls
   from requests r join public.edu_ai_calls c on c.request_id=r.id group by r.cohort_id)
  select jsonb_agg(to_jsonb(t)||jsonb_build_object('cohort_name',coalesce(h.name,'삭제된 기수'),'course_title',coalesce(course.title,'삭제된 과정'),
   'calls',coalesce(to_jsonb(c)-'cohort_id','{}'::jsonb)) order by t.requests desc,t.cohort_id)
  from totals t left join public.cohorts h on h.id=t.cohort_id left join public.courses course on course.id=h.course_id left join calls c on c.cohort_id is not distinct from t.cohort_id
 ),'[]'::jsonb));
end; $$;
revoke all on function public.edu_ai_begin(uuid,uuid,text,uuid,uuid,uuid,text),public.edu_ai_assert(uuid,uuid),public.edu_ai_curriculum(uuid,uuid),public.edu_ai_usage(uuid,integer) from public,anon,authenticated;
grant execute on function public.edu_ai_begin(uuid,uuid,text,uuid,uuid,uuid,text),public.edu_ai_assert(uuid,uuid),public.edu_ai_curriculum(uuid,uuid),public.edu_ai_usage(uuid,integer) to service_role;
commit;
