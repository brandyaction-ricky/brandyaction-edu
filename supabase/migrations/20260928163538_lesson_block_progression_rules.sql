begin;
create schema if not exists edu_private;
revoke all on schema edu_private from public,anon,authenticated;
grant usage on schema edu_private to anon,authenticated,service_role;
create table public.edu_cohort_progression_settings (
  cohort_id uuid primary key references public.cohorts(id),
  auto_approve_through_week integer check(auto_approve_through_week between 1 and 6),
  write_id uuid not null unique,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index edu_cohort_progression_actor_idx on public.edu_cohort_progression_settings(updated_by);
alter table public.edu_cohort_progression_settings enable row level security;
revoke all on public.edu_cohort_progression_settings from public,anon,authenticated;
grant select,insert,update on public.edu_cohort_progression_settings to service_role;
-- Import/manual-opening floor is separate from answers; it never erases earned
-- progress. Existing records are not populated or modified by this migration.
create table public.edu_enrollment_progression_grants (
  enrollment_id uuid primary key references public.enrollments(id),
  daily_open_through integer not null check(daily_open_through between 1 and 31)
);
alter table public.edu_enrollment_progression_grants enable row level security;
revoke all on public.edu_enrollment_progression_grants from public,anon,authenticated;
grant select,insert,update on public.edu_enrollment_progression_grants to service_role;
alter table public.edu_lesson_block_reviews drop constraint edu_lesson_block_reviews_decision_check;
alter table public.edu_lesson_block_reviews add constraint edu_lesson_block_reviews_decision_check check(decision in ('approved','changes_requested','reopened','auto_approved'));

create function public.edu_lesson_progression_gate(p_enrollment uuid,p_lesson uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare progression jsonb; course uuid; ordinal integer; track text; cap integer; reached integer; unlocked boolean; automatic boolean:=false; reason text:='';
begin
  select v.document->'progression',w.course_id into progression,course from public.edu_lesson_block_heads h
    join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons l on l.id=h.lesson_id
    join public.curriculum_weeks w on w.id=l.week_id where h.lesson_id=p_lesson;
  if progression is null then return jsonb_build_object('lessonId',p_lesson,'isUnlocked',true,'automaticApproval',false,'track',null,'dayNumber',null,'reason',''); end if;
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

create function public.edu_progression_settings(p_actor uuid,p_cohort uuid,p_write uuid default null,p_expected uuid default null,p_week integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_cohort_progression_settings%rowtype;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings x where x.key='edu_staff_permissions_'||p.id::text and x.value->'products'='true'::jsonb)))) then raise exception 'BLOCK_FORBIDDEN'; end if;
  if not exists(select 1 from public.cohorts where id=p_cohort) then raise exception 'BLOCK_NOT_FOUND'; end if;
  if p_write is not null then
    if p_week is not null and p_week not between 1 and 6 then raise exception 'BLOCK_INVALID'; end if;
    perform 1 from public.cohorts where id=p_cohort for update;
  end if;
  select * into s from public.edu_cohort_progression_settings where cohort_id=p_cohort;
  if p_write is not null then
    if s.write_id=p_write then
      if s.auto_approve_through_week is distinct from p_week or s.updated_by<>p_actor then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    else
      if s.write_id is distinct from p_expected then raise exception 'BLOCK_DRAFT_CHANGED'; end if;
      insert into public.edu_cohort_progression_settings(cohort_id,auto_approve_through_week,write_id,updated_by) values(p_cohort,p_week,p_write,p_actor)
        on conflict(cohort_id) do update set auto_approve_through_week=excluded.auto_approve_through_week,write_id=excluded.write_id,updated_by=excluded.updated_by,updated_at=now() returning * into s;
    end if;
  end if;
  return jsonb_build_object('cohortId',p_cohort,'autoApproveThroughWeek',s.auto_approve_through_week,'writeId',s.write_id);
end;
$$;

create function public.edu_read_lesson_progression(p_actor uuid,p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare course uuid;
begin
  select e.course_id into course from public.enrollments e join public.profiles p on p.id=e.user_id where e.id=p_enrollment and e.user_id=p_actor
    and p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now());
  if course is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(public.edu_lesson_progression_gate(p_enrollment,l.id) order by l.id)
    from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    where w.course_id=course and l.archived_at is null and w.archived_at is null and l.is_published and w.is_published),'[]'::jsonb);
