begin;

-- Private student history; no cohort activation or legacy function replacement.
create table public.edu_ai_conversations (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
 last_question text not null check(length(last_question) between 1 and 2000),
 updated_at timestamptz not null default now(),
 unique(actor_id,enrollment_id,lesson_id)
);
create index edu_ai_conversations_actor_recent on public.edu_ai_conversations(actor_id,updated_at desc,id desc);
create index edu_ai_conversations_enrollment on public.edu_ai_conversations(enrollment_id);
create index edu_ai_conversations_lesson on public.edu_ai_conversations(lesson_id);
create table public.edu_ai_conversation_turns (
 request_id uuid primary key references public.edu_ai_requests(id) on delete cascade,
 conversation_id uuid not null references public.edu_ai_conversations(id) on delete cascade,
 question text not null check(length(question) between 1 and 2000),
 image_id uuid references public.edu_question_images(id) on delete set null,
 answer jsonb check(answer is null or coalesce(jsonb_typeof(answer)='object' and jsonb_typeof(answer->'answer')='string' and length(answer->>'answer') between 1 and 4000 and jsonb_typeof(answer->'sources')='array' and jsonb_typeof(answer->'needsMentor')='boolean' and pg_column_size(answer)<40000,false)),
 status text not null default 'pending' check(status in ('pending','succeeded','failed')),
 error text check(length(error)<=500),
 created_at timestamptz not null default now(),
 check((status='succeeded')=(answer is not null))
);
create index edu_ai_turns_recent on public.edu_ai_conversation_turns(conversation_id,created_at desc,request_id desc);
create index edu_ai_turns_image on public.edu_ai_conversation_turns(image_id) where image_id is not null;
alter table public.edu_ai_conversations enable row level security;
alter table public.edu_ai_conversation_turns enable row level security;
revoke all on public.edu_ai_conversations,public.edu_ai_conversation_turns from public,anon,authenticated;
grant select,insert,update on public.edu_ai_conversations,public.edu_ai_conversation_turns to service_role;

