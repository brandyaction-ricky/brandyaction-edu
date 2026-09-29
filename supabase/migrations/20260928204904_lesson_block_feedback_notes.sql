begin;
-- Feedback is an append-only stream separate from approval/progress state.
-- Decision feedback joins the same stream so an empty approval never erases it.
create table public.edu_lesson_block_feedback (
 id uuid primary key,
 sequence bigint generated always as identity,
 submission_id uuid not null references public.edu_lesson_block_submissions(id),
 actor_id uuid not null references public.profiles(id),
 source text not null check(source in ('comment','decision')),
 expected_state uuid not null,
 expected_feedback uuid,
 feedback text not null check(length(feedback)<=2000 and feedback ~ '[^[:space:]]'),
 created_at timestamptz not null default clock_timestamp()
);
create index edu_block_feedback_latest on public.edu_lesson_block_feedback(submission_id,sequence desc);
create index edu_block_feedback_actor on public.edu_lesson_block_feedback(actor_id);
alter table public.edu_lesson_block_feedback enable row level security;
revoke all on public.edu_lesson_block_feedback from public,anon,authenticated;
grant select,insert on public.edu_lesson_block_feedback to service_role;
grant usage on sequence public.edu_lesson_block_feedback_sequence_seq to service_role;
insert into public.edu_lesson_block_feedback(id,submission_id,actor_id,source,expected_state,feedback,created_at)
 select id,submission_id,actor_id,'decision',id,feedback,created_at from public.edu_lesson_block_reviews
 where feedback ~ '[^[:space:]]' order by sequence;

create function edu_private.capture_block_feedback()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.feedback ~ '[^[:space:]]' then
  insert into public.edu_lesson_block_feedback(id,submission_id,actor_id,source,expected_state,feedback)
   values(new.id,new.submission_id,new.actor_id,'decision',new.id,new.feedback);
 end if;
 return new;
end; $$;
create trigger edu_block_decision_feedback after insert on public.edu_lesson_block_reviews for each row execute function edu_private.capture_block_feedback();

create or replace function public.edu_block_submission_receipt(p_row public.edu_lesson_block_submissions)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p_row.id,'revision',p_row.revision,'writeId',p_row.draft_write_id,
  'outcome',p_row.outcome,'createdAt',p_row.created_at,'assessment',p_row.assessment,
  'approvalKind',case when r.decision='auto_approved' then 'automatic' else null end,
  'state',case when r.decision='auto_approved' then 'approved' else coalesce(r.decision,p_row.outcome) end,
  'stateId',coalesce(r.id,p_row.id),'feedback',coalesce(f.feedback,''),'feedbackId',f.id,'reviewedAt',r.created_at)
 from (select 1) seed left join lateral (
  select * from public.edu_lesson_block_reviews where submission_id=p_row.id order by sequence desc limit 1
 ) r on true left join lateral (
  select * from public.edu_lesson_block_feedback where submission_id=p_row.id order by sequence desc limit 1
 ) f on true;
$$;

create function public.edu_save_block_feedback(p_actor uuid,p_submission uuid,p_expected_state uuid,p_expected_feedback uuid,p_request uuid,p_feedback text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_lesson_block_submissions%rowtype; note public.edu_lesson_block_feedback%rowtype; receipt jsonb; latest uuid; recipient uuid; title text;
begin
 if p_request is null or p_expected_state is null or p_feedback is null or length(p_feedback)>2000 or p_feedback !~ '[^[:space:]]' then raise exception 'BLOCK_INVALID'; end if;
 perform public.edu_assert_block_reviewer(p_actor);
 select * into s from public.edu_lesson_block_submissions where id=p_submission;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 -- Match the lock order used by submit/review; no network call in this transaction.
 perform 1 from public.curriculum_lessons where id=s.lesson_id for update;
 perform 1 from public.enrollments where id=s.enrollment_id for share;
 perform 1 from public.profiles where id=p_actor for share;
 perform public.edu_assert_block_reviewer(p_actor);
 select e.user_id into recipient from public.enrollments e join public.profiles p on p.id=e.user_id where e.id=s.enrollment_id
  and p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now());
 if recipient is null then raise exception 'BLOCK_FORBIDDEN'; end if;
 select * into note from public.edu_lesson_block_feedback where id=p_request;
 if found then
  if note.source<>'comment' or note.submission_id<>s.id or note.actor_id<>p_actor or note.expected_state<>p_expected_state
   or note.expected_feedback is distinct from p_expected_feedback or note.feedback<>p_feedback then raise exception 'BLOCK_REQUEST_REUSED'; end if;
  return public.edu_block_submission_receipt(s);
 end if;
 select id into latest from public.edu_lesson_block_submissions where enrollment_id=s.enrollment_id and lesson_id=s.lesson_id order by sequence desc limit 1;
 receipt:=public.edu_block_submission_receipt(s);
 if latest is distinct from s.id or (receipt->>'stateId')::uuid is distinct from p_expected_state
  or (receipt->>'feedbackId')::uuid is distinct from p_expected_feedback then raise exception 'BLOCK_REVIEW_CHANGED'; end if;
 insert into public.edu_lesson_block_feedback(id,submission_id,actor_id,source,expected_state,expected_feedback,feedback)
  values(p_request,s.id,p_actor,'comment',p_expected_state,p_expected_feedback,p_feedback);
 select l.title into title from public.curriculum_lessons l where l.id=s.lesson_id;
 perform edu_private.learning_notice(recipient,'review','feedback:'||p_request::text,
  '[멘토 피드백]'||E'\n'||coalesce(title,'학습')||E'\n\n'||p_feedback,'/learn/'||s.enrollment_id::text||'/'||s.lesson_id::text);
 return public.edu_block_submission_receipt(s);
end; $$;

create or replace function public.edu_read_block_submission(p_actor uuid,p_submission uuid,p_enrollment uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.edu_lesson_block_submissions%rowtype; doc jsonb; events jsonb;
begin
 if p_enrollment is null then perform public.edu_assert_block_reviewer(p_actor); end if;
 select * into s from public.edu_lesson_block_submissions where id=p_submission;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 if p_enrollment is not null then
  if s.enrollment_id<>p_enrollment then raise exception 'BLOCK_FORBIDDEN'; end if;
  perform public.edu_assert_block_access(p_actor,s.lesson_id,p_enrollment);
 end if;
 select document into doc from public.edu_lesson_block_versions where id=s.revision;
 -- Sort feedback after the review state it was written against. Timestamps alone
 -- cannot order transactions that started earlier but acquired the lock later.
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
revoke all on function edu_private.capture_block_feedback(),public.edu_save_block_feedback(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function edu_private.capture_block_feedback(),public.edu_save_block_feedback(uuid,uuid,uuid,uuid,uuid,text) to service_role;
commit;
