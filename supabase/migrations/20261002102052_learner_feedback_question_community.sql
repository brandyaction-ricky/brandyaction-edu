begin;
-- Explicit visibility applies only to newly authored questions. Historical
-- private questions, attachments and followups are never republished.
alter table public.edu_questions
 add column visibility text not null default 'private' check(visibility in ('private','cohort')),
 add column shared_cohort_id uuid references public.cohorts(id) on delete set null;
create index edu_questions_cohort_feed on public.edu_questions(shared_cohort_id,created_at desc,id)
 where visibility='cohort' and not is_archived;

create function public.edu_create_visible_question(p_actor uuid,p_request uuid,p_enrollment uuid,p_lesson uuid,p_title text,p_content text,p_image uuid,p_category text,p_visibility text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt public.edu_mutation_receipts%rowtype; intent text; v_result jsonb; context_label text; course uuid;
begin
 perform public.edu_assert_question_upload(p_actor,p_enrollment,p_lesson);
 if p_request is null or p_title is null or length(btrim(p_title)) not between 1 and 200 or p_content is null or length(p_content)>10000
 or (btrim(p_content)='' and p_image is null) or p_category is null or p_category not in ('learning','general','payment','account') or p_visibility is null or p_visibility not in ('private','cohort')
 or (p_category<>'learning' and (p_lesson is not null or p_visibility='cohort')) or (p_visibility='cohort' and p_lesson is null) then raise exception 'QUESTION_INVALID'; end if;
 intent:=md5(jsonb_build_array(p_enrollment,p_lesson,p_title,p_content,p_image,p_category,p_visibility)::text);
 insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint) values(p_actor,p_request,'edu_visible_question',intent) on conflict do nothing;
 select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
 if receipt.target_table<>'edu_visible_question' or receipt.fingerprint<>intent then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 if receipt.result is not null then return receipt.result; end if;
 if p_image is not null and exists(select 1 from public.edu_questions where image_id=p_image) then raise exception 'QUESTION_IMAGE_USED'; end if;
 if (select count(*) from public.edu_questions where user_id=p_actor and created_at>now()-interval '1 hour')>=30 then raise exception 'QUESTION_RATE_LIMIT'; end if;
 if p_lesson is not null then
  select x.label into context_label from public.edu_question_contexts(p_actor) x where x.enrollment_id=p_enrollment and x.lesson_id=p_lesson;
  if context_label is null then raise exception 'QUESTION_FORBIDDEN'; end if;
  select course_id into course from public.enrollments where id=p_enrollment;
 end if;
 insert into public.edu_questions(user_id,course_id,enrollment_id,lesson_id,learning_context,title,content,image_id,category,sharing_requested,visibility,shared_cohort_id)
 values(p_actor,course,p_enrollment,p_lesson,context_label,btrim(p_title),case when btrim(p_content)='' then '첨부 이미지에 대한 질문입니다.' else btrim(p_content) end,p_image,p_category,false,p_visibility,case when p_visibility='cohort' then (select cohort_id from public.enrollments where id=p_enrollment) end)
 returning jsonb_build_object('id',id) into v_result;
 perform public.edu_apply_approved_question_answer(p_actor,(v_result->>'id')::uuid);
 update public.edu_mutation_receipts r set result=v_result where r.actor_id=p_actor and r.request_id=p_request;
 return v_result;
end; $$;

-- Peer access is evaluated against the viewer's current enrollment, cohort
-- publication and lesson gate on every read. RPCs are service-role only.
create function public.edu_can_read_cohort_question(p_actor uuid,p_question uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.edu_questions q
  join public.edu_question_contexts(p_actor) c on c.lesson_id=q.lesson_id
  join public.enrollments e on e.id=c.enrollment_id and e.cohort_id=q.shared_cohort_id
  where q.id=p_question and q.visibility='cohort' and q.category='learning' and not q.is_archived
 );
$$;

