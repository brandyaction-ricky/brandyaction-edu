begin;
-- Repeatable practice is separate from the one-time lesson progress ledger.
create table public.edu_ongoing_rules (
 lesson_id uuid primary key references public.curriculum_lessons(id),
 cadence text not null check(cadence in ('daily','weekly','monthly')),
 write_id uuid not null unique, created_at timestamptz not null default now()
);
create table public.edu_ongoing_rounds (
 enrollment_id uuid not null references public.enrollments(id), lesson_id uuid not null,
 period_start timestamptz not null, period_end timestamptz not null check(period_end>period_start),
 revision uuid not null, values jsonb not null check(jsonb_typeof(values)='object' and octet_length(values::text)<=1000000),
 write_id uuid not null, updated_at timestamptz not null default now(),
 primary key(enrollment_id,lesson_id,period_start),
 foreign key(lesson_id,revision) references public.edu_lesson_block_versions(lesson_id,id)
);
create index edu_ongoing_round_lesson on public.edu_ongoing_rounds(lesson_id,period_start);
create index edu_ongoing_round_revision on public.edu_ongoing_rounds(revision);
create table public.edu_ongoing_writes (
 id uuid primary key, enrollment_id uuid not null, lesson_id uuid not null, period_start timestamptz not null,
 revision uuid not null, expected_write uuid, value_hash text not null, updated_at timestamptz not null default now(),
 foreign key(enrollment_id,lesson_id,period_start) references public.edu_ongoing_rounds(enrollment_id,lesson_id,period_start)
);
create index edu_ongoing_writes_round on public.edu_ongoing_writes(enrollment_id,lesson_id,period_start);
create table public.edu_ongoing_completions (
 id uuid primary key, enrollment_id uuid not null, lesson_id uuid not null, period_start timestamptz not null,
 revision uuid not null, write_id uuid not null, values jsonb not null, assessment jsonb not null,
 created_at timestamptz not null default now(), unique(enrollment_id,lesson_id,period_start),
 foreign key(enrollment_id,lesson_id,period_start) references public.edu_ongoing_rounds(enrollment_id,lesson_id,period_start),
 foreign key(lesson_id,revision) references public.edu_lesson_block_versions(lesson_id,id)
);
create index edu_ongoing_completions_revision on public.edu_ongoing_completions(revision);
create index edu_ongoing_completions_lesson on public.edu_ongoing_completions(lesson_id,period_start);
alter table public.edu_ongoing_rules enable row level security;
alter table public.edu_ongoing_rounds enable row level security;
alter table public.edu_ongoing_writes enable row level security;
alter table public.edu_ongoing_completions enable row level security;
revoke all on public.edu_ongoing_rules,public.edu_ongoing_rounds,public.edu_ongoing_writes,public.edu_ongoing_completions from public,anon,authenticated;
grant select,insert on public.edu_ongoing_rules,public.edu_ongoing_rounds,public.edu_ongoing_writes,public.edu_ongoing_completions to service_role;
grant update on public.edu_ongoing_rounds to service_role;

-- KST calendar periods; source weeks begin on Sunday, not ISO Monday.
create function public.edu_ongoing_period(p_cadence text,p_now timestamptz)
returns table(starts_at timestamptz,ends_at timestamptz) language plpgsql immutable security invoker set search_path='' as $$
declare local_now timestamp; local_start timestamp; span interval;
begin
 if p_now is null or p_cadence is null or p_cadence not in ('daily','weekly','monthly') then raise exception 'ONGOING_INVALID'; end if;
 local_now:=p_now at time zone 'Asia/Seoul';
 if p_cadence='daily' then local_start:=date_trunc('day',local_now);span:=interval '1 day';
 elsif p_cadence='weekly' then local_start:=date_trunc('day',local_now)-extract(dow from local_now)::integer*interval '1 day';span:=interval '7 days';
 else local_start:=date_trunc('month',local_now);span:=interval '1 month';end if;
 return query select local_start at time zone 'Asia/Seoul',(local_start+span) at time zone 'Asia/Seoul';
