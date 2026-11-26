-- Campus keeps a stable participant ID and can reference either type of access.
-- Student learning still uses enrollments directly.
begin;

set local lock_timeout = '5s';
lock table public.enrollments, public.edu_external_partner_access in share row exclusive mode;

create table public.edu_campus_participants (
  id uuid primary key,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  partner_access_id uuid references public.edu_external_partner_access(id) on delete cascade,
  check ((enrollment_id is not null and enrollment_id = id and partner_access_id is null)
      or (partner_access_id is not null and partner_access_id = id and enrollment_id is null))
);
alter table public.edu_campus_participants enable row level security;
revoke all on public.edu_campus_participants from public, anon, authenticated, service_role;
grant select on public.edu_campus_participants to service_role;
create index edu_campus_participants_enrollment_idx on public.edu_campus_participants (enrollment_id) where enrollment_id is not null;
create index edu_campus_participants_partner_idx on public.edu_campus_participants (partner_access_id) where partner_access_id is not null;

insert into public.edu_campus_participants (id, enrollment_id) select id, id from public.enrollments;
insert into public.edu_campus_participants (id, partner_access_id) select id, id from public.edu_external_partner_access;

create function private.edu_add_campus_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'enrollments' then
    insert into public.edu_campus_participants(id, enrollment_id) values (new.id, new.id);
  else
    insert into public.edu_campus_participants(id, partner_access_id) values (new.id, new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.edu_add_campus_participant() from public, anon, authenticated, service_role;

create trigger edu_campus_participant_enrollment after insert on public.enrollments
  for each row execute function private.edu_add_campus_participant();
create trigger edu_campus_participant_partner after insert on public.edu_external_partner_access
  for each row execute function private.edu_add_campus_participant();

create view private.edu_campus_access_records with (security_invoker = true) as
  select id, user_id, course_id, cohort_id, status::text, access_starts_at, access_ends_at, revoked_at
  from public.enrollments
  union all
  select a.id, a.user_id, a.course_id, a.cohort_id, 'active'::text, a.created_at, a.access_ends_at, a.revoked_at
  from public.edu_external_partner_access a join public.profiles p on p.id = a.user_id and p.role = 'student';

revoke all on private.edu_campus_access_records from public, anon, authenticated, service_role;
grant select on private.edu_campus_access_records to service_role;

-- Keep constraints and delete behavior for existing campus records.
alter table public.edu_campus_focus_sessions
  drop constraint edu_campus_focus_sessions_enrollment_id_fkey,
  add constraint edu_campus_focus_sessions_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_posts
  drop constraint edu_campus_posts_enrollment_id_fkey,
  add constraint edu_campus_posts_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_launches
  drop constraint edu_campus_launches_enrollment_id_fkey,
  add constraint edu_campus_launches_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_business_records
  drop constraint edu_campus_business_records_enrollment_id_fkey,
  add constraint edu_campus_business_records_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_business_review_links
  drop constraint edu_campus_business_review_links_enrollment_id_fkey,
  add constraint edu_campus_business_review_links_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_support_requests
  drop constraint edu_campus_support_requests_enrollment_id_fkey,
  add constraint edu_campus_support_requests_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_office_jobs
  drop constraint edu_campus_office_jobs_enrollment_id_fkey,
  add constraint edu_campus_office_jobs_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_business_cases
  drop constraint edu_campus_business_cases_enrollment_id_fkey,
  add constraint edu_campus_business_cases_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table private.edu_campus_office_dispatches
  drop constraint edu_campus_office_dispatches_enrollment_id_fkey,
  add constraint edu_campus_office_dispatches_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id);
alter table private.campus_student_connections
  drop constraint campus_student_connections_enrollment_id_fkey,
  add constraint campus_student_connections_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;
alter table public.edu_campus_office_inbox_signals
  drop constraint edu_campus_office_inbox_signals_enrollment_id_fkey,
  add constraint edu_campus_office_inbox_signals_enrollment_id_fkey
    foreign key (enrollment_id) references public.edu_campus_participants(id) on delete cascade;

-- Existing campus routines use the scoped records while keeping their ownership and visibility checks.

create or replace function private.campus_community_cohorts() returns setof uuid language sql stable security definer set search_path='' as $$
 select e.cohort_id from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id
 join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id
 where e.user_id=(select auth.uid()) and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and p.status='active' and c.status='published' and c.archived_at is null and h.archived_at is null;
$$;

