begin;
-- Private questions stay private. Sharing is an explicit request for an operator
-- to publish a separate, edited answer; attachments and threads never enter it.
alter table public.edu_questions add column sharing_requested boolean not null default false,
 add column category text not null default 'learning' check(category in ('learning','general','payment','account'));

create function public.edu_question_contexts(p_actor uuid)
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
 and (public.edu_lesson_progression_gate(e.id,l.id)->>'isUnlocked')::boolean
 order by p.updated_at desc nulls last,c.title,co.name,w.week_number,l.day_number,l.id;
end; $$;

-- Reuse the private image pipeline for general questions too. Null is accepted
-- only as a pair; scoped uploads retain learner ownership and progression checks.
create or replace function public.edu_assert_question_upload(p_actor uuid,p_enrollment uuid,p_lesson uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if (p_enrollment is null)<>(p_lesson is null) then raise exception 'QUESTION_FORBIDDEN'; end if;
 if p_lesson is not null then
  perform 1 from public.curriculum_lessons where id=p_lesson for share;
  perform 1 from public.enrollments where id=p_enrollment for share;
  perform 1 from public.curriculum_weeks where id=(select week_id from public.curriculum_lessons where id=p_lesson) for share;
  perform 1 from public.courses where id=(select course_id from public.enrollments where id=p_enrollment) for share;
  perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
 end if;
 perform 1 from public.profiles where id=p_actor and status='active' for update;
 if not found then raise exception 'QUESTION_FORBIDDEN'; end if;
end; $$;

create or replace function public.edu_prepare_question_image(p_actor uuid,p_enrollment uuid,p_lesson uuid,p_request uuid,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_question_images%rowtype; mime text;
begin
 mime:=case p_spec->>'extension' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'gif' then 'image/gif' when 'webp' then 'image/webp' end;
 if p_request is null or p_spec is null or mime is null or (p_spec->>'contentType') is distinct from mime or (p_spec->>'kind') is distinct from 'image'
  or coalesce(length(p_spec->>'name'),0) not between 1 and 240 or coalesce((p_spec->>'size')::integer,0) not between 1 and 10485760 then raise exception 'QUESTION_INVALID'; end if;
 perform public.edu_assert_question_upload(p_actor,p_enrollment,p_lesson);
 select * into f from public.edu_question_images where id=p_request;
 if found then
  if f.owner_id<>p_actor or f.lesson_id is distinct from p_lesson or f.enrollment_id is distinct from p_enrollment or f.name is distinct from p_spec->>'name' or f.size is distinct from (p_spec->>'size')::integer or f.content_type<>mime or f.extension is distinct from p_spec->>'extension' then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 else
  if (select count(*) from public.edu_question_images where owner_id=p_actor and created_at>now()-interval '1 day')>=30 then raise exception 'QUESTION_UPLOAD_LIMIT'; end if;
  insert into public.edu_question_images(id,owner_id,enrollment_id,lesson_id,name,size,extension,content_type,path)
   values(p_request,p_actor,p_enrollment,p_lesson,p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'extension',mime,p_actor::text||'/'||p_request::text||'.'||(p_spec->>'extension')) returning * into f;
 end if;
 return to_jsonb(f);
end; $$;

create or replace function public.edu_guard_question_image()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.image_id is distinct from new.image_id then raise exception 'QUESTION_IMAGE_IMMUTABLE'; end if;
  -- Allow FK detachment when a lesson/enrollment is deleted; the private question
  -- and its image remain readable as history, without reassignment to another owner.
  if new.image_id is not null and (new.user_id is distinct from old.user_id or (new.lesson_id is not null and new.lesson_id is distinct from old.lesson_id) or (new.enrollment_id is not null and new.enrollment_id is distinct from old.enrollment_id)) then raise exception 'QUESTION_IMAGE_INVALID'; end if;
  return new;
 end if;
 if new.image_id is not null and not exists(select 1 from public.edu_question_images f where f.id=new.image_id and f.owner_id=new.user_id and f.enrollment_id is not distinct from new.enrollment_id and f.lesson_id is not distinct from new.lesson_id and f.ready_at is not null) then raise exception 'QUESTION_IMAGE_INVALID'; end if;
 return new;
end; $$;

create function public.edu_create_hub_question(p_actor uuid,p_request uuid,p_enrollment uuid,p_lesson uuid,p_title text,p_content text,p_image uuid,p_category text,p_share boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt public.edu_mutation_receipts%rowtype; intent text; v_result jsonb; context_label text; course uuid;
begin
 perform public.edu_assert_question_upload(p_actor,p_enrollment,p_lesson);
 if p_request is null or p_title is null or length(btrim(p_title)) not between 1 and 200 or p_content is null or length(p_content)>10000
 or (btrim(p_content)='' and p_image is null) or p_category is null or p_category not in ('learning','general','payment','account') or p_share is null
 or (p_category<>'learning' and (p_lesson is not null or p_share)) or (p_share and p_lesson is null) then raise exception 'QUESTION_INVALID'; end if;
 intent:=md5(jsonb_build_array(p_enrollment,p_lesson,p_title,p_content,p_image,p_category,p_share)::text);
 insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint) values(p_actor,p_request,'edu_hub_question',intent) on conflict do nothing;
 select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
 if receipt.target_table<>'edu_hub_question' or receipt.fingerprint<>intent then raise exception 'QUESTION_REQUEST_REUSED'; end if;
 if receipt.result is not null then return receipt.result; end if;
 if p_image is not null and exists(select 1 from public.edu_questions where image_id=p_image) then raise exception 'QUESTION_IMAGE_USED'; end if;
 if (select count(*) from public.edu_questions where user_id=p_actor and created_at>now()-interval '1 hour')>=30 then raise exception 'QUESTION_RATE_LIMIT'; end if;
 if p_lesson is not null then
  select x.label into context_label from public.edu_question_contexts(p_actor) x where x.enrollment_id=p_enrollment and x.lesson_id=p_lesson;
  if context_label is null then raise exception 'QUESTION_FORBIDDEN'; end if;
  select course_id into course from public.enrollments where id=p_enrollment;
 end if;
 insert into public.edu_questions(user_id,course_id,enrollment_id,lesson_id,learning_context,title,content,image_id,category,sharing_requested)
 values(p_actor,course,p_enrollment,p_lesson,context_label,btrim(p_title),case when btrim(p_content)='' then '첨부 이미지에 대한 질문입니다.' else btrim(p_content) end,p_image,p_category,p_share)
 returning jsonb_build_object('id',id) into v_result;
 perform public.edu_apply_approved_question_answer(p_actor,(v_result->>'id')::uuid);
 update public.edu_mutation_receipts r set result=v_result where r.actor_id=p_actor and r.request_id=p_request;
 return v_result;
end; $$;

create table public.edu_shared_answers(
 id uuid primary key default gen_random_uuid(), source_question_id uuid not null unique references public.edu_questions(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 200), answer text not null check(length(btrim(answer)) between 1 and 10000),
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade, lesson_revision uuid,
 approved_by uuid not null references public.profiles(id), published boolean not null default false,
 updated_at timestamptz not null default now()
);
create index edu_shared_answers_cohort on public.edu_shared_answers(cohort_id);
create index edu_shared_answers_lesson on public.edu_shared_answers(lesson_id);
create index edu_shared_answers_approver on public.edu_shared_answers(approved_by);
alter table public.edu_shared_answers enable row level security;
revoke all on public.edu_shared_answers from public,anon,authenticated;
grant select,insert,update on public.edu_shared_answers to service_role;

create function public.edu_publish_shared_answer(p_actor uuid,p_question uuid,p_title text,p_answer text,p_publish boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; result uuid;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select * into q from public.edu_questions where id=p_question for update;
 if not found or q.is_archived or not q.sharing_requested or q.lesson_id is null or q.enrollment_id is null or q.category<>'learning' then raise exception 'QUESTION_SHARE_FORBIDDEN'; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_answer is null or length(btrim(p_answer)) not between 1 and 10000 or p_publish is null then raise exception 'QUESTION_INVALID'; end if;
 insert into public.edu_shared_answers(source_question_id,title,answer,approved_by,published,cohort_id,lesson_id,lesson_revision)
 values(q.id,btrim(p_title),btrim(p_answer),p_actor,p_publish,(select cohort_id from public.enrollments where id=q.enrollment_id),q.lesson_id,(select revision from public.edu_lesson_block_heads where lesson_id=q.lesson_id))
 on conflict(source_question_id) do update set title=excluded.title,answer=excluded.answer,approved_by=excluded.approved_by,published=excluded.published,cohort_id=excluded.cohort_id,lesson_id=excluded.lesson_id,lesson_revision=excluded.lesson_revision,updated_at=now() returning id into result;
 return jsonb_build_object('id',result,'published',p_publish);
end; $$;

-- Join to the source only on the server. Return no author, original question,
-- private attachments, followups, or source ID. Access is checked on EVERY read.
create function public.edu_search_shared_answers(p_actor uuid,p_query text,p_enrollment uuid default null,p_lesson uuid default null,p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; tokens text[]; cap integer;
begin
 perform public.edu_assert_message_actor(p_actor);
 if length(p_query)>1000 or p_page<0 or p_page>10000 or (p_enrollment is null)<>(p_lesson is null) then raise exception 'QUESTION_INVALID'; end if;
 if p_lesson is not null then perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment); end if;
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

create function public.edu_finish_own_question(p_actor uuid,p_question uuid,p_expected_head uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question and user_id=p_actor and not is_archived for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 if q.answer_head_id is distinct from p_expected_head then raise exception 'QUESTION_CHANGED'; end if;
 if q.status<>'answered' then raise exception 'QUESTION_INVALID'; end if;
 update public.edu_questions set is_resolved=true,updated_at=now() where id=q.id;
 return jsonb_build_object('id',q.id,'resolved',true);
end; $$;

-- Aside handoff is an operator-requested, durable draft. It cannot send an answer.
create table public.edu_question_assist_jobs(
 id uuid primary key, question_id uuid not null references public.edu_questions(id) on delete cascade,
 requested_by uuid not null references public.profiles(id), expected_head uuid, lesson_revision uuid, question_fingerprint text not null,
 status text not null default 'waiting' check(status in ('waiting','draft','used')),
 draft text check(length(draft) between 1 and 10000), created_at timestamptz not null default now(),
 check((status='waiting')=(draft is null))
);
create index edu_question_assist_question on public.edu_question_assist_jobs(question_id,created_at desc);
create index edu_question_assist_requester on public.edu_question_assist_jobs(requested_by);
alter table public.edu_question_assist_jobs enable row level security;
revoke all on public.edu_question_assist_jobs from public,anon,authenticated;
grant select,insert,update on public.edu_question_assist_jobs to service_role;
create function public.edu_question_assist(p_actor uuid,p_question uuid,p_request uuid,p_draft text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; job public.edu_question_assist_jobs%rowtype;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select * into q from public.edu_questions where id=p_question and not is_archived for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 if q.category<>'learning' or q.enrollment_id is null or q.lesson_id is null then raise exception 'QUESTION_ASSIST_HUMAN'; end if;
 perform public.edu_assert_block_access(q.user_id,q.lesson_id,q.enrollment_id);
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

revoke all on function public.edu_question_contexts(uuid),public.edu_create_hub_question(uuid,uuid,uuid,uuid,text,text,uuid,text,boolean),public.edu_publish_shared_answer(uuid,uuid,text,text,boolean),public.edu_search_shared_answers(uuid,text,uuid,uuid,integer),public.edu_finish_own_question(uuid,uuid,uuid),public.edu_question_assist(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_question_contexts(uuid),public.edu_create_hub_question(uuid,uuid,uuid,uuid,text,text,uuid,text,boolean),public.edu_publish_shared_answer(uuid,uuid,text,text,boolean),public.edu_search_shared_answers(uuid,text,uuid,uuid,integer),public.edu_finish_own_question(uuid,uuid,uuid),public.edu_question_assist(uuid,uuid,uuid,text) to service_role;

alter table public.edu_question_answers drop constraint edu_question_answers_source_check;
alter table public.edu_question_answers add constraint edu_question_answers_source_check check(source in ('operator','legacy','learner','faq','aside'));
create function public.edu_apply_approved_question_answer(p_actor uuid,p_question uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; matches uuid[]; a public.edu_shared_answers%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question and user_id=p_actor and not is_archived for update;
 if not found or q.category<>'learning' or q.lesson_id is null or q.enrollment_id is null or q.image_id is not null or q.answer_head_id is not null or q.is_resolved then return false; end if;
 perform public.edu_assert_block_access(p_actor,q.lesson_id,q.enrollment_id);
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

alter table public.edu_question_assist_jobs add column answer_id uuid references public.edu_question_answers(id);
create index edu_question_assist_answer on public.edu_question_assist_jobs(answer_id);
create function public.edu_answer_from_assist(p_actor uuid,p_question uuid,p_job uuid,p_request uuid,p_content text)
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
 perform public.edu_assert_block_access(q.user_id,q.lesson_id,q.enrollment_id);
 insert into public.edu_question_answers(id,question_id,actor_id,author_name,source,expected_head,content)
 values(p_request,q.id,p_actor,'운영자 · 어사이드 초안 검토','aside',q.answer_head_id,p_content);
 update public.edu_question_assist_jobs set status='used',answer_id=p_request where id=job.id;
 return jsonb_build_object('id',p_request,'questionId',q.id);
end; $$;
revoke all on function public.edu_apply_approved_question_answer(uuid,uuid),public.edu_answer_from_assist(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_apply_approved_question_answer(uuid,uuid),public.edu_answer_from_assist(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function edu_private.learning_notice(p_user uuid,p_kind text,p_source text,p_content text,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_user and status='active') then return; end if;
 if p_path not in ('/my/messages','/my/questions','/my/missions','/admin/questions','/admin/reviews','/admin/reviews?tab=blocks','/admin/reviews?tab=missions') and
   p_path !~ '^/my/questions[?]question=[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' and
   p_path !~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then raise exception 'MESSAGE_INVALID'; end if;
 if exists(select 1 from public.edu_learning_notice_control where singleton and enabled) then
  insert into public.edu_member_messages(recipient_id,content,is_notice,notice_source,target_path)
   values(p_user,p_content,true,p_kind||':'||p_source,p_path)
   on conflict(recipient_id,notice_source) where is_notice do nothing;
 end if;
 perform edu_private.enqueue_push(p_user,p_kind,p_source,p_path);
end; $$;
alter table public.edu_push_events drop constraint edu_push_events_path_check;
alter table public.edu_push_events add constraint edu_push_events_path_check check(path in ('/my/messages','/my/questions','/my/missions','/admin/questions','/admin/reviews','/admin/reviews?tab=blocks','/admin/reviews?tab=missions') or path ~ '^/my/questions[?]question=[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or path ~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$');
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
  perform edu_private.learning_notice(q.user_id,'answer',new.id::text,'[질문함 답변]'||E'\n\nQ. '||q.content||E'\n\nA. '||new.content,'/my/questions?question='||q.id::text);
 end if;
 return new;
end; $$;
commit;