end;
$$;

-- Existing content/resource endpoints and direct Data API reads must observe
-- the same gate. Definer returns one boolean, never private content or answers.
create function edu_private.edu_progression_readable(p_lesson uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); enrollment uuid;
begin
  if not exists(select 1 from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision where h.lesson_id=p_lesson and v.document ? 'progression') then return true; end if;
  if actor is null then return false; end if;
  if exists(select 1 from public.profiles p where p.id=actor and p.status='active' and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and (s.value->'products'='true'::jsonb or s.value->'members'='true'::jsonb))))) then return true; end if;
  for enrollment in select e.id from public.enrollments e join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
    join public.profiles p on p.id=e.user_id where l.id=p_lesson and e.user_id=actor and p.status='active' and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()) loop
    if (public.edu_lesson_progression_gate(enrollment,p_lesson)->>'isUnlocked')::boolean then return true; end if;
  end loop;
  return false;
end;
$$;
create policy lesson_block_progression_content on public.lesson_contents as restrictive for select to anon,authenticated using (edu_private.edu_progression_readable(lesson_id));
create policy lesson_block_progression_missions on public.curriculum_missions as restrictive for select to anon,authenticated using (edu_private.edu_progression_readable(lesson_id));

create or replace function public.edu_save_lesson_blocks(p_actor uuid,p_lesson uuid,p_expected_revision uuid,p_new_revision uuid,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head_id uuid; v public.edu_lesson_block_versions%rowtype; course uuid; progression jsonb;
begin
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  if p_new_revision is null or p_document is null then raise exception 'BLOCK_INVALID'; end if;
  select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=p_lesson;
  perform pg_advisory_xact_lock(hashtextextended(course::text, 261029));
  progression:=p_document->'progression';
  if progression is not null then
    if jsonb_typeof(progression) is distinct from 'object' or coalesce(progression->>'track','') not in ('daily','learning') or
      jsonb_typeof(progression->'dayNumber') is distinct from 'number' or (progression->>'dayNumber')!~'^[0-9]+$' or
      (progression->>'dayNumber')::integer not between 1 and 30 then raise exception 'BLOCK_INVALID'; end if;
    if exists(select 1 from public.edu_lesson_block_heads h join public.edu_lesson_block_versions existing_version on existing_version.id=h.revision
      join public.curriculum_lessons l on l.id=h.lesson_id join public.curriculum_weeks w on w.id=l.week_id
      where h.lesson_id<>p_lesson and w.course_id=course and l.archived_at is null and w.archived_at is null
      and existing_version.document->'progression'->>'track'=progression->>'track' and existing_version.document->'progression'->'dayNumber'=progression->'dayNumber') then raise exception 'BLOCK_PROGRESSION_DUPLICATE'; end if;
    if (progression->>'track'='daily' and p_document->'completion'->>'mode' is distinct from 'mentor') or
      (progression->>'track'='learning' and (p_document->'completion'->>'mode' is distinct from 'self' or p_document->'completion'->'requireQuizPass' is distinct from 'true'::jsonb or
       exists(select 1 from jsonb_array_elements(p_document->'blocks') b where b->>'type'='quiz' and b->'quiz'->'passPercent' is distinct from '100'::jsonb))) then raise exception 'BLOCK_INVALID'; end if;
  end if;
  -- Lock a row that already exists even for the first edit: two authors cannot
  -- both create competing initial versions and silently replace one another.
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  select * into v from public.edu_lesson_block_versions where id=p_new_revision;
  if found then
    if v.lesson_id<>p_lesson or v.created_by<>p_actor or v.document<>p_document then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    return jsonb_build_object('revision',v.id);
  end if;
  select revision into head_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  if head_id is distinct from p_expected_revision then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
  insert into public.edu_lesson_block_versions(id,lesson_id,document,created_by) values(p_new_revision,p_lesson,p_document,p_actor);
  insert into public.edu_lesson_block_heads(lesson_id,revision) values(p_lesson,p_new_revision)
    on conflict(lesson_id) do update set revision=excluded.revision;
  return jsonb_build_object('revision',p_new_revision);
end;
$$;

create or replace function public.edu_assert_block_access(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_edit boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare can_edit boolean;
begin
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'BLOCK_FORBIDDEN'; end if;
  select exists(select 1 from public.profiles p where p.id=p_actor and (p.role='admin' or
    (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb)))) into can_edit;
  if not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    join public.courses c on c.id=w.course_id where l.id=p_lesson and l.archived_at is null and w.archived_at is null and c.archived_at is null)
    then raise exception 'BLOCK_NOT_FOUND'; end if;
  if p_edit then
    if not can_edit then raise exception 'BLOCK_FORBIDDEN'; end if;
    return true;
  end if;
  if can_edit and p_enrollment is null then return true; end if;
  -- Even an administrator must own an enrollment when saving learner answers.
  if not exists(select 1 from public.enrollments e
    join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
    where e.id=p_enrollment and e.user_id=p_actor and l.id=p_lesson
    and l.is_published and w.is_published and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  if not (public.edu_lesson_progression_gate(p_enrollment,p_lesson)->>'isUnlocked')::boolean then raise exception 'BLOCK_LESSON_LOCKED'; end if;
  return false;
end;
$$;

create or replace function public.edu_submit_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_write uuid,p_request uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head_id uuid; d public.edu_lesson_block_drafts%rowtype; s public.edu_lesson_block_submissions%rowtype;
  doc jsonb; policy jsonb; b jsonb; f jsonb; q jsonb; answer jsonb; checks jsonb; grades jsonb:='[]';
  total integer; correct integer; answered integer; passed boolean; outcome_value text; automatic boolean;
begin
  if p_enrollment is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  if p_revision is null or p_write is null or p_request is null or p_values is null then raise exception 'BLOCK_INVALID'; end if;
  -- Consistent locks serialize content edits, entitlement changes and submits.
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  perform 1 from public.enrollments where id=p_enrollment for share;
  perform 1 from public.cohorts where id=(select cohort_id from public.enrollments where id=p_enrollment) for share;
  perform 1 from public.profiles where id=p_actor for share;
  perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  select * into s from public.edu_lesson_block_submissions where id=p_request;
  if found then
    if s.enrollment_id<>p_enrollment or s.lesson_id<>p_lesson or s.revision<>p_revision or s.draft_write_id<>p_write or s.values<>p_values then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    return public.edu_block_submission_receipt(s);
  end if;
  select revision into head_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  if head_id is distinct from p_revision then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=p_revision for update;
  if not found or d.write_id is distinct from p_write or d.values is distinct from p_values then raise exception 'BLOCK_DRAFT_CHANGED'; end if;
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=p_revision order by sequence desc limit 1;
  if found and public.edu_block_submission_receipt(s)->>'state' not in ('changes_requested','reopened') then
    if s.draft_write_id<>p_write or s.values<>p_values then raise exception 'BLOCK_ALREADY_SUBMITTED'; end if;
    return public.edu_block_submission_receipt(s);
  end if;
  select document into doc from public.edu_lesson_block_versions where id=p_revision and lesson_id=p_lesson;
  policy:=coalesce(doc->'completion','{"mode":"self","requireAnswers":true,"requireQuizPass":true}'::jsonb);
  if coalesce(policy->>'mode','') not in ('self','mentor') or jsonb_typeof(policy->'requireAnswers') is distinct from 'boolean' or jsonb_typeof(policy->'requireQuizPass') is distinct from 'boolean' then raise exception 'BLOCK_INVALID'; end if;
  if jsonb_typeof(d.values->'blocks') is distinct from 'object' or jsonb_typeof(d.values->'checklist') is distinct from 'array' then raise exception 'BLOCK_INVALID'; end if;
  checks:=d.values->'checklist';
  for f in select value from jsonb_array_elements(doc->'checklist') loop
    if f->'required'='true'::jsonb and not checks @> jsonb_build_array(f->>'id') then raise exception 'BLOCK_REQUIREMENTS_MISSING'; end if;
  end loop;
  for b in select value from jsonb_array_elements(doc->'blocks') loop
    answer:=d.values->'blocks'->(b->>'id');
    if policy->'requireAnswers'='true'::jsonb then
      if b->'question'->'required'='true'::jsonb and
        (jsonb_typeof(answer) is distinct from 'string' or coalesce(answer#>>'{}','')!~'[^[:space:]]') then raise exception 'BLOCK_REQUIREMENTS_MISSING'; end if;
      for f in select value from jsonb_array_elements(coalesce(b->'fields','[]')) loop
        if f->'required'='true'::jsonb and f->'sensitive'='false'::jsonb and
          (jsonb_typeof(answer->(f->>'id')) is distinct from 'string' or coalesce(answer->>(f->>'id'),'')!~'[^[:space:]]') then raise exception 'BLOCK_REQUIREMENTS_MISSING'; end if;
      end loop;
    end if;
    if b->>'type'='quiz' then
      total:=0;correct:=0;answered:=0;
      for q in select value from jsonb_array_elements(b->'quiz'->'questions') loop
        total:=total+1;
        if jsonb_typeof(answer->(q->>'id'))='number' then
          answered:=answered+1;
          if answer->(q->>'id')=q->'correctIndex' then correct:=correct+1; end if;
        end if;
      end loop;
      passed:=total>0 and answered=total and correct*100>=total*(b->'quiz'->>'passPercent')::integer;
      if policy->'requireQuizPass'='true'::jsonb and not passed then raise exception 'BLOCK_QUIZ_NOT_PASSED'; end if;
      grades:=grades||jsonb_build_array(jsonb_build_object('blockId',b->>'id','correct',correct,'total',total,'passed',passed));
    end if;
  end loop;
  outcome_value:=case when policy->>'mode'='mentor' then 'submitted' else 'completed' end;
  insert into public.edu_lesson_block_submissions(id,enrollment_id,lesson_id,revision,draft_write_id,values,assessment,outcome)
    values(p_request,p_enrollment,p_lesson,p_revision,p_write,d.values,jsonb_build_object('quizzes',grades),outcome_value) returning * into s;
  automatic:=outcome_value='submitted' and (public.edu_lesson_progression_gate(p_enrollment,p_lesson)->>'automaticApproval')::boolean;
  if automatic then
    insert into public.edu_lesson_block_reviews(id,submission_id,actor_id,expected_state,decision,feedback)
      values(gen_random_uuid(),s.id,p_actor,s.id,'auto_approved','');
  end if;
  if outcome_value='completed' or automatic then
    insert into public.lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at)
      values(p_enrollment,p_lesson,100,s.created_at)
      on conflict(enrollment_id,lesson_id) do update set progress_percent=100,
        completed_at=coalesce(public.lesson_progress.completed_at,excluded.completed_at),updated_at=now();
  end if;
  return public.edu_block_submission_receipt(s);
end;
$$;

create or replace function public.edu_block_submission_receipt(p_row public.edu_lesson_block_submissions)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_row.id,'revision',p_row.revision,'writeId',p_row.draft_write_id,
    'outcome',p_row.outcome,'createdAt',p_row.created_at,'assessment',p_row.assessment,
    'approvalKind',case when r.decision='auto_approved' then 'automatic' else null end,'state',case when r.decision='auto_approved' then 'approved' else coalesce(r.decision,p_row.outcome) end,'stateId',coalesce(r.id,p_row.id),'feedback',coalesce(r.feedback,''),
    'reviewedAt',r.created_at)
  from (select 1) seed left join lateral (
    select * from public.edu_lesson_block_reviews where submission_id=p_row.id order by sequence desc limit 1
  ) r on true;
$$;

create or replace function public.edu_guard_block_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.completed_at is not null and old.enrollment_id=new.enrollment_id and old.lesson_id=new.lesson_id then return new; end if;
  if (new.completed_at is not null or new.progress_percent=100) and
    exists(select 1 from public.edu_lesson_block_heads where lesson_id=new.lesson_id) and
    not exists(select 1 from public.edu_lesson_block_submissions s where s.enrollment_id=new.enrollment_id and s.lesson_id=new.lesson_id
      and (s.outcome='completed' or exists(select 1 from public.edu_lesson_block_reviews r where r.submission_id=s.id and r.decision in ('approved','auto_approved'))))
    then raise exception 'BLOCK_COMPLETION_REQUIRED'; end if;
  return new;
end;
$$;


revoke all on function public.edu_lesson_progression_gate(uuid,uuid),public.edu_progression_settings(uuid,uuid,uuid,uuid,integer),public.edu_read_lesson_progression(uuid,uuid),edu_private.edu_progression_readable(uuid) from public,anon,authenticated;
grant execute on function public.edu_lesson_progression_gate(uuid,uuid),public.edu_progression_settings(uuid,uuid,uuid,uuid,integer),public.edu_read_lesson_progression(uuid,uuid),edu_private.edu_progression_readable(uuid) to service_role;
grant execute on function edu_private.edu_progression_readable(uuid) to anon,authenticated;
commit;
