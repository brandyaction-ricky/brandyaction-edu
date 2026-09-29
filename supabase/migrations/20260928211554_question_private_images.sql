begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('question-images','question-images',false,10485760,array['image/png','image/jpeg','image/webp','image/gif']);
create table public.edu_question_images (
 id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid references public.enrollments(id) on delete set null, lesson_id uuid references public.curriculum_lessons(id) on delete set null,
 name text not null check(length(name) between 1 and 240), size integer not null check(size between 1 and 10485760),
 extension text not null check(extension in ('png','jpg','jpeg','gif','webp')), content_type text not null,
 path text not null unique, created_at timestamptz not null default now(), ready_at timestamptz,
 sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'), check((ready_at is null)=(sha256 is null))
);
create index edu_question_images_owner_created on public.edu_question_images(owner_id,created_at);
create index edu_question_images_enrollment on public.edu_question_images(enrollment_id);
create index edu_question_images_lesson on public.edu_question_images(lesson_id);
alter table public.edu_question_images enable row level security;
revoke all on public.edu_question_images from public,anon,authenticated;
grant select,insert,update on public.edu_question_images to service_role;
alter table public.edu_questions add column image_id uuid unique references public.edu_question_images(id);

create function public.edu_assert_question_upload(p_actor uuid,p_enrollment uuid,p_lesson uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.enrollments%rowtype; l public.curriculum_lessons%rowtype;
begin
 -- Match lesson/submission lock order, then serialize per-owner upload quotas.
 select * into l from public.curriculum_lessons where id=p_lesson for share;
 if not found or not l.is_published or l.archived_at is not null then raise exception 'QUESTION_FORBIDDEN'; end if;
 select * into e from public.enrollments where id=p_enrollment and user_id=p_actor for share;
 if not found or e.status<>'active' or e.revoked_at is not null or e.access_starts_at>now() or e.access_ends_at<=now() then raise exception 'QUESTION_FORBIDDEN'; end if;
 perform 1 from public.profiles where id=p_actor and status='active' for update;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
 perform 1 from public.curriculum_weeks where id=l.week_id and course_id=e.course_id and is_published and archived_at is null for share;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
end; $$;
create function public.edu_prepare_question_image(p_actor uuid,p_enrollment uuid,p_lesson uuid,p_request uuid,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_images%rowtype; mime text;
begin
 mime:=case p_spec->>'extension' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'gif' then 'image/gif' when 'webp' then 'image/webp' end;
 if p_request is null or p_spec is null or mime is null or (p_spec->>'contentType') is distinct from mime or (p_spec->>'kind') is distinct from 'image'
  or coalesce(length(p_spec->>'name'),0) not between 1 and 240 or coalesce((p_spec->>'size')::integer,0) not between 1 and 10485760 then raise exception 'QUESTION_INVALID'; end if;
 perform public.edu_assert_question_upload(p_actor,p_enrollment,p_lesson);
 select * into f from public.edu_question_images where id=p_request;
 if found then
  if f.owner_id<>p_actor or f.lesson_id<>p_lesson or f.enrollment_id<>p_enrollment or f.name is distinct from p_spec->>'name' or f.size is distinct from (p_spec->>'size')::integer or f.content_type<>mime or f.extension is distinct from p_spec->>'extension' then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 else
  if (select count(*) from public.edu_question_images where owner_id=p_actor and created_at>now()-interval '1 day')>=30 then raise exception 'QUESTION_UPLOAD_LIMIT'; end if;
  insert into public.edu_question_images(id,owner_id,enrollment_id,lesson_id,name,size,extension,content_type,path)
   values(p_request,p_actor,p_enrollment,p_lesson,p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'extension',mime,p_actor::text||'/'||p_request::text||'.'||(p_spec->>'extension')) returning * into f;
 end if;
 return to_jsonb(f);
end; $$;
create function public.edu_owned_question_image(p_actor uuid,p_image uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_images%rowtype;
begin
 select * into f from public.edu_question_images where id=p_image and owner_id=p_actor;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
 perform public.edu_assert_question_upload(p_actor,f.enrollment_id,f.lesson_id);
 return to_jsonb(f);
end; $$;
create function public.edu_complete_question_image(p_actor uuid,p_image uuid,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_images%rowtype;
begin
 perform public.edu_owned_question_image(p_actor,p_image);
 if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'QUESTION_INVALID'; end if;
 select * into f from public.edu_question_images where id=p_image for update;
 if f.sha256 is not null and f.sha256<>p_sha256 then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 update public.edu_question_images set sha256=p_sha256,ready_at=coalesce(ready_at,now()) where id=p_image returning * into f;
 return jsonb_build_object('id',f.id,'name',f.name,'size',f.size);
end; $$;
create function public.edu_guard_question_image()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.image_id is distinct from new.image_id then raise exception 'QUESTION_IMAGE_IMMUTABLE'; end if;
  -- Allow FK detachment when a lesson/enrollment is deleted; the private question
  -- and its image remain readable as history, without reassignment to another owner.
  if new.image_id is not null and (new.user_id is distinct from old.user_id or (new.lesson_id is not null and new.lesson_id is distinct from old.lesson_id) or (new.enrollment_id is not null and new.enrollment_id is distinct from old.enrollment_id)) then raise exception 'QUESTION_IMAGE_INVALID'; end if;
  return new;
 end if;
 if new.image_id is not null and not exists(select 1 from public.edu_question_images f where f.id=new.image_id and f.owner_id=new.user_id and f.enrollment_id=new.enrollment_id and f.lesson_id=new.lesson_id and f.ready_at is not null) then raise exception 'QUESTION_IMAGE_INVALID'; end if;
 return new;
end; $$;
create trigger edu_question_image_guard before insert or update of image_id,user_id,enrollment_id,lesson_id on public.edu_questions for each row execute function public.edu_guard_question_image();
create function public.edu_read_question_image(p_actor uuid,p_question uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; f public.edu_question_images%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question;
 if not found or (not public.edu_message_operator(p_actor) and (q.user_id<>p_actor or q.is_archived)) then raise exception 'QUESTION_NOT_FOUND'; end if;
 select * into f from public.edu_question_images where id=q.image_id and ready_at is not null;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 return to_jsonb(f);
end; $$;
create function public.edu_create_lesson_question_with_image(p_actor uuid,p_request uuid,p_enrollment uuid,p_lesson uuid,p_title text,p_content text,p_image uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.enrollments%rowtype; l public.curriculum_lessons%rowtype; w public.curriculum_weeks%rowtype;
  receipt public.edu_mutation_receipts%rowtype; intent text; v_result jsonb; context_label text;
begin
  if p_image is not null and coalesce(btrim(p_content),'')='' then p_content:='첨부 이미지에 대한 질문입니다.'; end if;
  perform public.edu_assert_question_upload(p_actor,p_enrollment,p_lesson);
  if p_request is null or length(btrim(p_title)) not between 1 and 200 or length(btrim(p_content)) not between 1 and 10000 or p_title is null or p_content is null then raise exception 'QUESTION_INVALID'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'QUESTION_FORBIDDEN'; end if;
  select * into e from public.enrollments where id=p_enrollment and user_id=p_actor for share;
  if not found or e.status<>'active' or e.revoked_at is not null or e.access_starts_at>now() or e.access_ends_at<=now() then raise exception 'QUESTION_FORBIDDEN'; end if;
  select * into l from public.curriculum_lessons where id=p_lesson and is_published and archived_at is null for share;
  if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
  select * into w from public.curriculum_weeks where id=l.week_id and course_id=e.course_id and is_published and archived_at is null for share;
  if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
  intent:=md5(jsonb_build_array(p_enrollment,p_lesson,btrim(p_title),btrim(p_content),p_image)::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,'edu_lesson_question_image',intent) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.target_table<>'edu_lesson_question_image' or receipt.fingerprint<>intent then raise exception 'QUESTION_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;
  if p_image is not null and exists(select 1 from public.edu_questions where image_id=p_image) then raise exception 'QUESTION_IMAGE_USED'; end if;
  select c.title || ' · ' || co.name || ' · ' || w.week_number || '주차 · ' || l.title into context_label
    from public.courses c join public.cohorts co on co.id=e.cohort_id where c.id=e.course_id;
  insert into public.edu_questions(user_id,course_id,enrollment_id,lesson_id,learning_context,title,content,image_id)
    values(p_actor,e.course_id,e.id,l.id,context_label,btrim(p_title),btrim(p_content),p_image) returning to_jsonb(edu_questions.*) into v_result;
  update public.edu_mutation_receipts r set result=v_result where r.actor_id=p_actor and r.request_id=p_request;
  return v_result;
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
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'authorName',author_name,'content',content,'createdAt',created_at) order by sequence) from visible),'[]'::jsonb),
  case when (select count(*) from page)>20 then (select min(sequence)::text from visible) else null end into answer_rows,next_cursor;
 return jsonb_build_object('question',jsonb_build_object('id',q.id,'title',q.title,'content',q.content,'learningContext',q.learning_context,'status',q.status,'resolved',q.is_resolved,'archived',q.is_archived,'headId',q.answer_head_id,'imageId',q.image_id),
  'answers',answer_rows,'nextCursor',next_cursor,'canAnswer',operator and not q.is_archived);
end; $$;

revoke all on function public.edu_assert_question_upload(uuid,uuid,uuid),public.edu_prepare_question_image(uuid,uuid,uuid,uuid,jsonb),public.edu_owned_question_image(uuid,uuid),public.edu_complete_question_image(uuid,uuid,text),public.edu_guard_question_image(),public.edu_read_question_image(uuid,uuid),public.edu_create_lesson_question_with_image(uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_assert_question_upload(uuid,uuid,uuid),public.edu_prepare_question_image(uuid,uuid,uuid,uuid,jsonb),public.edu_owned_question_image(uuid,uuid),public.edu_complete_question_image(uuid,uuid,text),public.edu_guard_question_image(),public.edu_read_question_image(uuid,uuid),public.edu_create_lesson_question_with_image(uuid,uuid,uuid,uuid,text,text,uuid) to service_role;
commit;
