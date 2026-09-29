begin;

-- Immutable submitted answers remain separate from editable drafts. Mentor
-- review will reference this snapshot; submission alone never credits progress.
create table public.edu_lesson_block_submissions (
  id uuid primary key,
  enrollment_id uuid not null references public.enrollments(id),
  lesson_id uuid not null,
  revision uuid not null,
  draft_write_id uuid not null,
  values jsonb not null check(jsonb_typeof(values)='object' and octet_length(values::text)<=1000000),
  assessment jsonb not null check(jsonb_typeof(assessment)='object'),
  outcome text not null check(outcome in ('completed','submitted')),
  created_at timestamptz not null default now(),
  foreign key(lesson_id,revision) references public.edu_lesson_block_versions(lesson_id,id)
);
create index edu_block_submissions_member_idx on public.edu_lesson_block_submissions(enrollment_id,revision,created_at desc);
create index edu_block_submissions_lesson_idx on public.edu_lesson_block_submissions(lesson_id,revision);
create index edu_block_submissions_revision_idx on public.edu_lesson_block_submissions(revision);
alter table public.edu_lesson_block_submissions enable row level security;
revoke all on public.edu_lesson_block_submissions from public,anon,authenticated;
grant select,insert on public.edu_lesson_block_submissions to service_role;

create function public.edu_block_submission_receipt(p_row public.edu_lesson_block_submissions)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_row.id,'revision',p_row.revision,'writeId',p_row.draft_write_id,
    'outcome',p_row.outcome,'createdAt',p_row.created_at,'assessment',p_row.assessment);
$$;

create function public.edu_submit_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_write uuid,p_request uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head_id uuid; d public.edu_lesson_block_drafts%rowtype; s public.edu_lesson_block_submissions%rowtype;
  doc jsonb; policy jsonb; b jsonb; f jsonb; q jsonb; answer jsonb; checks jsonb; grades jsonb:='[]';
  total integer; correct integer; answered integer; passed boolean; outcome_value text;
begin
  if p_enrollment is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  if p_revision is null or p_write is null or p_request is null or p_values is null then raise exception 'BLOCK_INVALID'; end if;
  -- Consistent locks serialize content edits, entitlement changes and submits.
  perform 1 from public.curriculum_lessons where id=p_lesson for share;
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
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=p_revision order by created_at desc,id limit 1;
  if found then
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

-- Enforce the gate even through the pre-existing progress API or direct Data
-- API writes. This narrow trigger only denies writes; no private content is
-- returned. Definer is needed to inspect the private tables for authenticated
-- legacy writers, who deliberately have no SELECT privilege on those tables.
create function public.edu_guard_block_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.completed_at is not null and old.enrollment_id=new.enrollment_id and old.lesson_id=new.lesson_id then return new; end if;
  if (new.completed_at is not null or new.progress_percent=100) and
    exists(select 1 from public.edu_lesson_block_heads where lesson_id=new.lesson_id) and
    not exists(select 1 from public.edu_lesson_block_submissions where enrollment_id=new.enrollment_id and lesson_id=new.lesson_id and outcome='completed')
    then raise exception 'BLOCK_COMPLETION_REQUIRED'; end if;
  return new;
end;
$$;
create trigger edu_guard_block_progress before insert or update on public.lesson_progress for each row execute function public.edu_guard_block_progress();

-- A submitted snapshot cannot be changed by an autosave already in flight.
create function public.edu_guard_submitted_block_draft()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.edu_lesson_block_submissions where enrollment_id=new.enrollment_id and revision=new.revision)
    then raise exception 'BLOCK_ALREADY_SUBMITTED'; end if;
  return new;
end;
$$;
create trigger edu_guard_submitted_block_draft before update on public.edu_lesson_block_drafts for each row execute function public.edu_guard_submitted_block_draft();

revoke all on function public.edu_block_submission_receipt(public.edu_lesson_block_submissions),
  public.edu_submit_lesson_blocks(uuid,uuid,uuid,uuid,uuid,uuid,jsonb),public.edu_guard_block_progress(),public.edu_guard_submitted_block_draft() from public,anon,authenticated;
grant execute on function public.edu_block_submission_receipt(public.edu_lesson_block_submissions),
  public.edu_submit_lesson_blocks(uuid,uuid,uuid,uuid,uuid,uuid,jsonb),public.edu_guard_block_progress(),public.edu_guard_submitted_block_draft() to service_role;

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
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=v.id order by created_at desc,id limit 1;
  return jsonb_build_object('submission',case when s.id is null then null else public.edu_block_submission_receipt(s) end,'editable',editable,'revision',v.id,'currentRevision',current_id,'document',v.document,
    'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end,
    'previousDrafts',coalesce((select jsonb_agg(jsonb_build_object('revision',dv.revision,'updatedAt',dv.updated_at) order by dv.updated_at desc)
      from public.edu_lesson_block_drafts dv join public.edu_lesson_block_versions bv on bv.id=dv.revision
      where dv.enrollment_id=p_enrollment and bv.lesson_id=p_lesson and dv.revision is distinct from current_id),'[]'::jsonb));
end;
$$;


commit;
