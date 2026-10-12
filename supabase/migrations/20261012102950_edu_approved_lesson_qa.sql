begin;
create table public.edu_lesson_qa_plans (
 id uuid primary key,
 lesson_id uuid not null references public.curriculum_lessons(id),
 question_id uuid not null references public.edu_questions(id) on delete cascade,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 question_stamp text not null, public_stamp text not null, cohort_stamp text not null,
 author_head uuid, expected_answer uuid,
 anchor_block text not null, anchor_node integer not null,
 title text not null check(length(title) between 1 and 200),
 answer text not null check(length(answer) between 1 and 10000),
 payload jsonb not null check(octet_length(payload::text)<=4000000),
 answer_id uuid not null default gen_random_uuid(),
 author_revision uuid not null default gen_random_uuid(),
 publication_id uuid not null default gen_random_uuid(),
 digest text not null,
 applied_at timestamptz, result jsonb
);
create index edu_lesson_qa_question on public.edu_lesson_qa_plans(question_id,created_at desc);
create unique index edu_lesson_qa_once on public.edu_lesson_qa_plans(lesson_id,question_id) where applied_at is not null;
alter table public.edu_lesson_qa_plans enable row level security;
revoke all on public.edu_lesson_qa_plans from public,anon,authenticated;
grant select,insert on public.edu_lesson_qa_plans to service_role;
grant update(applied_at,result) on public.edu_lesson_qa_plans to service_role;

create function public.edu_read_lesson_qa(p_actor uuid,p_question uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; snap jsonb; h public.edu_lesson_author_heads%rowtype; scope jsonb;
begin
 if public.mission_operator_allowed(p_actor,'products') is not true or public.mission_operator_allowed(p_actor,'members') is not true then raise exception 'QA_FORBIDDEN'; end if;
 select * into q from public.edu_questions where id=p_question and not is_archived and deleted_at is null;
 if not found or q.lesson_id is null then raise exception 'QA_NOT_FOUND'; end if;
 if not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=q.lesson_id and w.course_id=q.course_id and l.is_published and w.is_published and l.archived_at is null and w.archived_at is null) then raise exception 'QA_NOT_FOUND'; end if;
 snap:=public.edu_lesson_author_snapshot(p_actor,q.lesson_id);
 select * into h from public.edu_lesson_author_heads where lesson_id=q.lesson_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]'::jsonb) into scope from public.cohorts where course_id=q.course_id;
 return jsonb_build_object('lessonId',q.lesson_id,'questionStamp',md5(to_jsonb(q)::text),'publicStamp',snap->>'stamp','authorHead',h.revision,'draftPending',h.revision is distinct from h.published_revision,'payload',snap->'payload',
 'cohorts',scope,'cohortStamp',md5(scope::text),
 'applied',exists(select 1 from public.edu_lesson_qa_plans where lesson_id=q.lesson_id and question_id=q.id and applied_at is not null));
end; $$;

