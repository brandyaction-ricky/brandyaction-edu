begin;

-- A cohort ends its coached participation; it never expires a paid learner's
-- existing content entitlement. Free classes have no graduate state.
create function public.edu_is_graduate_enrollment(p_enrollment uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.cohorts h on h.id = e.cohort_id and h.course_id = c.id
    where e.id = p_enrollment and c.category = 'paid_class'
      and e.status = 'active' and e.revoked_at is null
      and (e.access_starts_at is null or e.access_starts_at <= now())
      and (e.access_ends_at is null or e.access_ends_at > now())
      and h.status <> 'cancelled'
      and (h.status = 'completed' or h.operation_end_at <= now())
  );
$$;
revoke all on function public.edu_is_graduate_enrollment(uuid) from public, anon, authenticated;
grant execute on function public.edu_is_graduate_enrollment(uuid) to service_role;

-- Project the same published lessons, but do not let the old cohort's
-- submission sequence lock a graduate out of reading them.
create or replace function public.edu_read_lesson_progression(p_actor uuid,p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare course uuid; graduate boolean;
begin
  select e.course_id into course from public.enrollments e join public.profiles p on p.id=e.user_id where e.id=p_enrollment and e.user_id=p_actor
    and p.status='active' and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now());
  if course is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  graduate := public.edu_is_graduate_enrollment(p_enrollment);
  return coalesce((select jsonb_agg(
    case when graduate then jsonb_set(jsonb_set(public.edu_lesson_progression_gate(p_enrollment,l.id),'{isUnlocked}','true'::jsonb),'{reason}','""'::jsonb)
      else public.edu_lesson_progression_gate(p_enrollment,l.id) end
    || jsonb_build_object('tagLabel',coalesce(v.document->'presentation'->>'tagLabel','')) order by l.id)
    from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    left join public.edu_lesson_block_heads h on h.lesson_id=l.id
    left join public.edu_lesson_block_versions v on v.id=h.revision
    where w.course_id=course and l.archived_at is null and w.archived_at is null and l.is_published and w.is_published),'[]'::jsonb);
end;
$$;

-- Legacy text/mission content is protected by a restrictive RLS policy as
-- well as the block RPC. Let graduates read published lessons there too.
create or replace function edu_private.edu_progression_readable(p_lesson uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); enrollment uuid;
begin
  if not exists(select 1 from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision where h.lesson_id=p_lesson and v.document ? 'progression') then return true; end if;
  if actor is null then return false; end if;
  if exists(select 1 from public.profiles p where p.id=actor and p.status='active' and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and (s.value->'products'='true'::jsonb or s.value->'members'='true'::jsonb))))) then return true; end if;
  for enrollment in select e.id from public.enrollments e join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
    join public.profiles p on p.id=e.user_id where l.id=p_lesson and l.is_published and w.is_published and e.user_id=actor and p.status='active' and e.status='active' and e.revoked_at is null
    and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()) loop
    if public.edu_is_graduate_enrollment(enrollment) or (public.edu_lesson_progression_gate(enrollment,p_lesson)->>'isUnlocked')::boolean then return true; end if;
  end loop;
  return false;
end;
$$;

-- Only this read RPC bypasses the progression lock. Existing write RPCs still
-- require edu_assert_block_access and remain locked for closed lessons.
create or replace function public.edu_read_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid default null,p_revision uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare editable boolean; current_id uuid; v public.edu_lesson_block_versions%rowtype; d public.edu_lesson_block_drafts%rowtype; s public.edu_lesson_block_submissions%rowtype;
begin
  begin
    editable:=public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  exception when raise_exception then
    if sqlerrm = 'BLOCK_LESSON_LOCKED' and public.edu_is_graduate_enrollment(p_enrollment) then
      editable:=false;
    else raise; end if;
  end;
  select revision into current_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  select * into v from public.edu_lesson_block_versions where id=coalesce(p_revision,current_id) and lesson_id=p_lesson;
  if p_revision is not null and v.id is null then raise exception 'BLOCK_NOT_FOUND'; end if;
  if not editable and v.id is distinct from current_id and not exists(select 1 from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id)
    and not exists(select 1 from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and revision=v.id)
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id;
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=v.id order by sequence desc limit 1;
  return jsonb_build_object('ongoing',(select cadence from public.edu_ongoing_rules where lesson_id=p_lesson),'submissions',coalesce((select jsonb_agg(public.edu_block_submission_receipt(h) order by h.sequence desc) from public.edu_lesson_block_submissions h where h.enrollment_id=p_enrollment and h.revision=v.id),'[]'::jsonb),'submission',case when s.id is null then null else public.edu_block_submission_receipt(s) end,'editable',editable,'revision',v.id,'currentRevision',current_id,'document',v.document,
    'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end,
    'previousDrafts',coalesce((select jsonb_agg(jsonb_build_object('revision',dv.revision,'updatedAt',dv.updated_at) order by dv.updated_at desc)
      from public.edu_lesson_block_drafts dv join public.edu_lesson_block_versions bv on bv.id=dv.revision
      where dv.enrollment_id=p_enrollment and bv.lesson_id=p_lesson and dv.revision is distinct from current_id),'[]'::jsonb));
end;
$$;

