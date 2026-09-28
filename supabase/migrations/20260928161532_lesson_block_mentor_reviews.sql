begin;

-- Submitted answers stay immutable. Every decision and learner reopen is an
-- append-only event, bound to the state the operator actually read.
alter table public.edu_lesson_block_submissions add column sequence bigint generated always as identity;
grant usage on sequence public.edu_lesson_block_submissions_sequence_seq to service_role;
create index edu_block_submission_latest_idx on public.edu_lesson_block_submissions(enrollment_id,lesson_id,sequence desc);
create table public.edu_lesson_block_reviews (
  id uuid primary key,
  sequence bigint generated always as identity,
  submission_id uuid not null references public.edu_lesson_block_submissions(id),
  actor_id uuid not null references public.profiles(id),
  expected_state uuid not null,
  decision text not null check(decision in ('approved','changes_requested','reopened')),
  feedback text not null default '' check(length(feedback)<=2000),
  created_at timestamptz not null default now(),
  unique(submission_id,expected_state)
);
create index edu_block_review_latest_idx on public.edu_lesson_block_reviews(submission_id,sequence desc);
create index edu_block_review_actor_idx on public.edu_lesson_block_reviews(actor_id);
alter table public.edu_lesson_block_reviews enable row level security;
revoke all on public.edu_lesson_block_reviews from public,anon,authenticated;
grant select,insert on public.edu_lesson_block_reviews to service_role;
grant usage on sequence public.edu_lesson_block_reviews_sequence_seq to service_role;

create function public.edu_assert_block_reviewer(p_actor uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and
    (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
      where s.key='edu_staff_permissions_'||p.id::text and s.value->'members'='true'::jsonb))))
    then raise exception 'BLOCK_FORBIDDEN'; end if;
end;
$$;

create or replace function public.edu_block_submission_receipt(p_row public.edu_lesson_block_submissions)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_row.id,'revision',p_row.revision,'writeId',p_row.draft_write_id,
    'outcome',p_row.outcome,'createdAt',p_row.created_at,'assessment',p_row.assessment,
    'state',coalesce(r.decision,p_row.outcome),'stateId',coalesce(r.id,p_row.id),'feedback',coalesce(r.feedback,''),
    'reviewedAt',r.created_at)
  from (select 1) seed left join lateral (
    select * from public.edu_lesson_block_reviews where submission_id=p_row.id order by sequence desc limit 1
  ) r on true;
$$;

create or replace function public.edu_guard_submitted_block_draft()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.edu_lesson_block_submissions%rowtype;
begin
  select * into s from public.edu_lesson_block_submissions where enrollment_id=new.enrollment_id and revision=new.revision order by sequence desc limit 1;
  if found and public.edu_block_submission_receipt(s)->>'state' not in ('changes_requested','reopened')
    then raise exception 'BLOCK_ALREADY_SUBMITTED'; end if;
  return new;
end;
$$;

create or replace function public.edu_guard_block_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.completed_at is not null and old.enrollment_id=new.enrollment_id and old.lesson_id=new.lesson_id then return new; end if;
  if (new.completed_at is not null or new.progress_percent=100) and
    exists(select 1 from public.edu_lesson_block_heads where lesson_id=new.lesson_id) and
    not exists(select 1 from public.edu_lesson_block_submissions s where s.enrollment_id=new.enrollment_id and s.lesson_id=new.lesson_id
      and (s.outcome='completed' or exists(select 1 from public.edu_lesson_block_reviews r where r.submission_id=s.id and r.decision='approved')))
    then raise exception 'BLOCK_COMPLETION_REQUIRED'; end if;
  return new;
end;
$$;