create or replace function private.campus_community_mutate(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=(select auth.uid()); request_id uuid; action text; e private.edu_campus_access_records; p public.edu_campus_posts; cm public.edu_campus_comments; ak public.edu_campus_feedback_acknowledgments; prev private.edu_campus_community_receipts; result jsonb; images text[]; val text; target uuid; evidence jsonb; v_revision integer;
begin
 if not private.campus_community_active() or jsonb_typeof(c)<>'object' or octet_length(c::text)>24000 then raise exception 'invalid' using errcode='42501'; end if;
 request_id:=(c->>'requestId')::uuid; action:=c->>'action';
 if request_id is null or action not in ('create','revise','comment','acknowledge','block','unblock','report','moderate','launch') then raise exception 'invalid command' using errcode='23514'; end if;
 -- Serializes only a duplicate idempotency key, never the whole class.
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 if action='moderate' then
   if not private.mission_has_scope('members') then raise exception 'scope' using errcode='42501'; end if;
 else
   select * into e from private.edu_campus_access_records where id=(c->>'enrollmentId')::uuid and user_id=actor;
   if e.id is null or not private.campus_community_scope(e.cohort_id) or e.status<>'active' or e.revoked_at is not null or (e.access_starts_at is not null and e.access_starts_at>now()) or (e.access_ends_at is not null and e.access_ends_at<=now()) then raise exception 'scope' using errcode='42501'; end if;
 end if;
 select * into prev from private.edu_campus_community_receipts where actor_id=actor and private.edu_campus_community_receipts.request_id=request_id;
 if prev.request_id is not null then if prev.command<>c then raise exception 'idempotency conflict' using errcode='23505'; end if; return prev.result; end if;
 if action in ('revise','comment','acknowledge','report','moderate') then
   select * into p from public.edu_campus_posts where id=(c->>'postId')::uuid for update;
   if p.id is null or not private.campus_community_read_post(p.id) or (action<>'moderate' and p.cohort_id<>e.cohort_id) then raise exception 'scope' using errcode='42501'; end if;
   if p.hidden and action<>'moderate' then raise exception 'hidden' using errcode='42501'; end if;
 end if;
 if action in ('revise','comment','acknowledge') and (c->>'expectedRevision' is null or (c->>'expectedRevision')::integer<0) then raise exception 'revision required' using errcode='23514'; end if;
 if action in ('create','revise') then
   if c->>'kind' not in ('landing','ad','portfolio','feedback','process','failure','talent_offer','talent_request','demo_day') or c->>'visibility' not in ('private','cohort') or length(btrim(c->>'title')) not between 2 and 100 or length(btrim(c->>'body')) not between 10 and 6000 or length(btrim(c->>'alias')) not between 2 and 24 or coalesce(jsonb_typeof(c->'imageUrls'),'')<>'array' or jsonb_array_length(c->'imageUrls')>4 or not private.campus_community_url(coalesce(c->>'url','')) then raise exception 'input' using errcode='23514'; end if;
   select coalesce(array_agg(value),'{}') into images from jsonb_array_elements_text(c->'imageUrls');
   foreach val in array images loop if val='' or not private.campus_community_url(val) then raise exception 'image url' using errcode='23514'; end if; end loop;
   if c->>'lessonId' is not null and not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=(c->>'lessonId')::uuid and w.course_id=e.course_id and w.is_published and l.is_published) then raise exception 'lesson scope' using errcode='42501'; end if;
   if action='create' then
     insert into public.edu_campus_posts(id,owner_id,enrollment_id,cohort_id,alias,kind,title,body,url,image_urls,lesson_id,visibility) values(request_id,actor,e.id,e.cohort_id,btrim(c->>'alias'),c->>'kind',btrim(c->>'title'),btrim(c->>'body'),coalesce(c->>'url',''),images,(c->>'lessonId')::uuid,c->>'visibility') returning * into p;
   else
     if p.owner_id<>actor or p.kind<>c->>'kind' or p.enrollment_id<>e.id then raise exception 'owner' using errcode='42501'; end if;
     if p.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='23505'; end if;
     if length(btrim(c->>'changeNote')) not between 5 and 500 then raise exception 'change note' using errcode='23514'; end if;
     update public.edu_campus_posts set alias=btrim(c->>'alias'),title=btrim(c->>'title'),body=btrim(c->>'body'),url=coalesce(c->>'url',''),image_urls=images,lesson_id=(c->>'lessonId')::uuid,visibility=c->>'visibility',revision=revision+1,updated_at=now() where id=p.id returning * into p;
   end if;
   insert into public.edu_campus_post_revisions(post_id,revision,title,body,url,image_urls,visibility,change_note) values(p.id,p.revision,p.title,p.body,p.url,p.image_urls,p.visibility,case when action='create' then '첫 결과물 저장' else btrim(c->>'changeNote') end);
   result:=jsonb_build_object('postId',p.id,'revision',p.revision);
 elsif action='comment' then
   if p.visibility<>'cohort' or p.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='23505'; end if;
   if length(btrim(c->>'body')) not between 10 and 2000 or length(btrim(c->>'alias')) not between 2 and 24 then raise exception 'input' using errcode='23514'; end if;
   -- Rate-limits repeated comments independently of retries and rejects identical text.
   if exists(select 1 from public.edu_campus_comments where author_id=actor and post_id=p.id and (body=btrim(c->>'body') or created_at>now()-interval '10 seconds')) then raise exception 'duplicate comment' using errcode='23505'; end if;
   insert into public.edu_campus_comments(id,post_id,author_id,alias,body,post_revision) values(request_id,p.id,actor,btrim(c->>'alias'),btrim(c->>'body'),p.revision);
   result:=jsonb_build_object('commentId',request_id);
 elsif action='acknowledge' then
   select * into cm from public.edu_campus_comments where id=(c->>'commentId')::uuid and post_id=p.id and not hidden;
   if p.owner_id<>actor or cm.id is null or cm.author_id=actor or private.campus_community_blocked(cm.author_id,p.cohort_id) then raise exception 'recipient only' using errcode='42501'; end if;
   if jsonb_typeof(c->'useful') is distinct from 'boolean' or c->>'decision' not in ('pending','apply','keep') or length(coalesce(c->>'reason',''))>1000 then raise exception 'input' using errcode='23514'; end if;
   if c->>'decision' in ('apply','keep') and length(btrim(c->>'reason'))<5 then raise exception 'reason' using errcode='23514'; end if;
   v_revision:=case when c->>'decision'='apply' then (c->>'appliedRevision')::integer else null end;
   if c->>'decision'='apply' and (v_revision is null or v_revision<=cm.post_revision or not exists(select 1 from public.edu_campus_post_revisions where post_id=p.id and revision=v_revision)) then raise exception 'new revision evidence' using errcode='23514'; end if;
   select * into ak from public.edu_campus_feedback_acknowledgments where comment_id=cm.id;
   if coalesce(ak.revision,0) is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='23505'; end if;
   insert into public.edu_campus_feedback_acknowledgments(comment_id,owner_id,useful,decision,reason,applied_revision,revision) values(cm.id,actor,(c->>'useful')::boolean,c->>'decision',coalesce(btrim(c->>'reason'),''),v_revision,1)
   on conflict(comment_id) do update set useful=excluded.useful,decision=excluded.decision,reason=excluded.reason,applied_revision=excluded.applied_revision,revision=public.edu_campus_feedback_acknowledgments.revision+1,updated_at=now();
   result:=jsonb_build_object('commentId',cm.id);
 elsif action in ('block','unblock') then
   target:=(c->>'targetId')::uuid;
   if target=actor or target is null then raise exception 'target' using errcode='23514'; end if;
   if action='block' then
     if not exists(select 1 from public.edu_campus_posts where owner_id=target and cohort_id=e.cohort_id and visibility='cohort') and not exists(select 1 from public.edu_campus_comments cc join public.edu_campus_posts pp on pp.id=cc.post_id where cc.author_id=target and pp.cohort_id=e.cohort_id) then raise exception 'scope' using errcode='42501'; end if;
     insert into public.edu_campus_blocks(owner_id,target_id,cohort_id) values(actor,target,e.cohort_id) on conflict do nothing;
   else delete from public.edu_campus_blocks where owner_id=actor and target_id=target and cohort_id=e.cohort_id; end if;
   result:=jsonb_build_object('blocked',action='block');
 elsif action='report' then
   if length(btrim(c->>'reason')) not between 5 and 1000 then raise exception 'reason' using errcode='23514'; end if;
   if c->>'commentId' is not null and not exists(select 1 from public.edu_campus_comments where id=(c->>'commentId')::uuid and post_id=p.id and private.campus_community_read_comment(id)) then raise exception 'scope' using errcode='42501'; end if;
   if exists(select 1 from public.edu_campus_reports where reporter_id=actor and post_id=p.id and comment_id is not distinct from (c->>'commentId')::uuid and status='open') then raise exception 'duplicate report' using errcode='23505'; end if;
   insert into public.edu_campus_reports(id,reporter_id,post_id,comment_id,reason) values(request_id,actor,p.id,(c->>'commentId')::uuid,btrim(c->>'reason'));
   result:=jsonb_build_object('reportId',request_id);
 elsif action='moderate' then
   if length(btrim(c->>'reason')) not between 5 and 1000 then raise exception 'reason' using errcode='23514'; end if;
   if c->>'moderation' in ('hide_post','restore_post') then update public.edu_campus_posts set hidden=c->>'moderation'='hide_post',updated_at=now() where id=p.id;
   elsif c->>'moderation' in ('hide_comment','restore_comment') then
     update public.edu_campus_comments set hidden=c->>'moderation'='hide_comment' where id=(c->>'commentId')::uuid and post_id=p.id;
     if not found then raise exception 'comment' using errcode='23514'; end if;
   elsif c->>'moderation'='resolve_report' then update public.edu_campus_reports set status='resolved' where id=(c->>'reportId')::uuid and post_id=p.id;
     if not found then raise exception 'report' using errcode='23514'; end if;
   else raise exception 'moderation' using errcode='23514'; end if;
   insert into public.edu_campus_moderation_log(id,actor_id,post_id,comment_id,action,reason) values(request_id,actor,p.id,(c->>'commentId')::uuid,c->>'moderation',btrim(c->>'reason'));
   result:=jsonb_build_object('moderated',true);
 elsif action='launch' then
   -- A rare launch coordinates with the existing enrollment/submission writer locks.
   -- It does not hold a whole-class lock for ordinary reads or comments.
   perform 1 from public.enrollments where id=e.id for share;
   if not found then raise exception 'scope' using errcode='42501'; end if;
   perform 1 from public.mission_submissions where enrollment_id=e.id order by id for share;
   evidence:=private.campus_community_reward_state(e.id);
   if not (evidence->>'eligible')::boolean then raise exception 'launch requirements' using errcode='23514'; end if;
   evidence:=evidence||jsonb_build_object(
    'missionApprovals',(select coalesce(jsonb_agg(jsonb_build_object('missionId',m.id,'missionVersion',m.updated_at,'submissionId',latest.id,'attempt',latest.attempt_number,'reviewedAt',latest.reviewed_at)),'[]')
      from public.curriculum_missions m join public.curriculum_lessons l on l.id=m.lesson_id join public.curriculum_weeks w on w.id=l.week_id
      join lateral(select s.id,s.status,s.attempt_number,s.reviewed_at from public.mission_submissions s where s.enrollment_id=e.id and s.mission_id=m.id order by s.attempt_number desc limit 1) latest on latest.status='approved'
      where w.course_id=e.course_id and w.is_published and l.is_published and m.is_published and m.archived_at is null and m.is_required),
    'helpfulFeedback',(select coalesce(jsonb_agg(jsonb_build_object('commentId',cc.id,'recipientId',pp.owner_id,'ackRevision',aa.revision)),'[]')
      from public.edu_campus_feedback_acknowledgments aa join public.edu_campus_comments cc on cc.id=aa.comment_id join public.edu_campus_posts pp on pp.id=cc.post_id
      where cc.author_id=actor and pp.owner_id<>actor and pp.cohort_id=e.cohort_id and aa.owner_id=pp.owner_id and aa.useful and not cc.hidden and not pp.hidden and pp.visibility='cohort'),
    'appliedRevisionProofs',(select coalesce(jsonb_agg(jsonb_build_object('commentId',cc.id,'postId',pp.id,'ackRevision',aa.revision,'appliedRevision',aa.applied_revision)),'[]')
      from public.edu_campus_feedback_acknowledgments aa join public.edu_campus_comments cc on cc.id=aa.comment_id join public.edu_campus_posts pp on pp.id=cc.post_id
      where pp.owner_id=actor and pp.cohort_id=e.cohort_id and cc.author_id<>actor and not cc.hidden and not pp.hidden and aa.decision='apply' and aa.applied_revision>cc.post_revision));
   if jsonb_array_length(evidence->'missionApprovals') is distinct from (evidence->>'approvedMissions')::integer then raise exception 'eligibility changed' using errcode='23505'; end if;
   insert into public.edu_campus_launches(id,owner_id,enrollment_id,cohort_id,rule_version,evidence) values(request_id,actor,e.id,e.cohort_id,'moonshot-v1',evidence) on conflict(enrollment_id,rule_version) do nothing;
   result:=jsonb_build_object('launched',true);
 end if;
 insert into private.edu_campus_community_receipts(actor_id,request_id,command,result) values(actor,request_id,c,result);
 return result;
