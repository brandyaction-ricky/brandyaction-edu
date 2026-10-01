begin;
-- Only question operations can bypass the old cohort progression lock.
-- The existing access check first validates owner, active entitlement and publication.
create function public.edu_assert_question_access(p_actor uuid,p_lesson uuid,p_enrollment uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
 begin
  perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 exception when raise_exception then
  if sqlerrm <> 'BLOCK_LESSON_LOCKED' or not public.edu_is_graduate_enrollment(p_enrollment) then raise; end if;
 end;
end; $$;

-- edu_question_contexts retains its existing ownership and sharing rules.
create or replace function public.edu_question_contexts(p_actor uuid)
returns table(enrollment_id uuid,lesson_id uuid,label text,recent boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_message_actor(p_actor);
 return query select e.id,l.id,c.title||' · '||co.name||' · '||w.week_number||'주차 · '||l.title,p.updated_at is not null
 from public.enrollments e join public.courses c on c.id=e.course_id and c.archived_at is null
 join public.cohorts co on co.id=e.cohort_id
 join public.curriculum_weeks w on w.course_id=c.id and w.is_published and w.archived_at is null
 join public.curriculum_lessons l on l.week_id=w.id and l.is_published and l.archived_at is null
 left join public.lesson_progress p on p.enrollment_id=e.id and p.lesson_id=l.id
 where e.user_id=p_actor and e.status='active' and e.revoked_at is null and e.access_starts_at<=now()
 and (e.access_ends_at is null or e.access_ends_at>now())
 and (public.edu_is_graduate_enrollment(e.id) or (public.edu_lesson_progression_gate(e.id,l.id)->>'isUnlocked')::boolean)
 order by p.updated_at desc nulls last,c.title,co.name,w.week_number,l.day_number,l.id;
end; $$;

-- edu_assert_question_upload retains its existing ownership and sharing rules.
create or replace function public.edu_assert_question_upload(p_actor uuid,p_enrollment uuid,p_lesson uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if (p_enrollment is null)<>(p_lesson is null) then raise exception 'QUESTION_FORBIDDEN'; end if;
 if p_lesson is not null then
  perform 1 from public.curriculum_lessons where id=p_lesson for share;
  perform 1 from public.enrollments where id=p_enrollment for share;
  perform 1 from public.curriculum_weeks where id=(select week_id from public.curriculum_lessons where id=p_lesson) for share;
  perform 1 from public.courses where id=(select course_id from public.enrollments where id=p_enrollment) for share;
  perform public.edu_assert_question_access(p_actor,p_lesson,p_enrollment);
 end if;
 perform 1 from public.profiles where id=p_actor and status='active' for update;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
end; $$;

-- edu_read_question_thread retains its existing ownership and sharing rules.
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
  'answers',answer_rows,'nextCursor',next_cursor,'canAnswer',operator and not q.is_archived,
  'canFollowUp',q.user_id=p_actor and not q.is_archived);
end; $$;

-- edu_search_shared_answers retains its existing ownership and sharing rules.
create or replace function public.edu_search_shared_answers(p_actor uuid,p_query text,p_enrollment uuid default null,p_lesson uuid default null,p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; tokens text[]; cap integer;
begin
 perform public.edu_assert_message_actor(p_actor);
 if length(p_query)>1000 or p_page<0 or p_page>10000 or (p_enrollment is null)<>(p_lesson is null) then raise exception 'QUESTION_INVALID'; end if;
 if p_lesson is not null then perform public.edu_assert_question_access(p_actor,p_lesson,p_enrollment); end if;
 select array_agg(t) into tokens from (select distinct lower(t) t from regexp_split_to_table(btrim(left(coalesce(p_query,''),500)),E'\\s+') t where length(t)>=2 limit 12) words;
 cap:=case when tokens is null then 20 else 3 end;
 with contexts as materialized (select * from public.edu_question_contexts(p_actor)), matches as (
  select distinct on (a.id) a.id,a.title,a.answer,c.label,c.lesson_id,c.enrollment_id,a.updated_at,
   (select count(*) from unnest(tokens) t where strpos(lower(a.title||' '||a.answer),t)>0) score
  from public.edu_shared_answers a join public.edu_questions q on q.id=a.source_question_id and q.sharing_requested and q.category='learning' and not q.is_archived
  join contexts c on c.lesson_id=a.lesson_id and c.lesson_id=q.lesson_id
  join public.enrollments viewer on viewer.id=c.enrollment_id and viewer.cohort_id=a.cohort_id
  where a.published and a.lesson_revision is not distinct from (select revision from public.edu_lesson_block_heads where lesson_id=a.lesson_id) and (p_lesson is null or (c.lesson_id=p_lesson and c.enrollment_id=p_enrollment)) order by a.id,c.enrollment_id
 ), page as (select * from matches where tokens is null or score>0 order by score desc,updated_at desc,id limit cap+1 offset p_page*cap), visible as (select * from page limit cap)
 select jsonb_build_object('answers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'answer',answer,'context',label,'lessonId',lesson_id,'enrollmentId',enrollment_id)) from visible),'[]'::jsonb),'hasMore',(select count(*) from page)>cap) into result;
 return result;
end; $$;

-- edu_apply_approved_question_answer retains its existing ownership and sharing rules.
create or replace function public.edu_apply_approved_question_answer(p_actor uuid,p_question uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; matches uuid[]; a public.edu_shared_answers%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question and user_id=p_actor and not is_archived for update;
 if not found or q.category<>'learning' or q.lesson_id is null or q.enrollment_id is null or q.image_id is not null or q.answer_head_id is not null or q.is_resolved then return false; end if;
 perform public.edu_assert_question_access(p_actor,q.lesson_id,q.enrollment_id);
 select array_agg(f.id) into matches from public.edu_shared_answers f
 join public.edu_questions source on source.id=f.source_question_id and source.sharing_requested and not source.is_archived and source.category='learning'
 where f.published and f.lesson_id=q.lesson_id and f.cohort_id=(select cohort_id from public.enrollments where id=q.enrollment_id)
 and f.lesson_revision is not distinct from (select revision from public.edu_lesson_block_heads where lesson_id=q.lesson_id)
 and lower(regexp_replace(btrim(f.title),'[[:space:]]+',' ','g'))=lower(regexp_replace(btrim(q.content),'[[:space:]]+',' ','g'));
 if coalesce(array_length(matches,1),0)<>1 then return false; end if;
 select * into a from public.edu_shared_answers where id=matches[1] for share;
 insert into public.edu_question_answers(question_id,author_name,source,expected_head,content)
 values(q.id,'운영자 승인 답변 · 자동 안내','faq',null,a.answer);
 return true;
end; $$;

-- edu_question_assist retains its existing ownership and sharing rules.
create or replace function public.edu_question_assist(p_actor uuid,p_question uuid,p_request uuid,p_draft text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; job public.edu_question_assist_jobs%rowtype;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select * into q from public.edu_questions where id=p_question and not is_archived for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 if q.category<>'learning' or q.enrollment_id is null or q.lesson_id is null then raise exception 'QUESTION_ASSIST_HUMAN'; end if;
 perform public.edu_assert_question_access(q.user_id,q.lesson_id,q.enrollment_id);
 if p_request is null or (p_draft is not null and length(btrim(p_draft)) not between 1 and 10000) then raise exception 'QUESTION_INVALID'; end if;
 select * into job from public.edu_question_assist_jobs where id=p_request for update;
 if found then
  if job.question_id<>q.id then raise exception 'QUESTION_REQUEST_REUSED'; end if;
  if job.expected_head is distinct from q.answer_head_id or job.lesson_revision is distinct from (select revision from public.edu_lesson_block_heads where lesson_id=q.lesson_id) or job.question_fingerprint<>md5(jsonb_build_array(q.title,q.content,q.lesson_id,q.enrollment_id,q.category)::text) then raise exception 'QUESTION_CHANGED'; end if;
  if p_draft is not null then
   if job.draft is not null and job.draft<>p_draft then raise exception 'QUESTION_REQUEST_REUSED'; end if;
   update public.edu_question_assist_jobs set draft=p_draft,status='draft' where id=job.id returning * into job;
  end if;
 elsif p_draft is not null then raise exception 'QUESTION_NOT_FOUND';
 else
  insert into public.edu_question_assist_jobs(id,question_id,requested_by,expected_head,lesson_revision,question_fingerprint) values(p_request,q.id,p_actor,q.answer_head_id,(select revision from public.edu_lesson_block_heads where lesson_id=q.lesson_id),md5(jsonb_build_array(q.title,q.content,q.lesson_id,q.enrollment_id,q.category)::text)) returning * into job;
 end if;
 return jsonb_build_object('id',job.id,'status',job.status,'draft',job.draft,'expectedHeadId',job.expected_head,'lessonRevision',job.lesson_revision);
end; $$;

-- edu_answer_from_assist retains its existing ownership and sharing rules.
create or replace function public.edu_answer_from_assist(p_actor uuid,p_question uuid,p_job uuid,p_request uuid,p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; job public.edu_question_assist_jobs%rowtype; a public.edu_question_answers%rowtype;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_request is null or p_content is null or length(btrim(p_content)) not between 1 and 10000 then raise exception 'QUESTION_INVALID'; end if;
 select * into q from public.edu_questions where id=p_question and not is_archived for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 select * into job from public.edu_question_assist_jobs where id=p_job and question_id=q.id for update;
 if not found or job.draft is null then raise exception 'QUESTION_NOT_FOUND'; end if;
 select * into a from public.edu_question_answers where id=p_request;
 if found then
  if a.source<>'aside' or a.question_id<>q.id or a.actor_id is distinct from p_actor or a.content<>p_content or job.answer_id is distinct from a.id then raise exception 'QUESTION_REQUEST_REUSED'; end if;
  return jsonb_build_object('id',a.id,'questionId',q.id);
 end if;
 if job.expected_head is distinct from q.answer_head_id or job.lesson_revision is distinct from (select revision from public.edu_lesson_block_heads where lesson_id=q.lesson_id) or job.question_fingerprint<>md5(jsonb_build_array(q.title,q.content,q.lesson_id,q.enrollment_id,q.category)::text) or job.status<>'draft' then raise exception 'QUESTION_CHANGED'; end if;
 perform public.edu_assert_question_access(q.user_id,q.lesson_id,q.enrollment_id);
 insert into public.edu_question_answers(id,question_id,actor_id,author_name,source,expected_head,content)
 values(p_request,q.id,p_actor,'운영자 · 어사이드 초안 검토','aside',q.answer_head_id,p_content);
 update public.edu_question_assist_jobs set status='used',answer_id=p_request where id=job.id;
 return jsonb_build_object('id',p_request,'questionId',q.id);
end; $$;

revoke all on function public.edu_assert_question_access(uuid,uuid,uuid), public.edu_question_contexts(uuid), public.edu_assert_question_upload(uuid,uuid,uuid), public.edu_read_question_thread(uuid,uuid,bigint), public.edu_search_shared_answers(uuid,text,uuid,uuid,integer), public.edu_apply_approved_question_answer(uuid,uuid), public.edu_question_assist(uuid,uuid,uuid,text), public.edu_answer_from_assist(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_assert_question_access(uuid,uuid,uuid), public.edu_question_contexts(uuid), public.edu_assert_question_upload(uuid,uuid,uuid), public.edu_read_question_thread(uuid,uuid,bigint), public.edu_search_shared_answers(uuid,text,uuid,uuid,integer), public.edu_apply_approved_question_answer(uuid,uuid), public.edu_question_assist(uuid,uuid,uuid,text), public.edu_answer_from_assist(uuid,uuid,uuid,uuid,text) to service_role;
commit;