end;
$$;

create function public.edu_configure_ongoing(p_actor uuid,p_lesson uuid,p_cadence text,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.edu_ongoing_rules%rowtype; doc jsonb;
begin
 perform 1 from public.curriculum_lessons where id=p_lesson for update;
 perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
 if p_request is null or p_cadence is null or p_cadence not in ('daily','weekly','monthly') then raise exception 'ONGOING_INVALID'; end if;
 select * into prior from public.edu_ongoing_rules where lesson_id=p_lesson;
 if found then
  if prior.cadence<>p_cadence then raise exception 'ONGOING_CADENCE_FIXED';end if;
  return to_jsonb(prior);
 end if;
 select v.document into doc from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision where h.lesson_id=p_lesson;
 if doc is null or doc ? 'progression' or doc->'completion'->>'mode' is distinct from 'self' then raise exception 'ONGOING_INVALID';end if;
 if exists(select 1 from public.edu_lesson_block_drafts d join public.edu_lesson_block_versions v on v.id=d.revision where v.lesson_id=p_lesson) or exists(select 1 from public.lesson_progress where lesson_id=p_lesson)
  or exists(select 1 from public.edu_lesson_block_submissions where lesson_id=p_lesson) then raise exception 'ONGOING_EXISTING_RECORDS';end if;
 insert into public.edu_ongoing_rules(lesson_id,cadence,write_id) values(p_lesson,p_cadence,p_request) returning * into prior;
 return to_jsonb(prior);
end;
$$;

create function public.edu_guard_ongoing_document()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.edu_ongoing_rules where lesson_id=new.lesson_id) and
  (new.document ? 'progression' or new.document->'completion'->>'mode' is distinct from 'self') then raise exception 'ONGOING_INVALID';end if;
 return new;
end;
$$;
create trigger edu_ongoing_document before insert on public.edu_lesson_block_versions for each row execute function public.edu_guard_ongoing_document();
create function public.edu_guard_ongoing_once()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.edu_ongoing_rules rule join public.edu_lesson_block_versions v on v.lesson_id=rule.lesson_id where v.id=new.revision) then raise exception 'ONGOING_PERIOD_REQUIRED';end if;
 return new;
end;
$$;
create trigger edu_ongoing_no_single_draft before insert or update on public.edu_lesson_block_drafts for each row execute function public.edu_guard_ongoing_once();
create trigger edu_ongoing_no_single_submit before insert on public.edu_lesson_block_submissions for each row execute function public.edu_guard_ongoing_once();
create trigger edu_ongoing_round_files before insert or update on public.edu_ongoing_rounds for each row execute function public.edu_guard_answer_file_refs();
create trigger edu_ongoing_completion_files before insert on public.edu_ongoing_completions for each row execute function public.edu_guard_answer_file_refs();