end;
$$;

create or replace function private.campus_community_reward_state(p_enrollment uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e private.edu_campus_access_records; r public.edu_campus_reward_rules; n_required integer; n_approved integer; n_useful integer; n_applied integer; points integer; reasons jsonb:='[]'; badges jsonb:='[]'; claimed timestamptz; collective integer;
begin
 select * into e from private.edu_campus_access_records where id=p_enrollment and user_id=(select auth.uid());
 if e.id is null or not private.campus_community_scope(e.cohort_id) or e.status<>'active' or e.revoked_at is not null or (e.access_starts_at is not null and e.access_starts_at>now()) or (e.access_ends_at is not null and e.access_ends_at<=now()) then raise exception 'scope' using errcode='42501'; end if;
 select * into r from public.edu_campus_reward_rules where version='moonshot-v1';
 select count(*),count(*) filter(where latest.status='approved') into n_required,n_approved
 from public.curriculum_missions m join public.curriculum_lessons l on l.id=m.lesson_id join public.curriculum_weeks w on w.id=l.week_id
 left join lateral(select s.status from public.mission_submissions s where s.enrollment_id=e.id and s.mission_id=m.id order by s.attempt_number desc limit 1) latest on true
 where w.course_id=e.course_id and w.is_published and l.is_published and m.is_published and m.archived_at is null and m.is_required;
 select count(distinct p.owner_id) into n_useful from public.edu_campus_feedback_acknowledgments a
 join public.edu_campus_comments c on c.id=a.comment_id join public.edu_campus_posts p on p.id=c.post_id
 where c.author_id=e.user_id and p.owner_id<>e.user_id and p.cohort_id=e.cohort_id and a.owner_id=p.owner_id and a.useful and not c.hidden and not p.hidden and p.visibility='cohort';
 select count(distinct p.id) into n_applied from public.edu_campus_feedback_acknowledgments a join public.edu_campus_comments c on c.id=a.comment_id join public.edu_campus_posts p on p.id=c.post_id
 where p.owner_id=e.user_id and p.cohort_id=e.cohort_id and c.author_id<>e.user_id and not c.hidden and not p.hidden and a.decision='apply' and a.applied_revision>c.post_revision;
 points:=n_approved*r.mission_xp+n_useful*r.useful_xp;
 if n_required=0 then reasons:=reasons||jsonb_build_array('현재 공개된 필수 과제가 필요해요.'); elsif n_approved<n_required then reasons:=reasons||jsonb_build_array('필수 과제 승인 '||n_approved||'/'||n_required); end if;
 if n_useful<r.useful_required then reasons:=reasons||jsonb_build_array('다른 동료에게 받은 도움됨 1개가 필요해요.'); end if;
 if n_applied<r.revisions_required then reasons:=reasons||jsonb_build_array('받은 의견을 새 버전에 반영한 기록 1개가 필요해요.'); end if;
 if n_approved>0 then badges:=badges||jsonb_build_array('첫 과제 승인'); end if;
 if n_useful>0 then badges:=badges||jsonb_build_array('도움이 된 동료'); end if;
 if n_applied>0 then badges:=badges||jsonb_build_array('한 번 더 개선'); end if;
 if reasons='[]'::jsonb then badges:=badges||jsonb_build_array('문샷 발사 준비'); end if;
 select created_at into claimed from public.edu_campus_launches where enrollment_id=e.id and rule_version=r.version;
 select count(distinct owner_id) into collective from public.edu_campus_launches where cohort_id=e.cohort_id and rule_version=r.version;
 return jsonb_build_object('ruleVersion',r.version,'approvedMissions',n_approved,'requiredMissions',n_required,'usefulFeedback',n_useful,'appliedRevisions',n_applied,'xp',points,'level',1+points/200,'badges',badges,'eligible',reasons='[]'::jsonb,'claimedAt',claimed,'cohortLaunches',collective,'cohortGoal',r.cohort_goal,'reasons',reasons);
end;
$$;

create or replace function private.campus_community_scope(p_cohort uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id
 join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id
 where e.user_id=(select auth.uid()) and e.cohort_id=p_cohort and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and p.status='active' and c.status='published' and c.archived_at is null and h.archived_at is null);
$$;

create or replace function private.campus_office_scope(p_enrollment uuid,p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id join public.courses c on c.id=e.course_id
 join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id where e.id=p_enrollment and e.user_id=p_owner and (p_owner=(select auth.uid()) or current_setting('role',true)='service_role') and p.status='active'
 and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and c.status='published' and c.archived_at is null and h.archived_at is null);
$$;

create or replace function private.campus_portfolio_file_complete(p_actor uuid,p_file uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.edu_campus_portfolio_files;
begin
 if current_setting('role',true)<>'service_role' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'scope' using errcode='42501';end if;
 select * into f from public.edu_campus_portfolio_files where id=p_file and owner_id=p_actor for update;
 if f.id is null or not exists(select 1 from public.edu_campus_posts p join private.edu_campus_access_records e on e.id=p.enrollment_id join public.profiles u on u.id=e.user_id join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id where p.id=f.post_id and p.owner_id=p_actor and e.user_id=p_actor and u.status='active' and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()) and c.status='published' and c.archived_at is null and h.archived_at is null) then raise exception 'scope' using errcode='42501';end if;
 if f.state='ready' and f.sha256<>p_hash then raise exception 'hash conflict' using errcode='23505';end if;
 update public.edu_campus_portfolio_files set state='ready',sha256=p_hash,ready_at=coalesce(ready_at,now()) where id=f.id;
 return jsonb_build_object('id',f.id,'ready',true);
end;$$;

create or replace function private.campus_portfolio_file_read(p_file uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.edu_campus_portfolio_files f join public.edu_campus_posts p on p.id=f.post_id where f.id=p_file and private.campus_community_scope(p.cohort_id) and
 (f.owner_id=(select auth.uid()) or (f.state='ready' and f.visibility='cohort' and p.visibility='cohort' and not p.hidden and not private.campus_community_blocked(p.owner_id,p.cohort_id) and not exists(select 1 from public.edu_campus_reports r where r.post_id=p.id and r.status='open') and exists(select 1 from private.edu_campus_access_records e join public.profiles u on u.id=e.user_id where e.id=p.enrollment_id and u.status='active' and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())))));
