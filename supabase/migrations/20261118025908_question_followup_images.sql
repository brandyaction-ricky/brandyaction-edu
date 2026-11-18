begin;

-- Reuse the existing private objects, read permissions and erasure path.
alter table public.edu_question_answer_images add column is_followup boolean not null default false;

create function edu_private.assert_thread_image_actor(p_actor uuid,p_followup boolean)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
 if p_followup then
  perform public.edu_assert_message_actor(p_actor);
 else
  perform public.edu_assert_block_reviewer(p_actor);
 end if;
end; $$;

create function edu_private.prepare_thread_image(p_actor uuid,p_question uuid,p_request uuid,p_spec jsonb,p_followup boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype; mime text;
begin
 perform edu_private.assert_thread_image_actor(p_actor,p_followup);
 perform 1 from public.edu_questions
  where id=p_question and not is_archived and (not p_followup or user_id=p_actor) for share;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor for update;
 perform edu_private.assert_thread_image_actor(p_actor,p_followup);
 mime:=case p_spec->>'extension' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'gif' then 'image/gif' when 'webp' then 'image/webp' end;
 if p_request is null or p_spec is null or mime is null or (p_spec->>'contentType') is distinct from mime or (p_spec->>'kind') is distinct from 'image'
  or coalesce(length(p_spec->>'name'),0) not between 1 and 240 or coalesce((p_spec->>'size')::integer,0) not between 1 and 10485760 then raise exception 'QUESTION_INVALID'; end if;
 select * into f from public.edu_question_answer_images where id=p_request;
 if found then
  if f.is_followup<>p_followup or f.owner_id<>p_actor or f.question_id<>p_question or f.name is distinct from p_spec->>'name' or f.size is distinct from (p_spec->>'size')::integer or f.content_type<>mime or f.extension is distinct from p_spec->>'extension' then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 else
  if (select count(*) from public.edu_question_answer_images where owner_id=p_actor and is_followup=p_followup and created_at>now()-interval '1 day')
   >= (case when p_followup then 30 else 100 end) then raise exception 'QUESTION_UPLOAD_LIMIT'; end if;
  insert into public.edu_question_answer_images(id,owner_id,question_id,name,size,extension,content_type,path,is_followup)
   values(p_request,p_actor,p_question,p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'extension',mime,
    'answers/'||p_actor::text||'/'||p_request::text||'.'||(p_spec->>'extension'),p_followup) returning * into f;
 end if;
 return to_jsonb(f);
end; $$;

create function edu_private.owned_thread_image(p_actor uuid,p_image uuid,p_followup boolean)
returns public.edu_question_answer_images language plpgsql stable security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype;
begin
 perform edu_private.assert_thread_image_actor(p_actor,p_followup);
 select * into f from public.edu_question_answer_images where id=p_image and owner_id=p_actor and is_followup=p_followup;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
 if not exists(select 1 from public.edu_questions where id=f.question_id and not is_archived and (not p_followup or user_id=p_actor)) then
  raise exception 'QUESTION_NOT_FOUND';
 end if;
 return f;
end; $$;

create function edu_private.complete_thread_image(p_actor uuid,p_image uuid,p_sha256 text,p_followup boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype;
begin
 if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'QUESTION_INVALID'; end if;
 f:=edu_private.owned_thread_image(p_actor,p_image,p_followup);
 perform 1 from public.edu_questions where id=f.question_id and not is_archived and (not p_followup or user_id=p_actor) for share;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor for share;
 perform edu_private.assert_thread_image_actor(p_actor,p_followup);
 select * into f from public.edu_question_answer_images where id=p_image and owner_id=p_actor and is_followup=p_followup for update;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
 if f.sha256 is not null and f.sha256<>p_sha256 then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 update public.edu_question_answer_images set sha256=p_sha256,ready_at=coalesce(ready_at,now()) where id=f.id returning * into f;
 return jsonb_build_object('id',f.id,'name',f.name,'size',f.size);
end; $$;

create or replace function public.edu_prepare_answer_image(p_actor uuid,p_question uuid,p_request uuid,p_spec jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select edu_private.prepare_thread_image(p_actor,p_question,p_request,p_spec,false)
$$;

create function public.edu_prepare_followup_image(p_actor uuid,p_question uuid,p_request uuid,p_spec jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select edu_private.prepare_thread_image(p_actor,p_question,p_request,p_spec,true)
$$;

create or replace function public.edu_owned_answer_image(p_actor uuid,p_image uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(edu_private.owned_thread_image(p_actor,p_image,false))
$$;

create function public.edu_owned_followup_image(p_actor uuid,p_image uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(edu_private.owned_thread_image(p_actor,p_image,true))
$$;

create or replace function public.edu_complete_answer_image(p_actor uuid,p_image uuid,p_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$
 select edu_private.complete_thread_image(p_actor,p_image,p_sha256,false)
$$;

create function public.edu_complete_followup_image(p_actor uuid,p_image uuid,p_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$
 select edu_private.complete_thread_image(p_actor,p_image,p_sha256,true)
$$;

create function edu_private.add_question_followup(p_actor uuid,p_question uuid,p_expected_head uuid,p_request uuid,p_content text,p_image uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; a public.edu_question_answers%rowtype; f public.edu_question_answer_images%rowtype; author text; attached uuid;
begin
 if p_request is null or p_content is null or length(p_content)>10000 or p_content !~ '[^[:space:]]' then raise exception 'QUESTION_INVALID'; end if;
 perform public.edu_assert_message_actor(p_actor);
 -- Preserve the question -> profile -> attachment lock order.
 select * into q from public.edu_questions where id=p_question for update;
 if not found or q.is_archived or q.user_id is distinct from p_actor then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor for share;
 perform public.edu_assert_message_actor(p_actor);
 select * into a from public.edu_question_answers where id=p_request;
 if found then
  select id into attached from public.edu_question_answer_images where answer_id=a.id;
  if a.source<>'learner' or a.question_id<>q.id or a.actor_id is distinct from p_actor or a.content<>p_content
   or a.expected_head is distinct from p_expected_head or attached is distinct from p_image then raise exception 'QUESTION_REQUEST_REUSED'; end if;
  return jsonb_build_object('id',a.id,'questionId',q.id);
 end if;
 if q.answer_head_id is distinct from p_expected_head then raise exception 'QUESTION_CHANGED'; end if;
 if p_image is not null then
  select * into f from public.edu_question_answer_images where id=p_image for update;
  if not found or not f.is_followup or f.owner_id<>p_actor or f.question_id<>q.id or f.ready_at is null then raise exception 'QUESTION_INVALID'; end if;
  if f.answer_id is not null then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 end if;
 select coalesce(nullif(full_name,''),'수강생') into author from public.profiles where id=p_actor;
 insert into public.edu_question_answers(id,question_id,actor_id,author_name,source,expected_head,content)
  values(p_request,q.id,p_actor,author,'learner',p_expected_head,p_content);
 if p_image is not null then
  update public.edu_question_answer_images set answer_id=p_request where id=f.id;
 end if;
 return jsonb_build_object('id',p_request,'questionId',q.id);
end; $$;

create or replace function public.edu_add_question_followup(p_actor uuid,p_question uuid,p_expected_head uuid,p_request uuid,p_content text)
returns jsonb language sql security invoker set search_path='' as $$
 select edu_private.add_question_followup(p_actor,p_question,p_expected_head,p_request,p_content,null)
$$;

create function public.edu_add_question_followup_with_image(p_actor uuid,p_question uuid,p_expected_head uuid,p_request uuid,p_content text,p_image uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select edu_private.add_question_followup(p_actor,p_question,p_expected_head,p_request,p_content,p_image)
$$;

create or replace function public.edu_add_question_answer_with_image(p_actor uuid,p_question uuid,p_expected_head uuid,p_request uuid,p_content text,p_image uuid,p_assist_job uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype; result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 perform 1 from public.edu_questions where id=p_question and not is_archived for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor for share;
 perform public.edu_assert_block_reviewer(p_actor);
 select * into f from public.edu_question_answer_images where id=p_image for update;
 if not found or f.is_followup or f.owner_id<>p_actor or f.question_id<>p_question or f.ready_at is null then raise exception 'QUESTION_INVALID'; end if;
 if f.answer_id is not null and f.answer_id is distinct from p_request then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 -- A retry must retain the exact attachment; it cannot add an image to an old answer.
 if exists(select 1 from public.edu_question_answers where id=p_request) and f.answer_id is distinct from p_request then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 if exists(select 1 from public.edu_question_answers where id=p_request and deleted_at is not null) then raise exception 'QUESTION_NOT_FOUND'; end if;
 if p_assist_job is null then
  result:=public.edu_add_question_answer(p_actor,p_question,p_expected_head,p_request,p_content);
 else
  result:=public.edu_answer_from_assist(p_actor,p_question,p_assist_job,p_request,p_content);
 end if;
 update public.edu_question_answer_images set answer_id=p_request where id=f.id;
 return result;
end; $$;

revoke all on function
 edu_private.assert_thread_image_actor(uuid,boolean),
 edu_private.prepare_thread_image(uuid,uuid,uuid,jsonb,boolean),
 edu_private.owned_thread_image(uuid,uuid,boolean),
 edu_private.complete_thread_image(uuid,uuid,text,boolean),
 edu_private.add_question_followup(uuid,uuid,uuid,uuid,text,uuid),
 public.edu_prepare_followup_image(uuid,uuid,uuid,jsonb),
 public.edu_owned_followup_image(uuid,uuid),
 public.edu_complete_followup_image(uuid,uuid,text),
 public.edu_add_question_followup_with_image(uuid,uuid,uuid,uuid,text,uuid)
 from public,anon,authenticated;

grant execute on function
 edu_private.assert_thread_image_actor(uuid,boolean),
 edu_private.prepare_thread_image(uuid,uuid,uuid,jsonb,boolean),
 edu_private.owned_thread_image(uuid,uuid,boolean),
 edu_private.complete_thread_image(uuid,uuid,text,boolean),
 edu_private.add_question_followup(uuid,uuid,uuid,uuid,text,uuid),
 public.edu_prepare_followup_image(uuid,uuid,uuid,jsonb),
 public.edu_owned_followup_image(uuid,uuid),
 public.edu_complete_followup_image(uuid,uuid,text),
 public.edu_add_question_followup_with_image(uuid,uuid,uuid,uuid,text,uuid)
 to service_role;

commit;