create function public.edu_prepare_lesson_qa(p_actor uuid,p_question uuid,p_request uuid,p_question_stamp text,p_public_stamp text,p_cohort_stamp text,p_author_head uuid,p_block text,p_node integer,p_title text,p_answer text) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare source jsonb; payload jsonb; blocks jsonb; chosen jsonb; body jsonb; nodes jsonb; extra jsonb; content text; plan public.edu_lesson_qa_plans%rowtype; course uuid; lesson uuid;
begin
 if p_request is null or p_title is null or p_answer is null or length(trim(p_title)) not between 1 and 200 or length(trim(p_answer)) not between 1 and 10000 or p_node is null then raise exception 'QA_INVALID'; end if;
 source:=public.edu_read_lesson_qa(p_actor,p_question); lesson:=(source->>'lessonId')::uuid;
 select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=lesson;
 perform 1 from public.courses where id=course for update;
 perform pg_advisory_xact_lock(hashtextextended(course::text,261029));
 perform 1 from public.curriculum_lessons where id=lesson for update;
 perform 1 from public.edu_questions where id=p_question for update;
 source:=public.edu_read_lesson_qa(p_actor,p_question);
 select * into plan from public.edu_lesson_qa_plans where id=p_request;
 if found then
  if plan.created_by<>p_actor or plan.question_id<>p_question or plan.question_stamp<>p_question_stamp or plan.public_stamp<>p_public_stamp or plan.cohort_stamp<>p_cohort_stamp or plan.author_head is distinct from p_author_head or plan.anchor_block<>p_block or plan.anchor_node<>p_node or plan.title<>p_title or plan.answer<>p_answer then raise exception 'QA_CHANGED'; end if;
  return jsonb_build_object('id',plan.id,'digest',plan.digest,'title',plan.title,'answer',plan.answer,'applied',plan.applied_at is not null);
 end if;
 if source->>'questionStamp' is distinct from p_question_stamp or source->>'publicStamp' is distinct from p_public_stamp or source->>'cohortStamp' is distinct from p_cohort_stamp or (source->>'authorHead')::uuid is distinct from p_author_head then raise exception 'QA_CHANGED'; end if;
 if (source->>'draftPending')::boolean then raise exception 'QA_DRAFT_PENDING'; end if;
 if (source->>'applied')::boolean then raise exception 'QA_DUPLICATE'; end if;
 payload:=source->'payload'; blocks:=payload->'blocks'->'document'->'blocks';
 if payload->'blocks'->>'active'<>'true' then raise exception 'QA_INVALID'; end if;
 select b into chosen from jsonb_array_elements(blocks) b where b->>'id'=p_block and b->>'type' in ('text','heading','subheading');
 if chosen is null then raise exception 'QA_ANCHOR_CHANGED'; end if;
 extra:=jsonb_build_array(jsonb_build_object('type','heading','attrs',jsonb_build_object('level',3),'content',jsonb_build_array(jsonb_build_object('type','text','text','먼저 본 수강생의 질문'))),
 jsonb_build_object('type','details','content',jsonb_build_array(jsonb_build_object('type','detailsSummary','content',jsonb_build_array(jsonb_build_object('type','text','text',p_title))),jsonb_build_object('type','detailsContent','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',p_answer))))))));
 if p_node>=0 then
  if left(chosen->>'content',14)<>E'edu-lesson:v1\n' then raise exception 'QA_ANCHOR_CHANGED'; end if;
  body:=substring(chosen->>'content' from 15)::jsonb; nodes:=body->'content';
  if p_node>=jsonb_array_length(nodes) or nodes->p_node->>'type' not in ('paragraph','heading','blockquote') then raise exception 'QA_ANCHOR_CHANGED'; end if;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into nodes from (
   select v value,n*10 ord from jsonb_array_elements(nodes) with ordinality x(v,n)
   union all select v,(p_node+1)*10+n from jsonb_array_elements(extra) with ordinality x(v,n)
  ) a;
  content:=E'edu-lesson:v1\n'||jsonb_set(body,'{content}',nodes)::text;
  select jsonb_agg(case when b->>'id'=p_block then jsonb_set(b,'{content}',to_jsonb(content)) else b end order by n) into blocks from jsonb_array_elements(blocks) with ordinality x(b,n);
 else
  if p_node<>-1 or left(chosen->>'content',14)=E'edu-lesson:v1\n' then raise exception 'QA_ANCHOR_CHANGED'; end if;
  select jsonb_agg(value order by ord) into blocks from (
   select b value,n*10 ord from jsonb_array_elements(blocks) with ordinality x(b,n)
   union all select jsonb_build_object('id','qa-'||p_request::text,'type','text','content',E'edu-lesson:v1\n'||jsonb_build_object('type','doc','content',extra)::text),n*10+1 from jsonb_array_elements(blocks) with ordinality x(b,n) where b->>'id'=p_block
  ) a;
 end if;
 payload:=jsonb_set(payload,'{blocks,document,blocks}',blocks);
 insert into public.edu_lesson_qa_plans(id,lesson_id,question_id,created_by,question_stamp,public_stamp,cohort_stamp,author_head,expected_answer,anchor_block,anchor_node,title,answer,payload,digest)
 values(p_request,lesson,p_question,p_actor,p_question_stamp,p_public_stamp,p_cohort_stamp,p_author_head,(select answer_head_id from public.edu_questions where id=p_question),p_block,p_node,p_title,p_answer,payload,md5(jsonb_build_array(p_request,p_question,p_public_stamp,p_question_stamp,p_cohort_stamp,payload,p_title,p_answer)::text)) returning * into plan;
 return jsonb_build_object('id',plan.id,'digest',plan.digest,'title',plan.title,'answer',plan.answer,'applied',false);