$$;

create or replace function private.edu_campus_space_cohorts() returns setof uuid language sql stable security definer set search_path='' as $$
 select e.cohort_id from private.edu_campus_access_records e
 join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.user_id=(select auth.uid()) and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now());
$$;

create or replace function public.edu_campus_business_case_command(p_actor uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.edu_campus_business_cases; event public.edu_campus_business_case_events; r public.edu_campus_business_records;
 cid uuid; rid uuid; eid uuid; actor_role text; action text; purpose text; purposes text[]; selection jsonb; selected_payload jsonb; snapshots jsonb:='[]'; field text; fields text[]; expected integer; decision text; note text; hash text;
begin
 if p_actor is null or jsonb_typeof(p_command) is distinct from 'object' or pg_column_size(p_command)>20000 then raise exception 'Invalid case command' using errcode='23514'; end if;
 select role into actor_role from public.profiles where id=p_actor and status='active';
 if actor_role is null then raise exception 'Unavailable actor' using errcode='42501'; end if;
 cid:=(p_command->>'id')::uuid; rid:=(p_command->>'requestId')::uuid; action:=p_command->>'action'; hash:=md5(p_command::text);
 if cid is null or rid is null or action is null or action not in ('submit','withdraw','review') then raise exception 'Invalid command' using errcode='23514'; end if;
 if action='review' and actor_role<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 -- Serializes every command for a case, including racing creation and consent/approval.
 perform pg_advisory_xact_lock(hashtextextended(cid::text, 27067));
 select * into c from public.edu_campus_business_cases where id=cid for update;
 select * into event from public.edu_campus_business_case_events where id=rid;
 if event.id is not null then
  if event.case_id=cid and event.actor_id=p_actor and event.command_hash=hash then return to_jsonb(c); end if;
  raise exception 'Request identity conflict' using errcode='23505';
 end if;
 if action='submit' then
  if c.id is not null then raise exception 'Case already exists' using errcode='23505'; end if;
  eid:=(p_command->>'enrollmentId')::uuid;
  if not public.edu_campus_business_review_available(eid,p_actor) then raise exception 'Enrollment unavailable' using errcode='42501'; end if;
  if p_command->>'consentVersion' is distinct from 'moonshot-case-selection-v2' or p_command->'consent' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'purposes') is distinct from 'array' or jsonb_typeof(p_command->'selections') is distinct from 'array' then raise exception 'Invalid consent' using errcode='23514'; end if;
  select array_agg(value) into purposes from jsonb_array_elements_text(p_command->'purposes');
  if cardinality(purposes) not between 1 and 3 or not(purposes <@ array['cohort_learning','website','sales_material']::text[]) or cardinality(purposes)<>(select count(distinct v) from unnest(purposes) v) or jsonb_array_length(p_command->'selections') not between 1 and 5 then raise exception 'Invalid selection' using errcode='23514'; end if;
  for selection in select * from jsonb_array_elements(p_command->'selections') loop
   select * into r from public.edu_campus_business_records where id=(selection->>'recordId')::uuid and user_id=p_actor and enrollment_id=eid and archived_at is null;
   if r.id is null then raise exception 'Evidence unavailable' using errcode='42501'; end if;
   if r.revision is distinct from (selection->>'revision')::integer then raise exception 'Evidence changed' using errcode='23505'; end if;
   if exists(select 1 from jsonb_array_elements(snapshots) v where v->>'recordId'=r.id::text) then raise exception 'Repeated evidence' using errcode='23514'; end if;
   if jsonb_typeof(selection->'fields') is distinct from 'array' or jsonb_array_length(selection->'fields') not between 1 and 10 then raise exception 'Invalid fields' using errcode='23514'; end if;
   fields:='{}';selected_payload:='{}';
   for field in select * from jsonb_array_elements_text(selection->'fields') loop
    if not(r.payload ? field) or field=any(fields) or jsonb_typeof(r.payload->field) not in ('string','number') then raise exception 'Invalid field selection' using errcode='23514'; end if;
    fields:=array_append(fields,field);selected_payload:=selected_payload||jsonb_build_object(field,r.payload->field);
   end loop;
   snapshots:=snapshots||jsonb_build_array(jsonb_build_object('recordId',r.id,'revision',r.revision,'kind',r.kind,'title',r.title,'fields',fields,'payload',selected_payload));
  end loop;
  insert into public.edu_campus_business_cases(id,user_id,enrollment_id,title,industry,summary,limits,evidence,granted_purposes,allowed_purposes,consent_version)
  values(cid,p_actor,eid,btrim(p_command->>'title'),p_command->>'industry',btrim(p_command->>'summary'),btrim(p_command->>'limits'),snapshots,purposes,purposes,p_command->>'consentVersion') returning * into c;
 else
  if c.id is null then raise exception 'Case unavailable' using errcode='P0002'; end if;
  expected:=(p_command->>'expectedRevision')::integer;
  if expected is null or expected<>c.revision then raise exception 'Case changed' using errcode='23505'; end if;
  if action='withdraw' then
   if c.user_id<>p_actor then raise exception 'Owner required' using errcode='42501'; end if;
   purpose:=p_command->>'purpose';if purpose is null or not(purpose=any(c.allowed_purposes)) then raise exception 'Purpose unavailable' using errcode='23514'; end if;
   purposes:=array_remove(c.allowed_purposes,purpose);
   update public.edu_campus_business_cases set allowed_purposes=purposes,reviewed_revision=null,status=case when cardinality(purposes)=0 then 'withdrawn' else status end,revision=revision+1,updated_at=now() where id=cid returning * into c;
  else
   if actor_role<>'admin' or not exists(select 1 from private.edu_campus_access_records e where e.id=c.enrollment_id and e.cohort_id=(p_command->>'cohortId')::uuid) then raise exception 'Administrator scope required' using errcode='42501'; end if;
   decision:=p_command->>'decision';note:=btrim(p_command->>'note');
   if c.status='withdrawn' or cardinality(c.allowed_purposes)=0 or decision is null or decision not in ('approved','changes_requested','rejected') or note is null or char_length(note) not between 1 and 2000 then raise exception 'Invalid review' using errcode='23514'; end if;
   update public.edu_campus_business_cases set status=decision,reviewed_revision=case when decision='approved' then revision+1 else null end,reviewer_note=note,reviewed_at=now(),revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 insert into public.edu_campus_business_case_events(id,case_id,actor_id,action,command_hash,purposes,decision,note) values(rid,cid,p_actor,action,hash,c.allowed_purposes,decision,coalesce(note,''));
 return to_jsonb(c);
