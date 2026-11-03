begin;
-- Private, append-only uploads. No client Storage or table write policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('lesson-answer-files','lesson-answer-files',false,10485760,array['image/png','image/jpeg','image/webp','image/gif','application/zip','application/vnd.rar','application/x-7z-compressed','application/x-tar','application/gzip']);
create table public.edu_lesson_answer_files (
 id uuid primary key, owner_id uuid not null references public.profiles(id),
 enrollment_id uuid not null references public.enrollments(id), lesson_id uuid not null references public.curriculum_lessons(id),
 revision uuid not null references public.edu_lesson_block_versions(id), block_id text not null check(length(block_id) between 1 and 100),
 kind text not null check(kind in ('image','file')), name text not null check(length(name) between 1 and 240),
 size integer not null check(size between 1 and 10485760), content_type text not null, extension text not null,
 path text not null unique, sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), ready_at timestamptz,
 check ((ready_at is null) = (sha256 is null))
);
create index edu_answer_files_owner_created on public.edu_lesson_answer_files(owner_id,created_at);
create index edu_answer_files_enrollment_revision on public.edu_lesson_answer_files(enrollment_id,revision);
create index edu_answer_files_lesson on public.edu_lesson_answer_files(lesson_id);
create index edu_answer_files_revision on public.edu_lesson_answer_files(revision);
alter table public.edu_lesson_answer_files enable row level security;
revoke all on public.edu_lesson_answer_files from public,anon,authenticated;
grant select,insert,update on public.edu_lesson_answer_files to service_role;

create function public.edu_assert_answer_upload(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_block text,p_kind text)
returns void language plpgsql security invoker set search_path='' as $$
declare document jsonb; question_kind text; s public.edu_lesson_block_submissions%rowtype;
begin
 perform 1 from public.curriculum_lessons where id=p_lesson for share;
 perform 1 from public.enrollments where id=p_enrollment for update;
 perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 if not exists(select 1 from public.edu_lesson_block_heads where lesson_id=p_lesson and revision=p_revision) then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
 select v.document into document from public.edu_lesson_block_versions v where v.id=p_revision;
 select b->'question'->>'kind' into question_kind from jsonb_array_elements(document->'blocks') b where b->>'id'=p_block and b->>'type'='question';
 if question_kind is null or (p_kind='image' and question_kind<>'image') or (p_kind='file' and question_kind not in ('image','file')) or p_kind not in ('image','file') then raise exception 'BLOCK_INVALID'; end if;
 select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=p_revision order by sequence desc limit 1;
 if found and public.edu_block_submission_receipt(s)->>'state' not in ('changes_requested','reopened') then raise exception 'BLOCK_ALREADY_SUBMITTED'; end if;
