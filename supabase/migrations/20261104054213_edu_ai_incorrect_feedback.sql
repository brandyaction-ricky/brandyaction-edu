begin;

alter table public.edu_ai_conversation_turns
 add column incorrect boolean not null default false;

create or replace function public.edu_ai_student_manage_turn(p_actor uuid, p_request uuid, p_action text, p_helpful boolean default null)
returns void language plpgsql security invoker set search_path='' as $$
declare
 convo public.edu_ai_conversations%rowtype;
 latest public.edu_ai_conversation_turns%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_action is null or p_action not in ('delete','feedback','incorrect') or (p_action='feedback' and p_helpful is null) then
  raise exception 'AI_INVALID';
 end if;

 -- Serialize with new questions in this conversation before changing the latest-question preview.
 select c.* into convo from public.edu_ai_conversations c
 join public.edu_ai_conversation_turns t on t.conversation_id=c.id
 where t.request_id=p_request and c.actor_id=p_actor
 for update of c;
 if not found or not public.edu_ai_history_access(p_actor,convo.enrollment_id,convo.lesson_id) then
  raise exception 'AI_FORBIDDEN';
 end if;

 if p_action in ('feedback','incorrect') then
  update public.edu_ai_conversation_turns
   set helpful=(p_action='feedback' and p_helpful is true), incorrect=(p_action='incorrect')
   where request_id=p_request and conversation_id=convo.id and status='succeeded';
  if not found then raise exception 'AI_INVALID'; end if;
  return;
 end if;

 -- Keep the provider request and usage rows for accounting.
 delete from public.edu_ai_conversation_turns
  where request_id=p_request and conversation_id=convo.id
    and (status<>'pending' or created_at<now()-interval '2 minutes');
 if not found then raise exception 'AI_PENDING'; end if;

 select * into latest from public.edu_ai_conversation_turns
  where conversation_id=convo.id order by created_at desc,request_id desc limit 1;
 if found then
  update public.edu_ai_conversations
   set last_question=latest.question,updated_at=latest.created_at where id=convo.id;
 else
  delete from public.edu_ai_conversations where id=convo.id;
 end if;
end; $$;

revoke all on function public.edu_ai_student_manage_turn(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.edu_ai_student_manage_turn(uuid,uuid,text,boolean) to service_role;

create or replace function public.edu_ai_student_history(p_actor uuid,p_enrollment uuid default null,p_lesson uuid default null,p_before timestamptz default null,p_before_id uuid default null)
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
  select t.request_id "requestId",t.question,t.image_id "imageId",i.name "imageName",t.answer,t.helpful,t.incorrect,
   case when t.status='pending' and t.created_at<now()-interval '2 minutes' then 'failed' else t.status end status,
   case when t.status='pending' and t.created_at<now()-interval '2 minutes' then '답변 결과를 확인하지 못했어요. 새 질문으로 다시 시도해 주세요.' else t.error end error,t.created_at "createdAt"
  from public.edu_ai_conversation_turns t left join public.edu_question_images i on i.id=t.image_id
  where t.conversation_id=convo.id and (p_before is null or (t.created_at,t.request_id)<(p_before,p_before_id))
  order by t.created_at desc,t.request_id desc limit 21
 ) r;
 return result;
end; $$;

commit;