create function public.edu_decide_lesson_blocks(p_actor uuid,p_submission uuid,p_expected_state uuid,p_request uuid,p_decision text,p_feedback text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_lesson_block_submissions%rowtype; r public.edu_lesson_block_reviews%rowtype; receipt jsonb; latest uuid;
begin
  if p_request is null or p_expected_state is null or p_feedback is null or length(p_feedback)>2000 or
    p_decision is null or p_decision not in ('approved','changes_requested','reopened') or
    (p_decision='changes_requested' and p_feedback!~'[^[:space:]]') then raise exception 'BLOCK_INVALID'; end if;
  if p_decision<>'reopened' then perform public.edu_assert_block_reviewer(p_actor); end if;
  select * into s from public.edu_lesson_block_submissions where id=p_submission;
  if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
  -- Same order as submit: lesson, enrollment, actor, draft. The lesson lock
  -- also prevents review racing a new attempt or a replacement content head.
  perform 1 from public.curriculum_lessons where id=s.lesson_id for update;
  perform 1 from public.enrollments where id=s.enrollment_id for share;
  perform 1 from public.profiles where id=p_actor for share;
  if p_decision='reopened' then
    perform public.edu_assert_block_access(p_actor,s.lesson_id,s.enrollment_id);
    if p_feedback<>'' then raise exception 'BLOCK_INVALID'; end if;
  else
    perform public.edu_assert_block_reviewer(p_actor);
    if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id where e.id=s.enrollment_id
      and p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now()
      and (e.access_ends_at is null or e.access_ends_at>now())) then raise exception 'BLOCK_FORBIDDEN'; end if;
  end if;
  select * into r from public.edu_lesson_block_reviews where id=p_request;
  if found then
    if r.submission_id<>p_submission or r.actor_id<>p_actor or r.expected_state<>p_expected_state or r.decision<>p_decision or r.feedback<>p_feedback
      then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    return public.edu_block_submission_receipt(s);
  end if;
  select id into latest from public.edu_lesson_block_submissions where enrollment_id=s.enrollment_id and lesson_id=s.lesson_id order by sequence desc limit 1;
  receipt:=public.edu_block_submission_receipt(s);
  if latest is distinct from s.id or (receipt->>'stateId')::uuid is distinct from p_expected_state or s.outcome<>'submitted' then raise exception 'BLOCK_REVIEW_CHANGED'; end if;
  if p_decision='reopened' then
    if receipt->>'state' not in ('submitted','approved') then raise exception 'BLOCK_REVIEW_CHANGED'; end if;
    if not exists(select 1 from public.edu_lesson_block_heads where lesson_id=s.lesson_id and revision=s.revision) then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
  elsif receipt->>'state'<>'submitted' then raise exception 'BLOCK_REVIEW_CHANGED'; end if;
  insert into public.edu_lesson_block_reviews(id,submission_id,actor_id,expected_state,decision,feedback)
    values(p_request,s.id,p_actor,p_expected_state,p_decision,p_feedback);
  if p_decision='approved' then
    insert into public.lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at)
      values(s.enrollment_id,s.lesson_id,100,now()) on conflict(enrollment_id,lesson_id) do update
      set progress_percent=100,completed_at=coalesce(public.lesson_progress.completed_at,excluded.completed_at),updated_at=now();
  else
    -- Rotate the write token without changing answers. Autosaves from a tab
    -- opened before submission cannot overwrite a newly reopened attempt.
    update public.edu_lesson_block_drafts set write_id=p_request,updated_at=now()
      where enrollment_id=s.enrollment_id and revision=s.revision;
  end if;
  return public.edu_block_submission_receipt(s);
end;
$$;

create function public.edu_read_block_submission(p_actor uuid,p_submission uuid,p_enrollment uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.edu_lesson_block_submissions%rowtype; doc jsonb;
begin
  if p_enrollment is null then perform public.edu_assert_block_reviewer(p_actor); end if;
  select * into s from public.edu_lesson_block_submissions where id=p_submission;
  if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
  if p_enrollment is not null then
    if s.enrollment_id<>p_enrollment then raise exception 'BLOCK_FORBIDDEN'; end if;
    perform public.edu_assert_block_access(p_actor,s.lesson_id,p_enrollment);
  end if;
  select document into doc from public.edu_lesson_block_versions where id=s.revision;
  return jsonb_build_object('submission',public.edu_block_submission_receipt(s),'document',doc,'values',s.values,
    'memberName',(select p.full_name from public.profiles p join public.enrollments e on e.user_id=p.id where e.id=s.enrollment_id),
    'courseTitle',(select c.title from public.courses c join public.enrollments e on e.course_id=c.id where e.id=s.enrollment_id),
    'lessonTitle',(select title from public.curriculum_lessons where id=s.lesson_id),
    'isLatest',not exists(select 1 from public.edu_lesson_block_submissions n where n.enrollment_id=s.enrollment_id and n.lesson_id=s.lesson_id and n.sequence>s.sequence),
    'previousSubmissions',coalesce((select jsonb_agg(public.edu_block_submission_receipt(h) order by h.sequence desc) from public.edu_lesson_block_submissions h where h.enrollment_id=s.enrollment_id and h.lesson_id=s.lesson_id and h.id<>s.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'decision',r.decision,'feedback',r.feedback,'createdAt',r.created_at) order by r.sequence)
      from public.edu_lesson_block_reviews r where r.submission_id=s.id),'[]'::jsonb));
end;
$$;

