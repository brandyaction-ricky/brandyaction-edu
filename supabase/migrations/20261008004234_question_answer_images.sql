begin;
-- The existing private bucket is reused; answer attachments have separate ownership
-- and question bindings so learner uploads can never be attached to operator answers.
create table public.edu_question_answer_images (
 id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 question_id uuid not null references public.edu_questions(id) on delete cascade,
 answer_id uuid unique references public.edu_question_answers(id) on delete cascade,
 name text not null check(length(name) between 1 and 240), size integer not null check(size between 1 and 10485760),
 extension text not null check(extension in ('png','jpg','jpeg','gif','webp')), content_type text not null,
 path text not null unique, created_at timestamptz not null default now(), ready_at timestamptz,
 sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'), check((ready_at is null)=(sha256 is null))
);
create index edu_answer_images_owner_created on public.edu_question_answer_images(owner_id,created_at);
create index edu_answer_images_question on public.edu_question_answer_images(question_id);
alter table public.edu_question_answer_images enable row level security;
revoke all on public.edu_question_answer_images from public,anon,authenticated;
grant select,insert,update on public.edu_question_answer_images to service_role;

create function public.edu_prepare_answer_image(p_actor uuid,p_question uuid,p_request uuid,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype; mime text;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 perform 1 from public.edu_questions where id=p_question and not is_archived for share;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 -- Serialize an operator's upload quota, using the existing question -> profile order.
 perform 1 from public.profiles where id=p_actor for update;
 perform public.edu_assert_block_reviewer(p_actor);
 mime:=case p_spec->>'extension' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'gif' then 'image/gif' when 'webp' then 'image/webp' end;
 if p_request is null or p_spec is null or mime is null or (p_spec->>'contentType') is distinct from mime or (p_spec->>'kind') is distinct from 'image'
  or coalesce(length(p_spec->>'name'),0) not between 1 and 240 or coalesce((p_spec->>'size')::integer,0) not between 1 and 10485760 then raise exception 'QUESTION_INVALID'; end if;
 select * into f from public.edu_question_answer_images where id=p_request;
 if found then
  if f.owner_id<>p_actor or f.question_id<>p_question or f.name is distinct from p_spec->>'name' or f.size is distinct from (p_spec->>'size')::integer or f.content_type<>mime or f.extension is distinct from p_spec->>'extension' then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 else
  if (select count(*) from public.edu_question_answer_images where owner_id=p_actor and created_at>now()-interval '1 day')>=100 then raise exception 'QUESTION_UPLOAD_LIMIT'; end if;
  insert into public.edu_question_answer_images(id,owner_id,question_id,name,size,extension,content_type,path)
   values(p_request,p_actor,p_question,p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'extension',mime,'answers/'||p_actor::text||'/'||p_request::text||'.'||(p_spec->>'extension')) returning * into f;
 end if;
 return to_jsonb(f);
end; $$;

create function public.edu_owned_answer_image(p_actor uuid,p_image uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select * into f from public.edu_question_answer_images where id=p_image and owner_id=p_actor;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
 if not exists(select 1 from public.edu_questions where id=f.question_id and not is_archived) then raise exception 'QUESTION_NOT_FOUND'; end if;
 return to_jsonb(f);
end; $$;

create function public.edu_complete_answer_image(p_actor uuid,p_image uuid,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype;
begin
 perform public.edu_owned_answer_image(p_actor,p_image);
 if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'QUESTION_INVALID'; end if;
 select * into f from public.edu_question_answer_images where id=p_image for update;
 if f.sha256 is not null and f.sha256<>p_sha256 then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 update public.edu_question_answer_images set sha256=p_sha256,ready_at=coalesce(ready_at,now()) where id=p_image returning * into f;
 return jsonb_build_object('id',f.id,'name',f.name,'size',f.size);
end; $$;

create function public.edu_add_question_answer_with_image(p_actor uuid,p_question uuid,p_expected_head uuid,p_request uuid,p_content text,p_image uuid,p_assist_job uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_answer_images%rowtype; result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 perform 1 from public.edu_questions where id=p_question and not is_archived for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor for share;
 perform public.edu_assert_block_reviewer(p_actor);
 select * into f from public.edu_question_answer_images where id=p_image for update;
 if not found or f.owner_id<>p_actor or f.question_id<>p_question or f.ready_at is null then raise exception 'QUESTION_INVALID'; end if;
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

create function public.edu_read_answer_image(p_actor uuid,p_question uuid,p_answer uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; f public.edu_question_answer_images%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question;
 if not found or (not public.edu_message_operator(p_actor) and (q.is_archived or (q.user_id<>p_actor and not public.edu_can_read_cohort_question(p_actor,q.id)))) then raise exception 'QUESTION_NOT_FOUND'; end if;
 select f1.* into f from public.edu_question_answer_images f1 join public.edu_question_answers a on a.id=f1.answer_id
  where f1.answer_id=p_answer and f1.question_id=q.id and a.question_id=q.id and a.deleted_at is null and f1.ready_at is not null;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 return to_jsonb(f);
end; $$;

-- Preserve the existing thread's visibility, pagination, deletion and author masking.
create function public.edu_read_question_thread_with_images(p_actor uuid,p_question uuid,p_before bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; answers jsonb;
begin
 result:=public.edu_read_question_thread(p_actor,p_question,p_before);
 select coalesce(jsonb_agg(a.item||jsonb_build_object('imageId',f.id) order by a.ord),'[]'::jsonb) into answers
  from jsonb_array_elements(result->'answers') with ordinality a(item,ord)
  left join public.edu_question_answer_images f on f.answer_id=(a.item->>'id')::uuid and f.question_id=p_question and f.ready_at is not null;
 return jsonb_set(result,'{answers}',answers);
end; $$;

revoke all on function public.edu_prepare_answer_image(uuid,uuid,uuid,jsonb),public.edu_owned_answer_image(uuid,uuid),public.edu_complete_answer_image(uuid,uuid,text),public.edu_add_question_answer_with_image(uuid,uuid,uuid,uuid,text,uuid,uuid),public.edu_read_answer_image(uuid,uuid,uuid),public.edu_read_question_thread_with_images(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.edu_prepare_answer_image(uuid,uuid,uuid,jsonb),public.edu_owned_answer_image(uuid,uuid),public.edu_complete_answer_image(uuid,uuid,text),public.edu_add_question_answer_with_image(uuid,uuid,uuid,uuid,text,uuid,uuid),public.edu_read_answer_image(uuid,uuid,uuid),public.edu_read_question_thread_with_images(uuid,uuid,bigint) to service_role;
commit;
