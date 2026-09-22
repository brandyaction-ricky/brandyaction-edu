begin;

-- Existing general questions/answers and owner-read RLS remain intact.
alter table public.edu_questions
  add column mission_id uuid references public.curriculum_missions(id) on delete set null,
  add column enrollment_id uuid references public.enrollments(id) on delete set null;
create index edu_questions_mission_idx on public.edu_questions(mission_id) where mission_id is not null;
create index edu_questions_enrollment_idx on public.edu_questions(enrollment_id) where enrollment_id is not null;

create function public.create_mission_question(p_actor uuid, p_request uuid, p_enrollment uuid, p_mission uuid, p_title text, p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target_course uuid; fingerprint text; receipt public.edu_mutation_receipts%rowtype; v_result jsonb;
begin
  if p_request is null or p_actor is null or p_enrollment is null or p_mission is null
    or p_title is null or length(trim(p_title)) not between 1 and 200
    or p_content is null or length(trim(p_content)) not between 1 and 10000 then
    raise exception '질문 제목과 내용을 확인해 주세요.';
  end if;
  select e.course_id into target_course
    from public.enrollments e
    join public.profiles p on p.id=e.user_id
    join public.courses c on c.id=e.course_id
    join public.curriculum_weeks w on w.course_id=c.id
    join public.curriculum_lessons l on l.week_id=w.id
    join public.curriculum_missions m on m.lesson_id=l.id
    where e.id=p_enrollment and e.user_id=p_actor and p.status='active'
      and e.status='active' and (e.access_starts_at is null or e.access_starts_at<=now())
      and (e.access_ends_at is null or e.access_ends_at>now()) and c.archived_at is null
      and w.is_published and l.is_published and m.is_published and m.archived_at is null and m.id=p_mission
    for share of e,p,c,w,l,m;
  if not found then raise exception '미션 수강 권한이 필요합니다.'; end if;
  fingerprint := md5(jsonb_build_array(p_enrollment,p_mission,trim(p_title),trim(p_content))::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,'mission_question',fingerprint) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.target_table<>'mission_question' or receipt.fingerprint<>fingerprint then raise exception '같은 요청 ID로 다른 내용을 저장할 수 없습니다.'; end if;
  if receipt.result is not null then return receipt.result; end if;
  insert into public.edu_questions(user_id,course_id,mission_id,enrollment_id,title,content)
    values(p_actor,target_course,p_mission,p_enrollment,trim(p_title),trim(p_content))
    returning jsonb_build_object('id',id) into v_result;
  update public.edu_mutation_receipts set result=v_result where actor_id=p_actor and request_id=p_request;
  return v_result;
end; $$;
revoke all on function public.create_mission_question(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_mission_question(uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