create function public.edu_read_ongoing(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_period timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare cadence_value text; period_begin timestamptz; period_finish timestamptz; r public.edu_ongoing_rounds%rowtype; doc jsonb; rev uuid; c public.edu_ongoing_completions%rowtype; first_period timestamptz; completed_count integer; opportunities integer;
begin
 if p_enrollment is null then raise exception 'BLOCK_FORBIDDEN';end if;
 perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 select cadence into cadence_value from public.edu_ongoing_rules where lesson_id=p_lesson;
 if not found then raise exception 'BLOCK_NOT_FOUND';end if;
 select starts_at,ends_at into period_begin,period_finish from public.edu_ongoing_period(cadence_value,now());
 select * into r from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=coalesce(p_period,period_begin);
 if p_period is not null and p_period<>period_begin and r.revision is null then raise exception 'BLOCK_NOT_FOUND';end if;
 if r.revision is null then select revision into rev from public.edu_lesson_block_heads where lesson_id=p_lesson;
 else rev:=r.revision;end if;
 select document into doc from public.edu_lesson_block_versions where id=rev and lesson_id=p_lesson;
 if doc is null then raise exception 'BLOCK_NOT_FOUND';end if;
 select * into c from public.edu_ongoing_completions where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=coalesce(p_period,period_begin);
 select count(*)::integer,min(period_start) into completed_count,first_period from public.edu_ongoing_completions where enrollment_id=p_enrollment and lesson_id=p_lesson;
 first_period:=coalesce(first_period,period_begin);
 opportunities:=case cadence_value when 'daily' then ((period_begin at time zone 'Asia/Seoul')::date-(first_period at time zone 'Asia/Seoul')::date)+1
 when 'weekly' then ((period_begin at time zone 'Asia/Seoul')::date-(first_period at time zone 'Asia/Seoul')::date)/7+1
 else (extract(year from period_begin at time zone 'Asia/Seoul')-extract(year from first_period at time zone 'Asia/Seoul'))::integer*12
   +(extract(month from period_begin at time zone 'Asia/Seoul')-extract(month from first_period at time zone 'Asia/Seoul'))::integer+1 end;
 return jsonb_build_object('cadence',cadence_value,'periodStart',coalesce(p_period,period_begin),'periodEnd',coalesce(r.period_end,period_finish),
  'stats',jsonb_build_object('completed',completed_count,'opportunities',opportunities,'rate',round(completed_count*100.0/greatest(1,opportunities))),'currentPeriodStart',period_begin,'revision',rev,'document',doc,'draft',case when r.revision is null then null else jsonb_build_object('values',r.values,'writeId',r.write_id,'updatedAt',r.updated_at) end,
  'completion',case when c.id is null then null else jsonb_build_object('id',c.id,'writeId',c.write_id,'revision',c.revision,'createdAt',c.created_at,'assessment',c.assessment,'values',c.values) end,
  'history',coalesce((select jsonb_agg(x order by x->>'periodStart' desc) from (select jsonb_build_object('periodStart',o.period_start,'periodEnd',o.period_end,'updatedAt',o.updated_at,'completed',exists(select 1 from public.edu_ongoing_completions oc where oc.enrollment_id=o.enrollment_id and oc.lesson_id=o.lesson_id and oc.period_start=o.period_start)) as x
    from public.edu_ongoing_rounds o where o.enrollment_id=p_enrollment and o.lesson_id=p_lesson order by o.period_start desc limit 100) history),'[]'::jsonb));
end;
$$;

create function public.edu_save_ongoing(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_period timestamptz,p_revision uuid,p_expected uuid,p_request uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_ongoing_rounds%rowtype; w public.edu_ongoing_writes%rowtype; cadence_value text; period_begin timestamptz; period_finish timestamptz; expected_revision uuid;
begin
 if p_enrollment is null or p_period is null or p_revision is null or p_request is null or jsonb_typeof(p_values->'blocks') is distinct from 'object' or jsonb_typeof(p_values->'checklist') is distinct from 'array' or octet_length(p_values::text)>1000000 then raise exception 'ONGOING_INVALID';end if;
 perform 1 from public.curriculum_lessons where id=p_lesson for share;
 perform 1 from public.enrollments where id=p_enrollment for update;
 perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 select cadence into cadence_value from public.edu_ongoing_rules where lesson_id=p_lesson;
 if not found then raise exception 'BLOCK_NOT_FOUND';end if;
 select * into w from public.edu_ongoing_writes where id=p_request;
 if found then
  if w.enrollment_id<>p_enrollment or w.lesson_id<>p_lesson or w.period_start<>p_period or w.revision<>p_revision or w.expected_write is distinct from p_expected or w.value_hash<>md5(p_values::text) then raise exception 'BLOCK_REQUEST_REUSED';end if;
  return jsonb_build_object('writeId',w.id,'updatedAt',w.updated_at);
 end if;
 select starts_at,ends_at into period_begin,period_finish from public.edu_ongoing_period(cadence_value,now());
 if p_period<>period_begin then raise exception 'ONGOING_PERIOD_CHANGED';end if;
 select * into r from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=period_begin for update;
 if r.write_id is distinct from p_expected then raise exception 'BLOCK_DRAFT_CHANGED';end if;
 if r.revision is not null then expected_revision:=r.revision;else select revision into expected_revision from public.edu_lesson_block_heads where lesson_id=p_lesson;end if;
 if expected_revision is distinct from p_revision then raise exception 'BLOCK_CONTENT_CHANGED';end if;
 insert into public.edu_ongoing_rounds(enrollment_id,lesson_id,period_start,period_end,revision,values,write_id)
 values(p_enrollment,p_lesson,period_begin,period_finish,p_revision,p_values,p_request)
 on conflict(enrollment_id,lesson_id,period_start) do update set values=excluded.values,write_id=excluded.write_id,updated_at=now() returning * into r;
 insert into public.edu_ongoing_writes(id,enrollment_id,lesson_id,period_start,revision,expected_write,value_hash,updated_at) values(p_request,p_enrollment,p_lesson,p_period,p_revision,p_expected,md5(p_values::text),r.updated_at);
 return jsonb_build_object('writeId',r.write_id,'updatedAt',r.updated_at);
end;
$$;

create function public.edu_complete_ongoing(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_period timestamptz,p_revision uuid,p_write uuid,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_ongoing_rounds%rowtype; c public.edu_ongoing_completions%rowtype; cadence_value text; period_begin timestamptz;
 doc jsonb; policy jsonb; b jsonb; f jsonb; q jsonb; answer jsonb; checks jsonb; grades jsonb:='[]';total integer;correct integer;answered integer;passed boolean;
begin
 if p_enrollment is null or p_period is null or p_revision is null or p_write is null or p_request is null then raise exception 'ONGOING_INVALID';end if;
 perform 1 from public.curriculum_lessons where id=p_lesson for share;
 perform 1 from public.enrollments where id=p_enrollment for update;
 perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 select cadence into cadence_value from public.edu_ongoing_rules where lesson_id=p_lesson;
 if not found then raise exception 'BLOCK_NOT_FOUND';end if;
 select * into c from public.edu_ongoing_completions where id=p_request;
 if found then
  if c.enrollment_id<>p_enrollment or c.lesson_id<>p_lesson or c.period_start<>p_period or c.revision<>p_revision or c.write_id<>p_write then raise exception 'BLOCK_REQUEST_REUSED';end if;
  return jsonb_build_object('id',c.id,'revision',c.revision,'writeId',c.write_id,'createdAt',c.created_at,'assessment',c.assessment);
 end if;
 select starts_at into period_begin from public.edu_ongoing_period(cadence_value,now());
 if p_period<>period_begin then raise exception 'ONGOING_PERIOD_CHANGED';end if;
 select * into c from public.edu_ongoing_completions where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=p_period;
 if found then raise exception 'ONGOING_ALREADY_COMPLETED';end if;
 select * into r from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=p_period for update;
 if r.write_id is distinct from p_write or r.revision is distinct from p_revision then raise exception 'BLOCK_DRAFT_CHANGED';end if;
 select document into doc from public.edu_lesson_block_versions where id=p_revision and lesson_id=p_lesson;
  policy:=coalesce(doc->'completion','{"mode":"self","requireAnswers":true,"requireQuizPass":true}'::jsonb);
  if coalesce(policy->>'mode','') not in ('self','mentor') or jsonb_typeof(policy->'requireAnswers') is distinct from 'boolean' or jsonb_typeof(policy->'requireQuizPass') is distinct from 'boolean' then raise exception 'BLOCK_INVALID'; end if;
  if jsonb_typeof(r.values->'blocks') is distinct from 'object' or jsonb_typeof(r.values->'checklist') is distinct from 'array' then raise exception 'BLOCK_INVALID'; end if;
  checks:=r.values->'checklist';
  for f in select value from jsonb_array_elements(doc->'checklist') loop
    if f->'required'='true'::jsonb and not checks @> jsonb_build_array(f->>'id') then raise exception 'BLOCK_REQUIREMENTS_MISSING'; end if;
  end loop;
  for b in select value from jsonb_array_elements(doc->'blocks') loop
    answer:=r.values->'blocks'->(b->>'id');
    if policy->'requireAnswers'='true'::jsonb then
      if b->'question'->'required'='true'::jsonb and
        (case when b->'question'->>'kind'='text' then jsonb_typeof(answer) is distinct from 'string' or coalesce(answer#>>'{}','')!~'[^[:space:]]' else jsonb_typeof(answer) is distinct from 'object' or answer='{}'::jsonb end) then raise exception 'BLOCK_REQUIREMENTS_MISSING'; end if;
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
  insert into public.edu_ongoing_completions(id,enrollment_id,lesson_id,period_start,revision,write_id,values,assessment)
 values(p_request,p_enrollment,p_lesson,p_period,p_revision,p_write,r.values,jsonb_build_object('quizzes',grades)) returning * into c;
 return jsonb_build_object('id',c.id,'revision',c.revision,'writeId',c.write_id,'createdAt',c.created_at,'assessment',c.assessment);
end;
$$;
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
    and not exists(select 1 from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and revision=v.id)
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id;
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=v.id order by sequence desc limit 1;
  return jsonb_build_object('ongoing',(select cadence from public.edu_ongoing_rules where lesson_id=p_lesson),'submissions',coalesce((select jsonb_agg(public.edu_block_submission_receipt(h) order by h.sequence desc) from public.edu_lesson_block_submissions h where h.enrollment_id=p_enrollment and h.revision=v.id),'[]'::jsonb),'submission',case when s.id is null then null else public.edu_block_submission_receipt(s) end,'editable',editable,'revision',v.id,'currentRevision',current_id,'document',v.document,
    'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end,
    'previousDrafts',coalesce((select jsonb_agg(jsonb_build_object('revision',dv.revision,'updatedAt',dv.updated_at) order by dv.updated_at desc)
      from public.edu_lesson_block_drafts dv join public.edu_lesson_block_versions bv on bv.id=dv.revision
      where dv.enrollment_id=p_enrollment and bv.lesson_id=p_lesson and dv.revision is distinct from current_id),'[]'::jsonb));
end;
$$;



create or replace function public.edu_assert_answer_upload(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_block text,p_kind text)
returns void language plpgsql security invoker set search_path='' as $$
declare document jsonb; question_kind text; s public.edu_lesson_block_submissions%rowtype;
begin
 perform 1 from public.curriculum_lessons where id=p_lesson for share;
 perform 1 from public.enrollments where id=p_enrollment for update;
 perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 if exists(select 1 from public.edu_ongoing_rules where lesson_id=p_lesson) then
  if p_revision is distinct from coalesce((select r.revision from public.edu_ongoing_rounds r join public.edu_ongoing_rules rule on rule.lesson_id=r.lesson_id
    cross join lateral public.edu_ongoing_period(rule.cadence,now()) period where r.enrollment_id=p_enrollment and r.lesson_id=p_lesson and r.period_start=period.starts_at),
    (select revision from public.edu_lesson_block_heads where lesson_id=p_lesson)) then raise exception 'BLOCK_CONTENT_CHANGED';end if;
 else
 if not exists(select 1 from public.edu_lesson_block_heads where lesson_id=p_lesson and revision=p_revision) then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
 end if;
 select v.document into document from public.edu_lesson_block_versions v where v.id=p_revision;
 select b->'question'->>'kind' into question_kind from jsonb_array_elements(document->'blocks') b where b->>'id'=p_block and b->>'type'='question';
 if question_kind is null or (p_kind='image' and question_kind<>'image') or (p_kind='file' and question_kind not in ('image','file')) or p_kind not in ('image','file') then raise exception 'BLOCK_INVALID'; end if;
 select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=p_revision order by sequence desc limit 1;
 if found and public.edu_block_submission_receipt(s)->>'state' not in ('changes_requested','reopened') then raise exception 'BLOCK_ALREADY_SUBMITTED'; end if;
end;
$$;

revoke all on function public.edu_ongoing_period(text,timestamptz),public.edu_configure_ongoing(uuid,uuid,text,uuid),public.edu_guard_ongoing_document(),public.edu_guard_ongoing_once(),public.edu_read_ongoing(uuid,uuid,uuid,timestamptz),public.edu_save_ongoing(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid,jsonb),public.edu_complete_ongoing(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_ongoing_period(text,timestamptz),public.edu_configure_ongoing(uuid,uuid,text,uuid),public.edu_guard_ongoing_document(),public.edu_guard_ongoing_once(),public.edu_read_ongoing(uuid,uuid,uuid,timestamptz),public.edu_save_ongoing(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid,jsonb),public.edu_complete_ongoing(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid) to service_role;

create function public.edu_ongoing_settings(p_actor uuid,p_lesson uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
 return coalesce((select to_jsonb(r) from public.edu_ongoing_rules r where lesson_id=p_lesson),'null'::jsonb);
end;
$$;
create function public.edu_ongoing_history(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_before timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb;
begin
 if p_enrollment is null then raise exception 'BLOCK_FORBIDDEN';end if;
 perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 select coalesce(jsonb_agg(x order by x->>'periodStart' desc),'[]'::jsonb) into items from (
  select jsonb_build_object('periodStart',r.period_start,'periodEnd',r.period_end,'updatedAt',r.updated_at,'completed',exists(select 1 from public.edu_ongoing_completions c where c.enrollment_id=r.enrollment_id and c.lesson_id=r.lesson_id and c.period_start=r.period_start)) as x
  from public.edu_ongoing_rounds r where r.enrollment_id=p_enrollment and r.lesson_id=p_lesson and (p_before is null or r.period_start<p_before) order by r.period_start desc limit 101
 ) page;
 return jsonb_build_object('items',case when jsonb_array_length(items)=101 then items-100 else items end,'nextBefore',case when jsonb_array_length(items)=101 then items->99->>'periodStart' else null end);
end;
$$;
-- Never move recurring practice with its learner history to a different product.
create function public.edu_guard_ongoing_course_move()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='curriculum_lessons' then
  if new.week_id<>old.week_id and exists(select 1 from public.edu_ongoing_rules where lesson_id=new.id)
   and (select course_id from public.curriculum_weeks where id=new.week_id) is distinct from (select course_id from public.curriculum_weeks where id=old.week_id) then raise exception 'ONGOING_COURSE_FIXED';end if;
 elsif new.course_id<>old.course_id and exists(select 1 from public.edu_ongoing_rules r join public.curriculum_lessons l on l.id=r.lesson_id where l.week_id=new.id) then raise exception 'ONGOING_COURSE_FIXED';end if;
 return new;
end;
$$;
create trigger edu_ongoing_lesson_course before update of week_id on public.curriculum_lessons for each row execute function public.edu_guard_ongoing_course_move();
create trigger edu_ongoing_week_course before update of course_id on public.curriculum_weeks for each row execute function public.edu_guard_ongoing_course_move();
revoke all on function public.edu_ongoing_settings(uuid,uuid),public.edu_ongoing_history(uuid,uuid,uuid,timestamptz),public.edu_guard_ongoing_course_move() from public,anon,authenticated;
grant execute on function public.edu_ongoing_settings(uuid,uuid),public.edu_ongoing_history(uuid,uuid,uuid,timestamptz),public.edu_guard_ongoing_course_move() to service_role;

commit;
