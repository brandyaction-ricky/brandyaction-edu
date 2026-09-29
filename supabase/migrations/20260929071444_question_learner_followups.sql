begin;
-- Keep the existing append-only thread and its pagination/ownership boundary.
alter table public.edu_question_answers drop constraint edu_question_answers_source_check;
alter table public.edu_question_answers add constraint edu_question_answers_source_check check(source in ('operator','legacy','learner'));

create or replace function edu_private.record_question_answer()
returns trigger language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; recipient uuid;
begin
 if new.source='learner' then
  -- Do not overwrite the last operator answer with a student's question.
  update public.edu_questions set answer_head_id=new.id,status='open',is_resolved=false,updated_at=now()
    where id=new.question_id returning * into q;
  for recipient in select id from public.profiles where role='admin' and status='active' loop
   perform edu_private.learning_notice(recipient,'question','followup:'||new.id::text,
    '[후속 질문]'||E'\n\n'||q.title||E'\n'||new.content,'/admin/questions');
  end loop;
 else
  update public.edu_questions set answer=new.content,answer_head_id=new.id,status='answered',updated_at=now()
    where id=new.question_id returning * into q;
  perform edu_private.learning_notice(q.user_id,'answer',new.id::text,'[질문함 답변]'||E'\n\nQ. '||q.content||E'\n\nA. '||new.content,'/my/questions');
 end if;
 return new;
end; $$;

create function public.edu_add_question_followup(p_actor uuid,p_question uuid,p_expected_head uuid,p_request uuid,p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; a public.edu_question_answers%rowtype; author text;
begin
 if p_request is null or p_content is null or length(p_content)>10000 or p_content !~ '[^[:space:]]' then raise exception 'QUESTION_INVALID'; end if;
 perform public.edu_assert_message_actor(p_actor);
 -- Same lock order as operator replies: question, then actor. Ownership and
 -- active-account checks are repeated under locks, including idempotent retries.
 select * into q from public.edu_questions where id=p_question for update;
 if not found or q.is_archived or q.user_id is distinct from p_actor then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor for share;
 perform public.edu_assert_message_actor(p_actor);
 select * into a from public.edu_question_answers where id=p_request;
 if found then
  if a.source<>'learner' or a.question_id<>q.id or a.actor_id is distinct from p_actor or a.content<>p_content or a.expected_head is distinct from p_expected_head then raise exception 'QUESTION_REQUEST_REUSED'; end if;
  return jsonb_build_object('id',a.id,'questionId',q.id);
 end if;
 if q.answer_head_id is distinct from p_expected_head then raise exception 'QUESTION_CHANGED'; end if;
 select coalesce(nullif(full_name,''),'수강생') into author from public.profiles where id=p_actor;
 insert into public.edu_question_answers(id,question_id,actor_id,author_name,source,expected_head,content)
  values(p_request,q.id,p_actor,author,'learner',p_expected_head,p_content);
 return jsonb_build_object('id',p_request,'questionId',q.id);
end; $$;

create or replace function public.edu_read_question_thread(p_actor uuid,p_question uuid,p_before bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; operator boolean; answer_rows jsonb; next_cursor text;
begin
 perform public.edu_assert_message_actor(p_actor);
 operator:=public.edu_message_operator(p_actor);
 select * into q from public.edu_questions where id=p_question;
 if not found or (not operator and (q.user_id<>p_actor or q.is_archived)) then raise exception 'QUESTION_NOT_FOUND'; end if;
 if p_before<1 then raise exception 'QUESTION_INVALID'; end if;
 with page as (
  select * from public.edu_question_answers where question_id=q.id and (p_before is null or sequence<p_before) order by sequence desc limit 21
 ), visible as (select * from page order by sequence desc limit 20)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'authorName',author_name,'source',source,'content',content,'createdAt',created_at) order by sequence) from visible),'[]'::jsonb),
  case when (select count(*) from page)>20 then (select min(sequence)::text from visible) else null end into answer_rows,next_cursor;
 return jsonb_build_object('question',jsonb_build_object('id',q.id,'title',q.title,'content',q.content,'learningContext',q.learning_context,'status',q.status,'resolved',q.is_resolved,'archived',q.is_archived,'headId',q.answer_head_id,'imageId',q.image_id),
  'answers',answer_rows,'nextCursor',next_cursor,'canAnswer',operator and not q.is_archived,'canFollowUp',q.user_id=p_actor and not q.is_archived);
end; $$;

revoke all on function public.edu_add_question_followup(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_add_question_followup(uuid,uuid,uuid,uuid,text) to service_role;
commit;