create function public.edu_read_cohort_questions(p_actor uuid,p_query text default '',p_enrollment uuid default null,p_lesson uuid default null,p_page integer default 0,p_include_own boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_page is null or p_page<0 or p_page>10000 or length(p_query)>500 or (p_enrollment is null)<>(p_lesson is null) then raise exception 'QUESTION_INVALID'; end if;
 if p_lesson is not null then perform public.edu_assert_question_access(p_actor,p_lesson,p_enrollment); end if;
 with contexts as materialized (select c.*,e.cohort_id from public.edu_question_contexts(p_actor) c join public.enrollments e on e.id=c.enrollment_id),
 page as (
  select q.* from public.edu_questions q where not q.is_archived
  and (p_lesson is null or q.lesson_id=p_lesson)
  and (coalesce(p_query,'')='' or strpos(lower(q.title||' '||q.content),lower(p_query))>0)
  and ((q.visibility='cohort' and q.category='learning' and exists(select 1 from contexts c where c.lesson_id=q.lesson_id and c.cohort_id=q.shared_cohort_id and (p_enrollment is null or c.enrollment_id=p_enrollment)))
    or (p_include_own and q.user_id=p_actor and (p_enrollment is null or q.enrollment_id=p_enrollment)))
  order by q.created_at desc,q.id limit 21 offset p_page*20
 ), visible as (select * from page order by created_at desc,id limit 20)
 select jsonb_build_object('questions',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'title',title,'content',content,'answer',answer,'status',status,'is_resolved',is_resolved,
  'created_at',created_at,'learning_context',learning_context,'image_id',image_id,'visibility',visibility,'mine',user_id=p_actor
 ) order by created_at desc,id) from visible),'[]'::jsonb),'hasMore',(select count(*) from page)>20) into result;
 return result;
end; $$;

create or replace function public.edu_read_question_thread(p_actor uuid,p_question uuid,p_before bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; operator boolean; answer_rows jsonb; next_cursor text;
begin
 perform public.edu_assert_message_actor(p_actor);
 operator:=public.edu_message_operator(p_actor);
 select * into q from public.edu_questions where id=p_question;
 if not found or (not operator and (q.is_archived or (q.user_id<>p_actor and not public.edu_can_read_cohort_question(p_actor,q.id)))) then raise exception 'QUESTION_NOT_FOUND'; end if;
 if p_before<1 then raise exception 'QUESTION_INVALID'; end if;
 with page as (
  select * from public.edu_question_answers where question_id=q.id and (p_before is null or sequence<p_before) order by sequence desc limit 21
 ), visible as (select * from page order by sequence desc limit 20)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'authorName',case when source='learner' and not operator and q.user_id<>p_actor then '수강생' else author_name end,'source',source,'content',content,'createdAt',created_at) order by sequence) from visible),'[]'::jsonb),
  case when (select count(*) from page)>20 then (select min(sequence)::text from visible) else null end into answer_rows,next_cursor;
 return jsonb_build_object('question',jsonb_build_object('id',q.id,'title',q.title,'content',q.content,'learningContext',q.learning_context,'status',q.status,'resolved',q.is_resolved,'archived',q.is_archived,'headId',q.answer_head_id,'imageId',q.image_id,'visibility',q.visibility),
  'answers',answer_rows,'nextCursor',next_cursor,'canAnswer',operator and not q.is_archived,
  'canFollowUp',q.user_id=p_actor and not q.is_archived);
end; $$;

create or replace function public.edu_read_question_image(p_actor uuid,p_question uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; f public.edu_question_images%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question;
 if not found or (not public.edu_message_operator(p_actor) and (q.is_archived or (q.user_id<>p_actor and not public.edu_can_read_cohort_question(p_actor,q.id)))) then raise exception 'QUESTION_NOT_FOUND'; end if;
 select * into f from public.edu_question_images where id=q.image_id and ready_at is not null;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 return to_jsonb(f);
end; $$;

revoke all on function public.edu_create_visible_question(uuid,uuid,uuid,uuid,text,text,uuid,text,text),public.edu_can_read_cohort_question(uuid,uuid),public.edu_read_cohort_questions(uuid,text,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.edu_create_visible_question(uuid,uuid,uuid,uuid,text,text,uuid,text,text),public.edu_can_read_cohort_question(uuid,uuid),public.edu_read_cohort_questions(uuid,text,uuid,uuid,integer,boolean) to service_role;
commit;