create function public.edu_list_block_submissions(p_actor uuid,p_state text default 'submitted',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform public.edu_assert_block_reviewer(p_actor);
  if p_page is null or p_page<1 or p_page>100000 or p_state is null or p_state not in ('','submitted','approved','changes_requested','reopened') then raise exception 'BLOCK_INVALID'; end if;
  with latest as (
    select distinct on(enrollment_id,lesson_id) s.* from public.edu_lesson_block_submissions s order by enrollment_id,lesson_id,sequence desc
  ), receipts as (
    select s.*,public.edu_block_submission_receipt(s) as receipt from latest s where outcome='submitted'
  ), filtered as (
    select s.id,s.sequence,s.receipt,p.full_name as member_name,c.title as course_title,l.title as lesson_title
    from receipts s join public.enrollments e on e.id=s.enrollment_id join public.profiles p on p.id=e.user_id
    join public.courses c on c.id=e.course_id join public.curriculum_lessons l on l.id=s.lesson_id
    where p_state='' or s.receipt->>'state'=p_state
  ) select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'pageSize',20,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'submission',f.receipt,'memberName',f.member_name,'courseTitle',f.course_title,'lessonTitle',f.lesson_title) order by f.sequence)
      from (select * from filtered order by sequence limit 20 offset (p_page-1)*20) f),'[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.edu_submit_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_write uuid,p_request uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head_id uuid; d public.edu_lesson_block_drafts%rowtype; s public.edu_lesson_block_submissions%rowtype;
  doc jsonb; policy jsonb; b jsonb; f jsonb; q jsonb; answer jsonb; checks jsonb; grades jsonb:='[]';
  total integer; correct integer; answered integer; passed boolean; outcome_value text;
begin
  if p_enrollment is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  if p_revision is null or p_write is null or p_request is null or p_values is null then raise exception 'BLOCK_INVALID'; end if;
  -- Consistent locks serialize content edits, entitlement changes and submits.
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  perform 1 from public.enrollments where id=p_enrollment for share;
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
  if outcome_value='completed' then
    insert into public.lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at)
      values(p_enrollment,p_lesson,100,s.created_at)
      on conflict(enrollment_id,lesson_id) do update set progress_percent=100,
        completed_at=coalesce(public.lesson_progress.completed_at,excluded.completed_at),updated_at=now();
  end if;
  return public.edu_block_submission_receipt(s);
end;
$$;

create or replace function public.edu_read_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid default null,p_revision uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare editable boolean; current_id uuid; v public.edu_lesson_block_versions%rowtype; d public.edu_lesson_block_drafts%rowtype; s public.edu_lesson_block_submissions%rowtype;
begin
  editable:=public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  select revision into current_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  select * into v from public.edu_lesson_block_versions where id=coalesce(p_revision,current_id) and lesson_id=p_lesson;
  if p_revision is not null and v.id is null then raise exception 'BLOCK_NOT_FOUND'; end if;
  -- Old private drafts remain readable with their original questions. Do not
  -- expose arbitrary historical content to a learner who never wrote in it.
  if not editable and v.id is distinct from current_id and not exists(select 1 from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id)
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id;
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=v.id order by sequence desc limit 1;
  return jsonb_build_object('submissions',coalesce((select jsonb_agg(public.edu_block_submission_receipt(h) order by h.sequence desc) from public.edu_lesson_block_submissions h where h.enrollment_id=p_enrollment and h.revision=v.id),'[]'::jsonb),'submission',case when s.id is null then null else public.edu_block_submission_receipt(s) end,'editable',editable,'revision',v.id,'currentRevision',current_id,'document',v.document,
    'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end,
    'previousDrafts',coalesce((select jsonb_agg(jsonb_build_object('revision',dv.revision,'updatedAt',dv.updated_at) order by dv.updated_at desc)
      from public.edu_lesson_block_drafts dv join public.edu_lesson_block_versions bv on bv.id=dv.revision
      where dv.enrollment_id=p_enrollment and bv.lesson_id=p_lesson and dv.revision is distinct from current_id),'[]'::jsonb));
end;
$$;



revoke all on function public.edu_assert_block_reviewer(uuid),public.edu_decide_lesson_blocks(uuid,uuid,uuid,uuid,text,text),
  public.edu_read_block_submission(uuid,uuid,uuid),public.edu_list_block_submissions(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.edu_assert_block_reviewer(uuid),public.edu_decide_lesson_blocks(uuid,uuid,uuid,uuid,text,text),
  public.edu_read_block_submission(uuid,uuid,uuid),public.edu_list_block_submissions(uuid,text,integer) to service_role;
commit;
