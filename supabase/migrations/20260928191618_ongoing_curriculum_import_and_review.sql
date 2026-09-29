begin;
-- Extend private batch imports to recurring lessons in the same transaction.
create or replace function public.edu_import_lesson_batch(p_actor uuid,p_request uuid,p_batch jsonb,p_apply boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare course uuid; prior public.edu_curriculum_import_batches%rowtype; w jsonb; l jsonb; m jsonb; b jsonb; receipt jsonb; weeks_count integer:=0;
begin
 if p_request is null or p_apply is null or jsonb_typeof(p_batch) is distinct from 'object' or octet_length(p_batch::text)>8000000
  or p_batch->'formatVersion' is distinct from '1'::jsonb or coalesce(p_batch->>'sourceDigest','')!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p_batch->'weeks') is distinct from 'array' or jsonb_typeof(p_batch->'lessons') is distinct from 'array' or jsonb_typeof(p_batch->'media') is distinct from 'array'
  then raise exception 'IMPORT_INVALID'; end if;
 if jsonb_array_length(p_batch->'weeks') not between 1 and 100 or jsonb_array_length(p_batch->'lessons') not between 1 and 200 or jsonb_array_length(p_batch->'media')>2000 then raise exception 'IMPORT_INVALID'; end if;
 course:=(p_batch->>'courseId')::uuid;
 perform public.edu_assert_media_author(p_actor,course);
 -- Same course lock as lesson block authoring, acquired before row locks.
 perform pg_advisory_xact_lock(hashtextextended(course::text,261029));
 perform 1 from public.courses where id=course and archived_at is null for update;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 select * into prior from public.edu_curriculum_import_batches where id=p_request;
 if found then
  if prior.actor_id<>p_actor or prior.course_id<>course or prior.payload<>p_batch then raise exception 'IMPORT_REQUEST_REUSED'; end if;
  return prior.receipt;
 end if;
 if exists(select 1 from jsonb_array_elements(p_batch->'lessons') x group by x->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'lessons') x group by x->>'revision' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'lessons') x group by x->>'sourceKey' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'lessons') x group by x->>'weekId',x->>'order' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'lessons') x where not x ? 'ongoing' group by x->'document'->'progression' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'weeks') x group by x->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'weeks') x group by x->>'number' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_batch->'media') x group by x->>'assetId' having count(*)>1) then raise exception 'IMPORT_INVALID'; end if;
 for w in select value from jsonb_array_elements(p_batch->'weeks') order by value->>'id' loop
  if jsonb_typeof(w->'existing') is distinct from 'boolean' or jsonb_typeof(w->'number') is distinct from 'number' or (w->>'number')!~'^[0-9]+$'
   or (w->>'number')::integer not between 1 and 10000 or length(btrim(w->>'title')) not between 1 and 300 then raise exception 'IMPORT_INVALID'; end if;
  if (w->>'existing')::boolean then
   perform 1 from public.curriculum_weeks where id=(w->>'id')::uuid and course_id=course and week_number=(w->>'number')::integer and archived_at is null for share;
   if not found then raise exception 'IMPORT_TARGET_CHANGED'; end if;
  else
   if exists(select 1 from public.curriculum_weeks where id=(w->>'id')::uuid or (course_id=course and week_number=(w->>'number')::integer)) then raise exception 'IMPORT_TARGET_CHANGED'; end if;
   weeks_count:=weeks_count+1;
  end if;
 end loop;
 for l in select value from jsonb_array_elements(p_batch->'lessons') loop
  if length(btrim(coalesce(l->>'title',''))) not between 1 and 300 or length(coalesce(l->>'sourceKey','')) not between 1 and 200
   or jsonb_typeof(l->'order') is distinct from 'number' or (l->>'order')!~'^[0-9]+$' or (l->>'order')::integer not between 1 and 100000
   or not exists(select 1 from jsonb_array_elements(p_batch->'weeks') target_week where target_week->>'id'=l->>'weekId')
   or l->'document'->'schemaVersion' is distinct from '1'::jsonb or jsonb_typeof(l->'document'->'blocks') is distinct from 'array'
   or (case when l ? 'ongoing' then coalesce(l->>'ongoing','') not in ('daily','weekly','monthly') or l->'document' ? 'progression' or l->'document'->'completion'->>'mode' is distinct from 'self'
    else coalesce(l->'document'->'progression'->>'track','') not in ('daily','learning') end) then raise exception 'IMPORT_INVALID'; end if;
  if exists(select 1 from public.curriculum_lessons where id=(l->>'id')::uuid or (week_id=(l->>'weekId')::uuid and day_number=(l->>'order')::integer))
   or exists(select 1 from public.edu_lesson_block_versions where id=(l->>'revision')::uuid)
   or exists(select 1 from public.edu_curriculum_import_items where course_id=course and source_key=l->>'sourceKey') then raise exception 'IMPORT_TARGET_CHANGED'; end if;
  if exists(select 1 from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons x on x.id=h.lesson_id join public.curriculum_weeks existing_week on existing_week.id=x.week_id
   where existing_week.course_id=course and x.archived_at is null and existing_week.archived_at is null and v.document->'progression'=l->'document'->'progression') then raise exception 'BLOCK_PROGRESSION_DUPLICATE'; end if;
  for b in select value from jsonb_array_elements(l->'document'->'blocks') where value ? 'assetId' loop
   if not exists(select 1 from jsonb_array_elements(p_batch->'media') target_media where target_media->>'assetId'=b->>'assetId' and target_media->>'kind'=b->>'type') then raise exception 'IMPORT_MEDIA_CHANGED'; end if;
  end loop;
 end loop;
 -- Recheck on the destination DB in the same transaction; offline receipts are
 -- not trusted as authorization or proof that an upload exists.
 for m in select value from jsonb_array_elements(p_batch->'media') loop
  if not exists(select 1 from public.edu_lesson_media f where f.id=(m->>'assetId')::uuid and f.owner_id=p_actor and f.course_id=course and f.ready_at is not null
   and f.sha256=m->>'sha256' and f.size=(m->>'bytes')::integer and f.content_type=m->>'mimeType' and f.kind=m->>'kind') then raise exception 'IMPORT_MEDIA_CHANGED'; end if;
 end loop;
 receipt:=jsonb_build_object('requestId',p_request,'applied',p_apply,'weeksCreated',weeks_count,'lessonsCreated',jsonb_array_length(p_batch->'lessons'),
  'daily',(select count(*) from jsonb_array_elements(p_batch->'lessons') x where x->'document'->'progression'->>'track'='daily'),
  'ongoing',(select count(*) from jsonb_array_elements(p_batch->'lessons') x where x ? 'ongoing'),
  'learning',(select count(*) from jsonb_array_elements(p_batch->'lessons') x where x->'document'->'progression'->>'track'='learning'),
  'lessons',(select jsonb_agg(jsonb_build_object('sourceKey',x->>'sourceKey','lessonId',x->>'id','revision',x->>'revision') order by n) from jsonb_array_elements(p_batch->'lessons') with ordinality a(x,n)));
 if not p_apply then return receipt; end if;
 for w in select value from jsonb_array_elements(p_batch->'weeks') where value->'existing'='false'::jsonb loop
  insert into public.curriculum_weeks(id,course_id,week_number,title,goal,is_published,display_order)
   values((w->>'id')::uuid,course,(w->>'number')::integer,w->>'title',w->>'goal',false,(w->>'number')::integer);
 end loop;
 for l in select value from jsonb_array_elements(p_batch->'lessons') loop
  insert into public.curriculum_lessons(id,week_id,day_number,title,description,content_type,duration_label,is_preview,is_published,display_order,access_mode)
   values((l->>'id')::uuid,(l->>'weekId')::uuid,(l->>'order')::integer,l->>'title',l->>'description','text',l->>'durationLabel',false,false,(l->>'order')::integer,'enrolled');
  perform public.edu_save_lesson_blocks(p_actor,(l->>'id')::uuid,null,(l->>'revision')::uuid,l->'document');
  if l ? 'ongoing' then perform public.edu_configure_ongoing(p_actor,(l->>'id')::uuid,l->>'ongoing',(l->>'revision')::uuid);end if;
 end loop;
 insert into public.edu_curriculum_import_batches(id,course_id,actor_id,source_digest,source_captured_at,payload,receipt)
  values(p_request,course,p_actor,p_batch->>'sourceDigest',(p_batch->>'sourceCapturedAt')::timestamptz,p_batch,receipt);
 insert into public.edu_curriculum_import_items(course_id,source_key,batch_id,lesson_id,revision)
  select course,x->>'sourceKey',p_request,(x->>'id')::uuid,(x->>'revision')::uuid from jsonb_array_elements(p_batch->'lessons') x;
 return receipt;