end;
$$;

create or replace function public.edu_campus_business_learning_cases(p_actor uuid,p_enrollment uuid,p_industry text,p_cursor uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare cohort uuid; entries jsonb;
begin
 if p_industry is null or p_industry not in ('온라인 상품','전문 서비스','교육·콘텐츠') then raise exception 'Choose industry' using errcode='23514'; end if;
 if not public.edu_campus_business_review_available(p_enrollment,p_actor) then raise exception 'Enrollment unavailable' using errcode='42501'; end if;
 select e.cohort_id into cohort from private.edu_campus_access_records e where e.id=p_enrollment and e.user_id=p_actor;
 select coalesce(jsonb_agg(q.item order by q.id),'[]'::jsonb) into entries from (
  select c.id,jsonb_build_object('id',c.id,'title',c.title,'industry',c.industry,'summary',c.summary,'limits',c.limits,'revision',c.revision,'reviewedAt',c.reviewed_at,
   'evidence',(select coalesce(jsonb_agg(jsonb_build_object('kind',v->'kind','title',v->'title','revision',v->'revision','payload',v->'payload')),'[]'::jsonb) from jsonb_array_elements(c.evidence) v)) as item
  from public.edu_campus_business_cases c join private.edu_campus_access_records e on e.id=c.enrollment_id
  where e.cohort_id=cohort and c.industry=p_industry and c.status='approved' and c.reviewed_revision=c.revision and c.reviewed_at is not null
   and c.consent_version='moonshot-case-selection-v2' and 'cohort_learning'=any(c.allowed_purposes)
   and public.edu_campus_business_review_available(c.enrollment_id,c.user_id) and (p_cursor is null or c.id>p_cursor)
   -- Changed/archived originals cannot silently become a newly approved example. Resubmit the current selection.
   and not exists(select 1 from jsonb_array_elements(c.evidence) v where not exists(
    select 1 from public.edu_campus_business_records r where r.id=(v->>'recordId')::uuid and r.user_id=c.user_id and r.enrollment_id=c.enrollment_id and r.archived_at is null and r.revision=(v->>'revision')::integer))
  order by c.id limit 21
 ) q;
 return jsonb_build_object('items',case when jsonb_array_length(entries)>20 then entries-20 else entries end,'nextCursor',case when jsonb_array_length(entries)>20 then entries->19->>'id' else null end);
end;$$;

create or replace function public.edu_campus_business_review_available(eid uuid,uid uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.id=eid and e.user_id=uid and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()));
$$;