create function public.edu_ai_history_access(p_actor uuid,p_enrollment uuid,p_lesson uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_question_access(p_actor,p_lesson,p_enrollment);
 return exists(select 1 from public.enrollments e join public.curriculum_weeks w on w.course_id=e.course_id
 join public.curriculum_lessons l on l.week_id=w.id join public.courses c on c.id=w.course_id
 where e.id=p_enrollment and e.user_id=p_actor and l.id=p_lesson and c.archived_at is null and w.archived_at is null and l.archived_at is null
 and edu_private.edu_cohort_lesson_visible(e.cohort_id,l.id));
 exception when others then return false;
end; $$;

create function public.edu_ai_student_begin(p_actor uuid,p_request uuid,p_enrollment uuid,p_lesson uuid,p_text text,p_image uuid,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare scope jsonb; c uuid; old public.edu_ai_conversation_turns%rowtype; image public.edu_question_images%rowtype; history jsonb;
begin
 perform public.edu_assert_message_actor(p_actor);
 if not public.edu_ai_history_access(p_actor,p_enrollment,p_lesson) then raise exception 'AI_FORBIDDEN'; end if;
 if p_request is null or p_text is null or length(btrim(p_text)) not between 1 and 2000 then raise exception 'AI_INVALID'; end if;
 select t.* into old from public.edu_ai_conversation_turns t join public.edu_ai_conversations c on c.id=t.conversation_id
 where t.request_id=p_request and c.actor_id=p_actor and c.enrollment_id=p_enrollment and c.lesson_id=p_lesson;
 if found then
  if old.question<>p_text or old.image_id is distinct from p_image then raise exception 'AI_DUPLICATE'; end if;
  if old.status='succeeded' then return jsonb_build_object('requestId',p_request,'cached',old.answer); end if;
  if old.status='pending' then raise exception 'AI_PENDING'; end if;
  raise exception 'AI_PREVIOUS_FAILED';
 end if;
 if p_image is not null then
  select * into image from public.edu_question_images where id=p_image;
  if image.owner_id is distinct from p_actor or image.enrollment_id is distinct from p_enrollment or image.lesson_id is distinct from p_lesson or image.ready_at is null or image.sha256 is null then raise exception 'AI_FORBIDDEN'; end if;
 end if;
 scope:=public.edu_ai_begin(p_actor,p_request,'student',p_enrollment,p_lesson,null,p_fingerprint);
 insert into public.edu_ai_conversations(actor_id,enrollment_id,lesson_id,last_question)
 values(p_actor,p_enrollment,p_lesson,p_text)
 on conflict(actor_id,enrollment_id,lesson_id) do update set last_question=excluded.last_question,updated_at=now()
 returning id into c;
 select coalesce(jsonb_agg(turn order by n,role_order),'[]') into history from (
  select n,0 role_order,jsonb_build_object('role','user','text',left(question,1500)) turn from (select question,answer,created_at,request_id,row_number() over(order by created_at,request_id) n from (select * from public.edu_ai_conversation_turns where conversation_id=c and status='succeeded' order by created_at desc,request_id desc limit 2) recent) a
  union all
  select n,1,jsonb_build_object('role','assistant','text',left(answer->>'answer',1500)) from (select answer,created_at,request_id,row_number() over(order by created_at,request_id) n from (select * from public.edu_ai_conversation_turns where conversation_id=c and status='succeeded' order by created_at desc,request_id desc limit 2) recent) b
 ) turns;
 insert into public.edu_ai_conversation_turns(request_id,conversation_id,question,image_id) values(p_request,c,p_text,p_image);
 return scope||jsonb_build_object('history',history);
end; $$;

create function public.edu_ai_student_finish(p_actor uuid,p_request uuid,p_answer jsonb,p_error text)
returns void language plpgsql security invoker set search_path='' as $$
declare t public.edu_ai_conversation_turns%rowtype; c public.edu_ai_conversations%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select x.* into t from public.edu_ai_conversation_turns x join public.edu_ai_conversations y on y.id=x.conversation_id where x.request_id=p_request and y.actor_id=p_actor for update of x;
 if not found then raise exception 'AI_FORBIDDEN'; end if;
 if t.status<>'pending' then return; end if;
 select * into c from public.edu_ai_conversations where id=t.conversation_id;
 if p_answer is not null then
  perform public.edu_ai_assert(p_actor,p_request);
  if not public.edu_ai_history_access(p_actor,c.enrollment_id,c.lesson_id) then raise exception 'AI_FORBIDDEN'; end if;
 end if;
 update public.edu_ai_conversation_turns set answer=p_answer,status=case when p_answer is null then 'failed' else 'succeeded' end,error=case when p_answer is null then left(coalesce(p_error,'답변을 확인하지 못했어요.'),500) end where request_id=p_request;
 update public.edu_ai_requests set status=case when p_answer is null then 'failed' else 'succeeded' end,finished_at=now() where id=p_request and actor_id=p_actor and status='pending';
 update public.edu_ai_conversations set updated_at=now() where id=c.id;
end; $$;

create function public.edu_ai_student_history(p_actor uuid,p_enrollment uuid default null,p_lesson uuid default null,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare convo public.edu_ai_conversations%rowtype; result jsonb;
begin
 perform public.edu_assert_message_actor(p_actor);
 if (p_before is null)<>(p_before_id is null) then raise exception 'AI_INVALID'; end if;
 if p_enrollment is null and p_lesson is null then
  select jsonb_build_object('conversations',coalesce(jsonb_agg(to_jsonb(r) order by r."updatedAt" desc,r.id desc),'[]')) into result from (
   select c.id,c.enrollment_id "enrollmentId",c.lesson_id "lessonId",c.last_question "lastQuestion",c.updated_at "updatedAt",
   concat_ws(' · ',co.name,case when l.day_number is not null then l.day_number||'일차' end,l.title) label
   from public.edu_ai_conversations c join public.enrollments e on e.id=c.enrollment_id join public.cohorts co on co.id=e.cohort_id join public.curriculum_lessons l on l.id=c.lesson_id
   where c.actor_id=p_actor and (p_before is null or (c.updated_at,c.id)<(p_before,p_before_id)) and public.edu_ai_history_access(p_actor,c.enrollment_id,c.lesson_id)
   order by c.updated_at desc,c.id desc limit 21
  ) r;
  return result;
 end if;
 if p_enrollment is null or p_lesson is null or not public.edu_ai_history_access(p_actor,p_enrollment,p_lesson) then raise exception 'AI_FORBIDDEN'; end if;
 select * into convo from public.edu_ai_conversations where actor_id=p_actor and enrollment_id=p_enrollment and lesson_id=p_lesson;
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(r) order by r."createdAt" desc,r."requestId" desc),'[]')) into result from (
  select t.request_id "requestId",t.question,t.image_id "imageId",i.name "imageName",t.answer,
   case when t.status='pending' and t.created_at<now()-interval '2 minutes' then 'failed' else t.status end status,
   case when t.status='pending' and t.created_at<now()-interval '2 minutes' then '답변 결과를 확인하지 못했어요. 새 질문으로 다시 시도해 주세요.' else t.error end error,t.created_at "createdAt"
  from public.edu_ai_conversation_turns t left join public.edu_question_images i on i.id=t.image_id
  where t.conversation_id=convo.id and (p_before is null or (t.created_at,t.request_id)<(p_before,p_before_id))
  order by t.created_at desc,t.request_id desc limit 21
 ) r;
 return result;
end; $$;

create function public.edu_ai_student_image(p_actor uuid,p_request uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c public.edu_ai_conversations%rowtype; image uuid;
begin
 perform public.edu_assert_message_actor(p_actor);
 select x.image_id into image from public.edu_ai_conversation_turns x join public.edu_ai_conversations y on y.id=x.conversation_id where x.request_id=p_request and y.actor_id=p_actor;
 select * into c from public.edu_ai_conversations where id=(select conversation_id from public.edu_ai_conversation_turns where request_id=p_request) and actor_id=p_actor;
 if not found or image is null or not public.edu_ai_history_access(p_actor,c.enrollment_id,c.lesson_id) then raise exception 'AI_FORBIDDEN'; end if;
 return (select to_jsonb(i) from public.edu_question_images i where i.id=image and i.owner_id=p_actor and i.ready_at is not null);
end; $$;

revoke all on function public.edu_ai_history_access(uuid,uuid,uuid),public.edu_ai_student_begin(uuid,uuid,uuid,uuid,text,uuid,text),public.edu_ai_student_finish(uuid,uuid,jsonb,text),public.edu_ai_student_history(uuid,uuid,uuid,timestamptz,uuid),public.edu_ai_student_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_ai_history_access(uuid,uuid,uuid),public.edu_ai_student_begin(uuid,uuid,uuid,uuid,text,uuid,text),public.edu_ai_student_finish(uuid,uuid,jsonb,text),public.edu_ai_student_history(uuid,uuid,uuid,timestamptz,uuid),public.edu_ai_student_image(uuid,uuid) to service_role;
commit;