end;
$$;
create function public.edu_prepare_answer_file(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_block text,p_request uuid,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_lesson_answer_files%rowtype;
begin
 if p_request is null or p_spec is null or (p_spec->>'size')::integer not between 1 and 10485760 or length(p_spec->>'name') not between 1 and 240 then raise exception 'BLOCK_INVALID'; end if;
 perform public.edu_assert_answer_upload(p_actor,p_lesson,p_enrollment,p_revision,p_block,p_spec->>'kind');
 perform 1 from public.profiles where id=p_actor for update;
 select * into f from public.edu_lesson_answer_files where id=p_request;
 if found then
   if f.owner_id<>p_actor or f.lesson_id<>p_lesson or f.enrollment_id<>p_enrollment or f.revision<>p_revision or f.block_id<>p_block or
      f.kind is distinct from p_spec->>'kind' or f.name is distinct from p_spec->>'name' or f.size is distinct from (p_spec->>'size')::integer or f.extension is distinct from p_spec->>'extension' or f.content_type is distinct from p_spec->>'contentType' then raise exception 'BLOCK_REQUEST_REUSED'; end if;
 else
   if (select count(*) from public.edu_lesson_answer_files where owner_id=p_actor and created_at>now()-interval '1 hour')>=30 then raise exception 'BLOCK_UPLOAD_LIMIT'; end if;
   if not ((p_spec->>'kind'='image' and p_spec->>'extension' in ('png','jpg','jpeg','webp','gif')) or (p_spec->>'kind'='file' and p_spec->>'extension' in ('zip','rar','7z','tar','gz','tgz'))) then raise exception 'BLOCK_INVALID'; end if;
   insert into public.edu_lesson_answer_files(id,owner_id,lesson_id,enrollment_id,revision,block_id,kind,name,size,content_type,extension,path)
   values(p_request,p_actor,p_lesson,p_enrollment,p_revision,p_block,p_spec->>'kind',p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'contentType',p_spec->>'extension',p_actor::text||'/'||p_request::text||'.'||(p_spec->>'extension')) returning * into f;
 end if;
 return to_jsonb(f);
end;
$$;
create function public.edu_owned_answer_file(p_actor uuid,p_file uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_lesson_answer_files%rowtype;
begin
 select * into f from public.edu_lesson_answer_files where id=p_file and owner_id=p_actor;
 if not found then raise exception 'BLOCK_FORBIDDEN'; end if;
 perform public.edu_assert_answer_upload(p_actor,f.lesson_id,f.enrollment_id,f.revision,f.block_id,f.kind);
 return to_jsonb(f);
end;
$$;
create function public.edu_complete_answer_file(p_actor uuid,p_file uuid,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_lesson_answer_files%rowtype;
begin
 perform public.edu_owned_answer_file(p_actor,p_file);
 if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'BLOCK_INVALID'; end if;
 select * into f from public.edu_lesson_answer_files where id=p_file for update;
 if f.sha256 is not null and f.sha256<>p_sha256 then raise exception 'BLOCK_REQUEST_REUSED'; end if;
 update public.edu_lesson_answer_files set sha256=p_sha256,ready_at=coalesce(ready_at,now()) where id=p_file returning * into f;
 return jsonb_build_object('id',f.id,'name',f.name,'kind',f.kind,'size',f.size);
end;
$$;
-- Validation also runs for service-role SQL callers and immutable submissions.
create function public.edu_guard_answer_file_refs()
returns trigger language plpgsql security invoker set search_path='' as $$
declare document jsonb; b jsonb; value jsonb; entry record; expected_kind text;
begin
 select v.document into document from public.edu_lesson_block_versions v where v.id=new.revision;
 for b in select x from jsonb_array_elements(document->'blocks') x where x->>'type'='question' and x->'question'->>'kind' in ('image','file') loop
  value:=new.values->'blocks'->(b->>'id');
  if value is null then continue; end if;
  if jsonb_typeof(value)<>'object' then raise exception 'BLOCK_FILE_INVALID'; end if;
  for entry in select * from jsonb_each_text(value) loop
   expected_kind:=case entry.key when 'imageId' then 'image' when 'fileId' then 'file' else null end;
   if expected_kind is null or (b->'question'->>'kind'='file' and expected_kind<>'file') or not exists(
    select 1 from public.edu_lesson_answer_files f where f.id::text=entry.value and f.kind=expected_kind and f.enrollment_id=new.enrollment_id and f.revision=new.revision and f.block_id=b->>'id' and f.ready_at is not null
   ) then raise exception 'BLOCK_FILE_INVALID'; end if;
  end loop;
 end loop;
 return new;
end;
$$;
create trigger edu_draft_answer_files before insert or update on public.edu_lesson_block_drafts for each row execute function public.edu_guard_answer_file_refs();
create trigger edu_submission_answer_files before insert on public.edu_lesson_block_submissions for each row execute function public.edu_guard_answer_file_refs();

create function public.edu_read_answer_file(p_actor uuid,p_file uuid,p_submission uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.edu_lesson_answer_files%rowtype; detail jsonb;
begin
 select * into f from public.edu_lesson_answer_files where id=p_file and ready_at is not null;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 if f.owner_id=p_actor then
   perform public.edu_assert_block_access(p_actor,f.lesson_id,f.enrollment_id);
 else
   if p_submission is null then raise exception 'BLOCK_FORBIDDEN'; end if;
   detail:=public.edu_read_block_submission(p_actor,p_submission,null);
   if detail->'submission'->>'revision'<>f.revision::text or (detail->'values'->'blocks'->f.block_id @> jsonb_build_object(case f.kind when 'image' then 'imageId' else 'fileId' end,f.id::text)) is distinct from true then raise exception 'BLOCK_FORBIDDEN'; end if;
 end if;
 return to_jsonb(f);
end;
$$;
revoke all on function public.edu_assert_answer_upload(uuid,uuid,uuid,uuid,text,text),public.edu_prepare_answer_file(uuid,uuid,uuid,uuid,text,uuid,jsonb),public.edu_owned_answer_file(uuid,uuid),public.edu_complete_answer_file(uuid,uuid,text),public.edu_guard_answer_file_refs(),public.edu_read_answer_file(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_assert_answer_upload(uuid,uuid,uuid,uuid,text,text),public.edu_prepare_answer_file(uuid,uuid,uuid,uuid,text,uuid,jsonb),public.edu_owned_answer_file(uuid,uuid),public.edu_complete_answer_file(uuid,uuid,text),public.edu_guard_answer_file_refs(),public.edu_read_answer_file(uuid,uuid,uuid) to service_role;
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


commit;