end; $$;

create function public.edu_apply_lesson_qa(p_actor uuid,p_plan uuid,p_digest text) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare plan public.edu_lesson_qa_plans%rowtype; source jsonb; course uuid; receipt jsonb;
begin
 if public.mission_operator_allowed(p_actor,'products') is not true or public.mission_operator_allowed(p_actor,'members') is not true then raise exception 'QA_FORBIDDEN'; end if;
 select * into plan from public.edu_lesson_qa_plans where id=p_plan;
 if not found or plan.created_by<>p_actor or plan.digest is distinct from p_digest then raise exception 'QA_CHANGED'; end if;
 select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=plan.lesson_id;
 perform 1 from public.courses where id=course for update;
 perform pg_advisory_xact_lock(hashtextextended(course::text,261029));
 perform 1 from public.curriculum_lessons where id=plan.lesson_id for update;
 perform 1 from public.edu_questions where id=plan.question_id for update;
 select * into plan from public.edu_lesson_qa_plans where id=p_plan for update;
 if plan.applied_at is not null then return plan.result; end if;
 source:=public.edu_read_lesson_qa(p_actor,plan.question_id);
 if source->>'questionStamp' is distinct from plan.question_stamp or source->>'publicStamp' is distinct from plan.public_stamp or source->>'cohortStamp' is distinct from plan.cohort_stamp or (source->>'authorHead')::uuid is distinct from plan.author_head then raise exception 'QA_CHANGED'; end if;
 if (source->>'draftPending')::boolean then raise exception 'QA_DRAFT_PENDING'; end if;
 if (source->>'applied')::boolean then raise exception 'QA_DUPLICATE'; end if;
 -- One transaction: verify the answer first, then publish the exact reviewed
 -- curriculum. A failed second step rolls back the answer and its notice too.
 receipt:=public.edu_add_question_answer(p_actor,plan.question_id,plan.expected_answer,plan.answer_id,plan.answer);
 if receipt->>'id' is distinct from plan.answer_id::text then raise exception 'QA_RESULT_MISMATCH'; end if;
 perform public.edu_save_lesson_author(p_actor,plan.lesson_id,plan.author_head,plan.author_revision,plan.public_stamp,plan.payload,false,false);
 receipt:=public.edu_publish_lesson_author(p_actor,plan.lesson_id,plan.author_revision,plan.publication_id);
 if receipt->>'published'<>'true' then raise exception 'QA_RESULT_MISMATCH'; end if;
 receipt:=jsonb_build_object('id',plan.id,'answerId',plan.answer_id,'revision',plan.author_revision,'published',true);
 update public.edu_lesson_qa_plans set applied_at=now(),result=receipt where id=plan.id;
 return receipt;
end; $$;
revoke all on function public.edu_read_lesson_qa(uuid,uuid),public.edu_prepare_lesson_qa(uuid,uuid,uuid,text,text,text,uuid,text,integer,text,text),public.edu_apply_lesson_qa(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_read_lesson_qa(uuid,uuid),public.edu_prepare_lesson_qa(uuid,uuid,uuid,text,text,text,uuid,text,integer,text,text),public.edu_apply_lesson_qa(uuid,uuid,text) to service_role;
commit;