-- A graduate can reopen their own historical submission even when the old
-- cohort's sequence gate is locked. Reviewer permissions remain unchanged.
create or replace function public.edu_read_block_submission(p_actor uuid,p_submission uuid,p_enrollment uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.edu_lesson_block_submissions%rowtype; doc jsonb; events jsonb;
begin
 if p_enrollment is null then perform public.edu_assert_block_reviewer(p_actor); end if;
 select * into s from public.edu_lesson_block_submissions where id=p_submission;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 if p_enrollment is not null then
  if s.enrollment_id<>p_enrollment then raise exception 'BLOCK_FORBIDDEN'; end if;
  begin
   perform public.edu_assert_block_access(p_actor,s.lesson_id,p_enrollment);
  exception when raise_exception then
   if sqlerrm <> 'BLOCK_LESSON_LOCKED' or not public.edu_is_graduate_enrollment(p_enrollment) then raise; end if;
  end;
 end if;
 select document into doc from public.edu_lesson_block_versions where id=s.revision;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'decision',decision,'feedback',feedback,'createdAt',created_at)
  order by state_sequence,event_kind,event_sequence),'[]'::jsonb) into events from (
  select r.id,r.decision,r.feedback,r.created_at,r.sequence as state_sequence,0 as event_kind,r.sequence as event_sequence
   from public.edu_lesson_block_reviews r where r.submission_id=s.id
  union all
  select f.id,'feedback',f.feedback,f.created_at,coalesce(r.sequence,0),1,f.sequence
   from public.edu_lesson_block_feedback f left join public.edu_lesson_block_reviews r on r.id=f.expected_state
   where f.submission_id=s.id and f.source='comment'
 ) history;
 return jsonb_build_object('submission',public.edu_block_submission_receipt(s),'document',doc,'values',s.values,
  'memberName',(select p.full_name from public.profiles p join public.enrollments e on e.user_id=p.id where e.id=s.enrollment_id),
  'courseTitle',(select c.title from public.courses c join public.enrollments e on e.course_id=c.id where e.id=s.enrollment_id),
  'lessonTitle',(select title from public.curriculum_lessons where id=s.lesson_id),
  'isLatest',not exists(select 1 from public.edu_lesson_block_submissions n where n.enrollment_id=s.enrollment_id and n.lesson_id=s.lesson_id and n.sequence>s.sequence),
  'previousSubmissions',coalesce((select jsonb_agg(public.edu_block_submission_receipt(h) order by h.sequence desc) from public.edu_lesson_block_submissions h where h.enrollment_id=s.enrollment_id and h.lesson_id=s.lesson_id and h.id<>s.id),'[]'::jsonb),
  'history',events);
end; $$;

-- Private files inside a learner's saved answer follow the same historical
-- read entitlement as the submission itself.
create or replace function public.edu_read_answer_file(p_actor uuid,p_file uuid,p_submission uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.edu_lesson_answer_files%rowtype; detail jsonb;
begin
 select * into f from public.edu_lesson_answer_files where id=p_file and ready_at is not null;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 if f.owner_id=p_actor then
  begin
   perform public.edu_assert_block_access(p_actor,f.lesson_id,f.enrollment_id);
  exception when raise_exception then
   if sqlerrm <> 'BLOCK_LESSON_LOCKED' or not public.edu_is_graduate_enrollment(f.enrollment_id) then raise; end if;
  end;
 else
  if p_submission is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  detail:=public.edu_read_block_submission(p_actor,p_submission,null);
  if detail->'submission'->>'revision'<>f.revision::text or (detail->'values'->'blocks'->f.block_id @> jsonb_build_object(case f.kind when 'image' then 'imageId' else 'fileId' end,f.id::text)) is distinct from true then raise exception 'BLOCK_FORBIDDEN'; end if;
 end if;
 return to_jsonb(f);
end; $$;

-- Existing learning questions stay visible, but the thread no longer offers
-- a follow-up action once the related paid cohort has graduated.
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
  'canFollowUp',q.user_id=p_actor and not q.is_archived and (q.enrollment_id is null or not public.edu_is_graduate_enrollment(q.enrollment_id)));
end; $$;

-- Learning-context questions are part of a live cohort. Account and payment
-- support remain available through the ordinary general-question path.
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
 and not public.edu_is_graduate_enrollment(e.id)
 and (public.edu_lesson_progression_gate(e.id,l.id)->>'isUnlocked')::boolean
 order by p.updated_at desc nulls last,c.title,co.name,w.week_number,l.day_number,l.id;
end; $$;

revoke all on function public.edu_read_lesson_progression(uuid,uuid), public.edu_read_lesson_blocks(uuid,uuid,uuid,uuid), public.edu_read_block_submission(uuid,uuid,uuid), public.edu_read_answer_file(uuid,uuid,uuid), public.edu_read_question_thread(uuid,uuid,bigint), public.edu_question_contexts(uuid) from public, anon, authenticated;
grant execute on function public.edu_read_lesson_progression(uuid,uuid), public.edu_read_lesson_blocks(uuid,uuid,uuid,uuid), public.edu_read_block_submission(uuid,uuid,uuid), public.edu_read_answer_file(uuid,uuid,uuid), public.edu_read_question_thread(uuid,uuid,bigint), public.edu_question_contexts(uuid) to service_role;
commit;