end;
$$;
revoke all on function public.edu_import_lesson_batch(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.edu_import_lesson_batch(uuid,uuid,jsonb,boolean) to service_role;


-- Read-only participation review uses the same permission as other learner
-- submissions. Product-edit permission alone does not grant answer access.
create index edu_ongoing_round_period on public.edu_ongoing_rounds(period_start desc,updated_at desc,enrollment_id,lesson_id);
create function public.edu_ongoing_review_options(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_block_reviewer(p_actor);
 return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'courseTitle',c.title,'cadence',r.cadence,'archived',l.archived_at is not null or w.archived_at is not null or c.archived_at is not null) order by c.title,l.title,l.id)
  from public.edu_ongoing_rules r join public.curriculum_lessons l on l.id=r.lesson_id join public.curriculum_weeks w on w.id=l.week_id join public.courses c on c.id=w.course_id),'[]'::jsonb);
end;
$$;
create function public.edu_list_ongoing_reviews(p_actor uuid,p_lesson uuid default null,p_scope text default 'current',p_state text default '',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_scope is null or p_scope not in ('current','all') or p_state is null or p_state not in ('','completed','draft') or p_page is null or p_page<1 or p_page>100000 then raise exception 'BLOCK_INVALID';end if;
 with records as materialized (
  select r.enrollment_id,r.lesson_id,r.period_start,r.period_end,r.updated_at,p.full_name,c.title as course_title,l.title as lesson_title,rule.cadence,done.created_at as completed_at,e.status as enrollment_status,e.revoked_at
  from public.edu_ongoing_rounds r join public.edu_ongoing_rules rule on rule.lesson_id=r.lesson_id
  join public.enrollments e on e.id=r.enrollment_id join public.profiles p on p.id=e.user_id join public.courses c on c.id=e.course_id join public.curriculum_lessons l on l.id=r.lesson_id
  left join public.edu_ongoing_completions done on done.enrollment_id=r.enrollment_id and done.lesson_id=r.lesson_id and done.period_start=r.period_start
  cross join lateral public.edu_ongoing_period(rule.cadence,now()) period
  where (p_lesson is null or r.lesson_id=p_lesson) and (p_scope='all' or r.period_start=period.starts_at)
   and (p_state='' or (p_state='completed' and done.id is not null) or (p_state='draft' and done.id is null))
 ), page as (
  select * from records order by period_start desc,updated_at desc,enrollment_id,lesson_id limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('total',(select count(*) from records),'page',p_page,'pageSize',20,'rows',coalesce((select jsonb_agg(jsonb_build_object(
  'enrollmentId',r.enrollment_id,'lessonId',r.lesson_id,'periodStart',r.period_start,'periodEnd',r.period_end,'updatedAt',r.updated_at,
  'memberName',r.full_name,'courseTitle',r.course_title,'lessonTitle',r.lesson_title,'cadence',r.cadence,'completedAt',r.completed_at,
  'enrollmentStatus',case when r.revoked_at is not null then 'revoked' else r.enrollment_status end
 ) order by r.period_start desc,r.updated_at desc,r.enrollment_id,r.lesson_id) from page r),'[]'::jsonb)) into result;
 return result;
end;
$$;
create function public.edu_read_ongoing_review(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_period timestamptz,p_completed boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r public.edu_ongoing_rounds%rowtype; c public.edu_ongoing_completions%rowtype; doc jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_period is null or p_completed is null then raise exception 'BLOCK_INVALID';end if;
 select * into r from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=p_period;
 if not found then raise exception 'BLOCK_NOT_FOUND';end if;
 select * into c from public.edu_ongoing_completions where enrollment_id=p_enrollment and lesson_id=p_lesson and period_start=p_period;
 if p_completed and c.id is null then raise exception 'BLOCK_NOT_FOUND';end if;
 select document into doc from public.edu_lesson_block_versions where id=r.revision and lesson_id=p_lesson;
 return jsonb_build_object('lessonId',p_lesson,'enrollmentId',p_enrollment,'periodStart',r.period_start,'periodEnd',r.period_end,'revision',r.revision,
  'cadence',(select cadence from public.edu_ongoing_rules where lesson_id=p_lesson),'completedAt',c.created_at,'snapshot',case when p_completed then 'completed' else 'latest' end,
  'updatedAt',case when p_completed then c.created_at else r.updated_at end,'document',doc,'values',case when p_completed then c.values else r.values end,
  'memberName',(select p.full_name from public.profiles p join public.enrollments e on e.user_id=p.id where e.id=p_enrollment),
  'courseTitle',(select course.title from public.courses course join public.enrollments e on e.course_id=course.id where e.id=p_enrollment),
  'lessonTitle',(select title from public.curriculum_lessons where id=p_lesson),
  'assessment',case when p_completed then c.assessment else null end);
end;
$$;
create function public.edu_read_ongoing_review_file(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_period timestamptz,p_completed boolean,p_file uuid,p_kind text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare detail jsonb; f public.edu_lesson_answer_files%rowtype; m public.edu_lesson_media%rowtype;
begin
 detail:=public.edu_read_ongoing_review(p_actor,p_lesson,p_enrollment,p_period,p_completed);
 if p_kind='answer' then
  select * into f from public.edu_lesson_answer_files where id=p_file and ready_at is not null;
  if not found then raise exception 'BLOCK_NOT_FOUND';end if;
  if f.lesson_id<>p_lesson or f.enrollment_id<>p_enrollment or f.revision::text<>detail->>'revision'
   or (detail->'values'->'blocks'->f.block_id @> jsonb_build_object(case f.kind when 'image' then 'imageId' else 'fileId' end,f.id::text)) is distinct from true then raise exception 'BLOCK_FORBIDDEN';end if;
  return jsonb_build_object('bucket','lesson-answer-files','path',f.path,'name',f.name,'kind',f.kind,'size',f.size);
 elsif p_kind='content' then
  select * into m from public.edu_lesson_media where id=p_file and ready_at is not null;
  if not found then raise exception 'BLOCK_NOT_FOUND';end if;
  if not exists(select 1 from jsonb_array_elements(detail->'document'->'blocks') b where b->>'assetId'=m.id::text and b->>'type'=m.kind) then raise exception 'BLOCK_FORBIDDEN';end if;
  return jsonb_build_object('bucket','lesson-content-media','path',m.path,'name',m.name,'kind',m.kind,'size',m.size);
 else raise exception 'BLOCK_INVALID';end if;
end;
$$;
revoke all on function public.edu_ongoing_review_options(uuid),public.edu_list_ongoing_reviews(uuid,uuid,text,text,integer),public.edu_read_ongoing_review(uuid,uuid,uuid,timestamptz,boolean),public.edu_read_ongoing_review_file(uuid,uuid,uuid,timestamptz,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_ongoing_review_options(uuid),public.edu_list_ongoing_reviews(uuid,uuid,text,text,integer),public.edu_read_ongoing_review(uuid,uuid,uuid,timestamptz,boolean),public.edu_read_ongoing_review_file(uuid,uuid,uuid,timestamptz,boolean,uuid,text) to service_role;
commit;