create or replace function public.edu_campus_create_study(p_actor uuid,p_enrollment uuid,p_id uuid,p_title text,p_goal text,p_start timestamptz,p_end timestamptz,p_capacity integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e private.edu_campus_access_records;s public.edu_campus_office_sessions;
begin
 perform 1 from public.profiles where id=p_actor and status='active' for update;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 select * into e from private.edu_campus_access_records where id=p_enrollment and user_id=p_actor and status='active' and revoked_at is null and (access_starts_at is null or access_starts_at<=now()) and (access_ends_at is null or access_ends_at>now());
 if e.id is null or not exists(select 1 from public.courses c join public.cohorts h on h.course_id=c.id and h.id=e.cohort_id and h.archived_at is null where c.id=e.course_id and c.status='published' and c.archived_at is null) then raise exception 'Access denied' using errcode='42501';end if;
 if length(btrim(p_title)) not between 1 and 120 or length(btrim(p_goal)) not between 1 and 300 or p_start<now()-interval '1 minute' or p_start>now()+interval '30 days' or p_end<=p_start or p_end>p_start+interval '3 hours' or p_capacity not between 2 and 12 then raise exception 'Invalid study' using errcode='23514';end if;
 select * into s from public.edu_campus_office_sessions where id=p_id;
 if s.id is not null then if row(s.created_by,s.cohort_id,s.title,s.shared_goal,s.starts_at,s.ends_at,s.capacity,s.student_created) is distinct from row(p_actor,e.cohort_id,p_title,p_goal,p_start,p_end,p_capacity,true) then raise exception 'Study retry mismatch' using errcode='23514';end if;return to_jsonb(s);end if;
 if (select count(*) from public.edu_campus_office_sessions where created_by=p_actor and student_created and status='open' and ends_at>now())>=3 then raise exception 'Too many studies' using errcode='23514';end if;
 insert into public.edu_campus_office_sessions(id,cohort_id,title,kind,starts_at,ends_at,capacity,created_by,student_created,shared_goal) values(p_id,e.cohort_id,p_title,'study',p_start,p_end,p_capacity,p_actor,true,p_goal) returning * into s;
 return to_jsonb(s);
end;$$;

create or replace function public.edu_campus_observe_space_http(p_actor uuid,p_cohort uuid,p_status integer,p_elapsed integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare bucket timestamptz;
begin
 if p_status is null or p_status<200 or p_status>599 or p_elapsed is null or p_elapsed<0 or p_elapsed>120000 then raise exception 'Invalid observation' using errcode='23514';end if;
 if not exists(select 1 from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.user_id=p_actor and e.cohort_id=p_cohort and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())) then return false;end if;
 bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/300)*300);
 insert into public.edu_campus_space_http_metrics(cohort_id,bucket_at,requests,client_errors,server_errors,slow_requests,total_ms,max_ms)
 values(p_cohort,bucket,1,(p_status between 400 and 499)::int,(p_status>=500)::int,(p_elapsed>=3000)::int,p_elapsed,p_elapsed)
 on conflict(cohort_id,bucket_at) do update set requests=edu_campus_space_http_metrics.requests+1,
 client_errors=edu_campus_space_http_metrics.client_errors+excluded.client_errors,server_errors=edu_campus_space_http_metrics.server_errors+excluded.server_errors,
 slow_requests=edu_campus_space_http_metrics.slow_requests+excluded.slow_requests,total_ms=edu_campus_space_http_metrics.total_ms+excluded.total_ms,max_ms=greatest(edu_campus_space_http_metrics.max_ms,excluded.max_ms);
 return true;
