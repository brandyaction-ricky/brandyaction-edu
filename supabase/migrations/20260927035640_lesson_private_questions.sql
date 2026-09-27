begin;
-- Existing questions and owner-only read policies remain intact.
alter table public.edu_questions
  add column enrollment_id uuid references public.enrollments(id) on delete set null,
  add column lesson_id uuid references public.curriculum_lessons(id) on delete set null,
  add column learning_context text;
create index edu_questions_lesson_owner_idx on public.edu_questions(lesson_id,user_id,enrollment_id,created_at desc) where not is_archived;
create index edu_questions_enrollment_idx on public.edu_questions(enrollment_id) where enrollment_id is not null;

-- Called only by the authenticated server route. Recheck ownership/publication
-- inside the transaction, so a forged course or another student's enrollment cannot be attached.
create function public.edu_create_lesson_question(p_actor uuid,p_request uuid,p_enrollment uuid,p_lesson uuid,p_title text,p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.enrollments%rowtype; l public.curriculum_lessons%rowtype; w public.curriculum_weeks%rowtype;
  receipt public.edu_mutation_receipts%rowtype; intent text; v_result jsonb; context_label text;
begin
  if p_request is null or length(btrim(p_title)) not between 1 and 200 or length(btrim(p_content)) not between 1 and 10000 or p_title is null or p_content is null then raise exception 'QUESTION_INVALID'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'QUESTION_FORBIDDEN'; end if;
  select * into e from public.enrollments where id=p_enrollment and user_id=p_actor for share;
  if not found or e.status<>'active' or e.revoked_at is not null or e.access_starts_at>now() or e.access_ends_at<=now() then raise exception 'QUESTION_FORBIDDEN'; end if;
  select * into l from public.curriculum_lessons where id=p_lesson and is_published and archived_at is null for share;
  if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
  select * into w from public.curriculum_weeks where id=l.week_id and course_id=e.course_id and is_published and archived_at is null for share;
  if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
  intent:=md5(jsonb_build_array(p_enrollment,p_lesson,btrim(p_title),btrim(p_content))::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,'edu_lesson_question',intent) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.target_table<>'edu_lesson_question' or receipt.fingerprint<>intent then raise exception 'QUESTION_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;
  select c.title || ' · ' || co.name || ' · ' || w.week_number || '주차 · ' || l.title into context_label
    from public.courses c join public.cohorts co on co.id=e.cohort_id where c.id=e.course_id;
  insert into public.edu_questions(user_id,course_id,enrollment_id,lesson_id,learning_context,title,content)
    values(p_actor,e.course_id,e.id,l.id,context_label,btrim(p_title),btrim(p_content)) returning to_jsonb(edu_questions.*) into v_result;
  update public.edu_mutation_receipts r set result=v_result where r.actor_id=p_actor and r.request_id=p_request;
  return v_result;
end; $$;
revoke all on function public.edu_create_lesson_question(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.edu_create_lesson_question(uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