end;$$;

create or replace function public.edu_campus_office_queue(p_actor uuid,p_session uuid,p_kind text,p_booking uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_campus_office_sessions;b public.edu_campus_office_bookings;
begin
 select * into s from public.edu_campus_office_sessions where id=p_session for update;
 if s.id is null or s.status<>'open' or now()<s.starts_at-interval '10 minutes' or now()>=s.ends_at then raise exception 'Session unavailable' using errcode='23514';end if;
 if p_kind in('checkin','leave') then
  if not exists(select 1 from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id and p.status='active' join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null where e.user_id=p_actor and e.cohort_id=s.cohort_id and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())) then raise exception 'Access denied' using errcode='42501';end if;
  select * into b from public.edu_campus_office_bookings where session_id=s.id and user_id=p_actor and status='reserved';
  if b.id is null then raise exception 'Reservation required' using errcode='42501';end if;
  if p_kind='checkin' and b.queue_status='none' then update public.edu_campus_office_bookings set queue_status='waiting',checked_in_at=clock_timestamp() where id=b.id returning * into b;
  elsif p_kind='leave' and b.queue_status in('waiting','called') then update public.edu_campus_office_bookings set queue_status='none',checked_in_at=null where id=b.id returning * into b;end if;
 elsif p_kind in('call','done','present') then
  if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in('admin','staff')) then raise exception 'Access denied' using errcode='42501';end if;
  if p_kind='present' then update public.edu_campus_office_sessions set live_until=least(ends_at,now()+interval '5 minutes') where id=s.id returning * into s;return to_jsonb(s);end if;
  select * into b from public.edu_campus_office_bookings where id=p_booking and session_id=s.id and status='reserved';
  if b.id is null or (p_kind='call' and b.queue_status not in('waiting','called')) or (p_kind='done' and b.queue_status not in('called','done')) then raise exception 'Queue changed' using errcode='23514';end if;
  update public.edu_campus_office_bookings set queue_status=case p_kind when 'call' then 'called' else 'done' end where id=b.id returning * into b;
 else raise exception 'Invalid queue action' using errcode='23514';end if;
 return to_jsonb(b);
end;$$;

create or replace function public.edu_campus_reserve_office(p_actor uuid,p_session uuid,p_request uuid,p_cancel boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_campus_office_sessions; b public.edu_campus_office_bookings; n integer;
begin
 select * into s from public.edu_campus_office_sessions where id=p_session for update;
 if s.id is null then raise exception 'Session unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from private.edu_campus_access_records e join public.profiles p on p.id=e.user_id and p.status='active' join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null where e.user_id=p_actor and e.cohort_id=s.cohort_id and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())) then raise exception 'Access denied' using errcode='42501'; end if;
 select * into b from public.edu_campus_office_bookings where session_id=s.id and user_id=p_actor;
 if p_cancel then update public.edu_campus_office_bookings set status='cancelled',queue_status='none',checked_in_at=null where id=b.id returning * into b; return to_jsonb(b); end if;
 if s.status<>'open' or s.ends_at<=now() then raise exception 'Session unavailable' using errcode='23514';end if;
 if b.status='reserved' then return to_jsonb(b);end if;
 select count(*) into n from public.edu_campus_office_bookings where session_id=s.id and status='reserved';
 if n>=s.capacity then raise exception 'Session full' using errcode='23514';end if;
 if b.id is not null then update public.edu_campus_office_bookings set status='reserved' where id=b.id returning * into b;
 else insert into public.edu_campus_office_bookings(id,session_id,user_id,status) values(p_request,s.id,p_actor,'reserved') returning * into b;end if;
 return to_jsonb(b);
end;$$;

create function private.edu_campus_has_access(p_access uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid()) and exists (
    select 1 from private.edu_campus_access_records e
    join public.profiles p on p.id = e.user_id and p.status = 'active'
    join public.courses c on c.id = e.course_id and c.status = 'published' and c.archived_at is null
    join public.cohorts h on h.id = e.cohort_id and h.course_id = e.course_id and h.archived_at is null
    where e.id = p_access and e.user_id = p_user and e.status = 'active' and e.revoked_at is null
      and (e.access_starts_at is null or e.access_starts_at <= now())
      and (e.access_ends_at is null or e.access_ends_at > now())
  );
$$;
revoke all on function private.edu_campus_has_access(uuid,uuid) from public, anon, authenticated;
grant execute on function private.edu_campus_has_access(uuid,uuid) to authenticated;

create or replace function public.edu_campus_focus_has_scope(p_enrollment_id uuid, p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.edu_campus_has_access(p_enrollment_id, p_user_id);
$$;

create or replace function public.edu_campus_support_scope(p_enrollment uuid, p_user uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.edu_campus_has_access(p_enrollment, p_user);
$$;

create or replace function public.edu_campus_business_has_scope(eid uuid, uid uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.edu_campus_has_access(eid, uid);
$$;

create or replace function public.edu_campus_space_member(p_cohort uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_cohort in (select private.edu_campus_space_cohorts());
$$;

-- The invoker retains student curriculum RLS. The partner branch checks the
-- course and the exact published lesson without requiring a student enrollment.
create function private.edu_campus_partner_lesson_version(p_access uuid, p_lesson uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select l.updated_at
  from public.edu_external_partner_access a
  join public.curriculum_weeks w on w.course_id = a.course_id and w.is_published and w.archived_at is null
  join public.curriculum_lessons l on l.week_id = w.id and l.is_published and l.archived_at is null
  where a.id = p_access and l.id = p_lesson and private.edu_campus_has_access(a.id, a.user_id);
$$;
revoke all on function private.edu_campus_partner_lesson_version(uuid,uuid) from public, anon, authenticated;
grant execute on function private.edu_campus_partner_lesson_version(uuid,uuid) to authenticated;

create function public.edu_campus_lesson_version(p_access uuid, p_lesson uuid)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select l.updated_at from public.curriculum_lessons l
    join public.curriculum_weeks w on w.id = l.week_id and w.is_published
    join public.enrollments e on e.id = p_access and e.course_id = w.course_id
    where e.user_id = (select auth.uid()) and l.id = p_lesson and l.is_published
  ), private.edu_campus_partner_lesson_version(p_access, p_lesson));
$$;
revoke all on function public.edu_campus_lesson_version(uuid,uuid) from public, anon, authenticated;
grant execute on function public.edu_campus_lesson_version(uuid,uuid) to authenticated;

alter policy edu_campus_focus_insert on public.edu_campus_focus_sessions
  with check (user_id = (select auth.uid()) and public.edu_campus_focus_has_scope(enrollment_id, user_id)
    and public.edu_campus_lesson_version(enrollment_id, lesson_id) = lesson_version::timestamptz);

alter policy support_request_own_insert on public.edu_campus_support_requests
  with check (user_id = (select auth.uid()) and public.edu_campus_support_scope(enrollment_id, user_id)
    and status = 'open' and revision = 1
    and (lesson_id is null or public.edu_campus_lesson_version(enrollment_id, lesson_id) = lesson_version::timestamptz));

alter policy campus_office_read on public.edu_campus_office_sessions
  using (cohort_id in (select private.edu_campus_space_cohorts()));

create function public.edu_campus_participant_cohort(p_actor uuid, p_access uuid)
returns uuid language sql stable security invoker set search_path = '' as $$
  select cohort_id from private.edu_campus_access_records
  where id = p_access and user_id = p_actor;
$$;
revoke all on function public.edu_campus_participant_cohort(uuid,uuid) from public, anon, authenticated;
grant execute on function public.edu_campus_participant_cohort(uuid,uuid) to service_role;

-- Admin review keeps cohort filtering and pagination for both grant types.
create view public.edu_campus_admin_case_scopes with (security_invoker = true) as
  select c.*, a.cohort_id from public.edu_campus_business_cases c
  join private.edu_campus_access_records a on a.id = c.enrollment_id;
revoke all on public.edu_campus_admin_case_scopes from public, anon, authenticated;
grant select on public.edu_campus_admin_case_scopes to service_role;

-- Keep the existing admin embed usable before cutover or after a code rollback.
create function public.enrollments(public.edu_campus_business_cases)
returns setof public.enrollments rows 1
language sql stable security invoker set search_path = '' as $$
  select e.* from public.enrollments e where e.id = ($1).enrollment_id;
$$;
revoke all on function public.enrollments(public.edu_campus_business_cases) from public, anon, authenticated;
grant execute on function public.enrollments(public.edu_campus_business_cases) to service_role;

notify pgrst, 'reload schema';
commit;
