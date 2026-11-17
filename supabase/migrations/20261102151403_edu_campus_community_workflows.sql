begin;
create schema if not exists private;

create table public.edu_campus_posts (
 id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 alias text not null check(length(alias) between 2 and 24),
 kind text not null check(kind in ('portfolio','feedback','process','failure','talent_offer','talent_request','demo_day')),
 title text not null check(length(title) between 2 and 100), body text not null check(length(body) between 10 and 6000),
 url text not null default '', image_urls text[] not null default '{}', lesson_id uuid,
 visibility text not null default 'private' check(visibility in ('private','cohort')),
 revision integer not null default 1 check(revision>0), hidden boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index edu_campus_posts_cohort_updated on public.edu_campus_posts(cohort_id,updated_at desc,id);
create index edu_campus_posts_owner on public.edu_campus_posts(owner_id,enrollment_id);
create table public.edu_campus_post_revisions (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.edu_campus_posts(id) on delete cascade,
 revision integer not null, title text not null, body text not null, url text not null, image_urls text[] not null,
 visibility text not null check(visibility in ('private','cohort')), change_note text not null check(length(change_note) between 5 and 500),
 created_at timestamptz not null default now(), unique(post_id,revision)
);
create table public.edu_campus_comments (
 id uuid primary key, post_id uuid not null references public.edu_campus_posts(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 alias text not null check(length(alias) between 2 and 24), body text not null check(length(body) between 10 and 2000),
 post_revision integer not null, hidden boolean not null default false, created_at timestamptz not null default now()
);
create index edu_campus_comments_post on public.edu_campus_comments(post_id,created_at,id);
create index edu_campus_comments_author on public.edu_campus_comments(author_id,post_id);
create table public.edu_campus_feedback_acknowledgments (
 comment_id uuid primary key references public.edu_campus_comments(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 useful boolean not null, decision text not null check(decision in ('pending','apply','keep')),
 reason text not null check(length(reason)<=1000), applied_revision integer,
 revision integer not null check(revision>0), updated_at timestamptz not null default now(),
 check((decision='apply' and applied_revision>=2 and length(reason)>=5) or (decision='keep' and applied_revision is null and length(reason)>=5) or (decision='pending' and applied_revision is null))
);
create table public.edu_campus_blocks (
 owner_id uuid not null references public.profiles(id) on delete cascade,
 target_id uuid not null references public.profiles(id) on delete cascade,
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(owner_id,target_id,cohort_id), check(owner_id<>target_id)
);
create index edu_campus_blocks_target on public.edu_campus_blocks(target_id,owner_id,cohort_id);
create table public.edu_campus_reports (
 id uuid primary key, reporter_id uuid not null references public.profiles(id) on delete cascade,
 post_id uuid not null references public.edu_campus_posts(id) on delete cascade,
 comment_id uuid references public.edu_campus_comments(id) on delete cascade,
 reason text not null check(length(reason) between 5 and 1000), status text not null default 'open' check(status in ('open','resolved')),
 created_at timestamptz not null default now()
);
create index edu_campus_reports_status on public.edu_campus_reports(status,created_at);
create table public.edu_campus_moderation_log (
 id uuid primary key, actor_id uuid not null references public.profiles(id), post_id uuid not null references public.edu_campus_posts(id) on delete cascade,
 comment_id uuid, action text not null, reason text not null, created_at timestamptz not null default now()
);
create table public.edu_campus_reward_rules (
 version text primary key, mission_xp integer not null, useful_xp integer not null, useful_required integer not null,
 revisions_required integer not null, cohort_goal integer not null, created_at timestamptz not null default now()
);
insert into public.edu_campus_reward_rules values ('moonshot-v1',100,20,1,1,5,now());
create table public.edu_campus_launches (
 id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 rule_version text not null references public.edu_campus_reward_rules(version), evidence jsonb not null,
 created_at timestamptz not null default now(), unique(enrollment_id,rule_version)
);
create index edu_campus_launches_cohort on public.edu_campus_launches(cohort_id,rule_version);
-- Idempotent mutation receipts are private; no request contents reach other users.
create table private.edu_campus_community_receipts (
 actor_id uuid not null references public.profiles(id) on delete cascade, request_id uuid not null,
 command jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(actor_id,request_id)
);

create function private.campus_community_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and status='active');
$$;
create function private.campus_community_scope(p_cohort uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
 join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id
 where e.user_id=(select auth.uid()) and e.cohort_id=p_cohort and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and p.status='active' and c.status='published' and c.archived_at is null and h.archived_at is null);
$$;
create function private.campus_community_blocked(p_other uuid,p_cohort uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.edu_campus_blocks b where b.cohort_id=p_cohort and
 ((b.owner_id=(select auth.uid()) and b.target_id=p_other) or (b.target_id=(select auth.uid()) and b.owner_id=p_other)));
$$;
create function private.campus_community_read_post(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.campus_community_active() and exists(select 1 from public.edu_campus_posts p where p.id=p_post and
 ((private.mission_has_scope('members') and (p.visibility='cohort' or exists(select 1 from public.edu_campus_reports r where r.post_id=p.id))) or (private.campus_community_scope(p.cohort_id) and
 (p.owner_id=(select auth.uid()) or (p.visibility='cohort' and not p.hidden and not private.campus_community_blocked(p.owner_id,p.cohort_id))))));
$$;
create function private.campus_community_read_comment(p_comment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.edu_campus_comments c join public.edu_campus_posts p on p.id=c.post_id
 where c.id=p_comment and private.campus_community_read_post(p.id) and (private.mission_has_scope('members') or
 (not c.hidden and not private.campus_community_blocked(c.author_id,p.cohort_id))));
$$;
create function private.campus_community_url(p_url text) returns boolean language sql immutable set search_path='' as $$
 select p_url='' or (length(p_url)<=1200 and p_url ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#]|$)' and p_url !~ '[[:space:]\\]' and p_url !~* '^https://[^/]*(\.local|\.internal|\.test|\.invalid)([/?#]|$)');
$$;

alter table public.edu_campus_posts enable row level security;
alter table public.edu_campus_post_revisions enable row level security;
alter table public.edu_campus_comments enable row level security;
alter table public.edu_campus_feedback_acknowledgments enable row level security;
alter table public.edu_campus_blocks enable row level security;
alter table public.edu_campus_reports enable row level security;
alter table public.edu_campus_moderation_log enable row level security;
alter table public.edu_campus_reward_rules enable row level security;
alter table public.edu_campus_launches enable row level security;
alter table private.edu_campus_community_receipts enable row level security;
revoke all on public.edu_campus_posts,public.edu_campus_post_revisions,public.edu_campus_comments,public.edu_campus_feedback_acknowledgments,public.edu_campus_blocks,public.edu_campus_reports,public.edu_campus_moderation_log,public.edu_campus_reward_rules,public.edu_campus_launches from public,anon,authenticated;
revoke all on private.edu_campus_community_receipts from public,anon,authenticated;
grant select on public.edu_campus_posts,public.edu_campus_post_revisions,public.edu_campus_comments,public.edu_campus_feedback_acknowledgments,public.edu_campus_blocks,public.edu_campus_reports,public.edu_campus_moderation_log,public.edu_campus_reward_rules,public.edu_campus_launches to authenticated;
create policy campus_posts_read on public.edu_campus_posts for select to authenticated using(private.campus_community_read_post(id));
create policy campus_revisions_read on public.edu_campus_post_revisions for select to authenticated using(private.campus_community_read_post(post_id) and
 (visibility='cohort' or exists(select 1 from public.edu_campus_posts p where p.id=post_id and p.owner_id=(select auth.uid()))));
create policy campus_comments_read on public.edu_campus_comments for select to authenticated using(private.campus_community_read_comment(id));
create policy campus_ack_read on public.edu_campus_feedback_acknowledgments for select to authenticated using(private.campus_community_read_comment(comment_id));
create policy campus_blocks_read on public.edu_campus_blocks for select to authenticated using(owner_id=(select auth.uid()) and private.campus_community_scope(cohort_id));
create policy campus_reports_read on public.edu_campus_reports for select to authenticated using(private.campus_community_active() and (reporter_id=(select auth.uid()) or private.mission_has_scope('members')));
create policy campus_moderation_read on public.edu_campus_moderation_log for select to authenticated using(private.mission_has_scope('members'));
create policy campus_rules_read on public.edu_campus_reward_rules for select to authenticated using(private.campus_community_active());
create policy campus_launches_read on public.edu_campus_launches for select to authenticated using(owner_id=(select auth.uid()) and private.campus_community_scope(cohort_id));

-- A bounded aggregate reads proof rows without disclosing another learner's submission or profile.
create function private.campus_community_reward_state(p_enrollment uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.enrollments; r public.edu_campus_reward_rules; n_required integer; n_approved integer; n_useful integer; n_applied integer; points integer; reasons jsonb:='[]'; badges jsonb:='[]'; claimed timestamptz; collective integer;
begin
 select * into e from public.enrollments where id=p_enrollment and user_id=(select auth.uid());
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
create function public.edu_campus_community_rewards(p_enrollment uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.campus_community_reward_state(p_enrollment); $$;

-- Single atomic writer: only the current actor, explicit scope and allowed fields are accepted.
-- Definer is required to append immutable history/receipts and acknowledge someone else's comment
-- without granting direct UPDATE over evidence or any direct mutation over rewards.
create function private.campus_community_mutate(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=(select auth.uid()); request_id uuid; action text; e public.enrollments; p public.edu_campus_posts; cm public.edu_campus_comments; ak public.edu_campus_feedback_acknowledgments; prev private.edu_campus_community_receipts; result jsonb; images text[]; val text; target uuid; evidence jsonb; v_revision integer;
begin
 if not private.campus_community_active() or jsonb_typeof(c)<>'object' or octet_length(c::text)>24000 then raise exception 'invalid' using errcode='42501'; end if;
 request_id:=(c->>'requestId')::uuid; action:=c->>'action';
 if request_id is null or action not in ('create','revise','comment','acknowledge','block','unblock','report','moderate','launch') then raise exception 'invalid command' using errcode='23514'; end if;
 -- Serializes only a duplicate idempotency key, never the whole class.
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 if action='moderate' then
   if not private.mission_has_scope('members') then raise exception 'scope' using errcode='42501'; end if;
 else
   select * into e from public.enrollments where id=(c->>'enrollmentId')::uuid and user_id=actor;
   if e.id is null or not private.campus_community_scope(e.cohort_id) or e.status<>'active' or e.revoked_at is not null or (e.access_starts_at is not null and e.access_starts_at>now()) or (e.access_ends_at is not null and e.access_ends_at<=now()) then raise exception 'scope' using errcode='42501'; end if;
 end if;
 select * into prev from private.edu_campus_community_receipts where actor_id=actor and private.edu_campus_community_receipts.request_id=request_id;
 if prev.request_id is not null then if prev.command<>c then raise exception 'idempotency conflict' using errcode='40001'; end if; return prev.result; end if;
 if action in ('revise','comment','acknowledge','report','moderate') then
   select * into p from public.edu_campus_posts where id=(c->>'postId')::uuid for update;
   if p.id is null or not private.campus_community_read_post(p.id) or (action<>'moderate' and p.cohort_id<>e.cohort_id) then raise exception 'scope' using errcode='42501'; end if;
   if p.hidden and action<>'moderate' then raise exception 'hidden' using errcode='42501'; end if;
 end if;
 if action in ('revise','comment','acknowledge') and (c->>'expectedRevision' is null or (c->>'expectedRevision')::integer<0) then raise exception 'revision required' using errcode='23514'; end if;
 if action in ('create','revise') then
   if c->>'kind' not in ('portfolio','feedback','process','failure','talent_offer','talent_request','demo_day') or c->>'visibility' not in ('private','cohort') or length(btrim(c->>'title')) not between 2 and 100 or length(btrim(c->>'body')) not between 10 and 6000 or length(btrim(c->>'alias')) not between 2 and 24 or coalesce(jsonb_typeof(c->'imageUrls'),'')<>'array' or jsonb_array_length(c->'imageUrls')>4 or not private.campus_community_url(coalesce(c->>'url','')) then raise exception 'input' using errcode='23514'; end if;
   select coalesce(array_agg(value),'{}') into images from jsonb_array_elements_text(c->'imageUrls');
   foreach val in array images loop if val='' or not private.campus_community_url(val) then raise exception 'image url' using errcode='23514'; end if; end loop;
   if c->>'lessonId' is not null and not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=(c->>'lessonId')::uuid and w.course_id=e.course_id and w.is_published and l.is_published) then raise exception 'lesson scope' using errcode='42501'; end if;
   if action='create' then
     insert into public.edu_campus_posts(id,owner_id,enrollment_id,cohort_id,alias,kind,title,body,url,image_urls,lesson_id,visibility) values(request_id,actor,e.id,e.cohort_id,btrim(c->>'alias'),c->>'kind',btrim(c->>'title'),btrim(c->>'body'),coalesce(c->>'url',''),images,(c->>'lessonId')::uuid,c->>'visibility') returning * into p;
   else
     if p.owner_id<>actor or p.kind<>c->>'kind' or p.enrollment_id<>e.id then raise exception 'owner' using errcode='42501'; end if;
     if p.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001'; end if;
     if length(btrim(c->>'changeNote')) not between 5 and 500 then raise exception 'change note' using errcode='23514'; end if;
     update public.edu_campus_posts set alias=btrim(c->>'alias'),title=btrim(c->>'title'),body=btrim(c->>'body'),url=coalesce(c->>'url',''),image_urls=images,lesson_id=(c->>'lessonId')::uuid,visibility=c->>'visibility',revision=revision+1,updated_at=now() where id=p.id returning * into p;
   end if;
   insert into public.edu_campus_post_revisions(post_id,revision,title,body,url,image_urls,visibility,change_note) values(p.id,p.revision,p.title,p.body,p.url,p.image_urls,p.visibility,case when action='create' then '첫 결과물 저장' else btrim(c->>'changeNote') end);
   result:=jsonb_build_object('postId',p.id,'revision',p.revision);
 elsif action='comment' then
   if p.visibility<>'cohort' or p.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001'; end if;
   if length(btrim(c->>'body')) not between 10 and 2000 or length(btrim(c->>'alias')) not between 2 and 24 then raise exception 'input' using errcode='23514'; end if;
   -- Rate-limits repeated comments independently of retries and rejects identical text.
   if exists(select 1 from public.edu_campus_comments where author_id=actor and post_id=p.id and (body=btrim(c->>'body') or created_at>now()-interval '10 seconds')) then raise exception 'duplicate comment' using errcode='40001'; end if;
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
   if coalesce(ak.revision,0) is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001'; end if;
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
   if exists(select 1 from public.edu_campus_reports where reporter_id=actor and post_id=p.id and comment_id is not distinct from (c->>'commentId')::uuid and status='open') then raise exception 'duplicate report' using errcode='40001'; end if;
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
   if jsonb_array_length(evidence->'missionApprovals') is distinct from (evidence->>'approvedMissions')::integer then raise exception 'eligibility changed' using errcode='40001'; end if;
   insert into public.edu_campus_launches(id,owner_id,enrollment_id,cohort_id,rule_version,evidence) values(request_id,actor,e.id,e.cohort_id,'moonshot-v1',evidence) on conflict(enrollment_id,rule_version) do nothing;
   result:=jsonb_build_object('launched',true);
 end if;
 insert into private.edu_campus_community_receipts(actor_id,request_id,command,result) values(actor,request_id,c,result);
 return result;
end;
$$;
create function public.edu_campus_community_mutate(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.campus_community_mutate(p_command); $$;
revoke all on function private.campus_community_active(),private.campus_community_scope(uuid),private.campus_community_blocked(uuid,uuid),private.campus_community_read_post(uuid),private.campus_community_read_comment(uuid),private.campus_community_url(text),private.campus_community_reward_state(uuid),private.campus_community_mutate(jsonb),public.edu_campus_community_mutate(jsonb),public.edu_campus_community_rewards(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.campus_community_active(),private.campus_community_scope(uuid),private.campus_community_blocked(uuid,uuid),private.campus_community_read_post(uuid),private.campus_community_read_comment(uuid),private.campus_community_reward_state(uuid),private.campus_community_mutate(jsonb),public.edu_campus_community_mutate(jsonb),public.edu_campus_community_rewards(uuid) to authenticated;
comment on table public.edu_campus_posts is 'Private by default. Cohort sharing includes only revisions saved as shared; never public to anonymous visitors. Image URLs are references, not fetched by this service.';
comment on table public.edu_campus_launches is 'Immutable historical eligibility proof. This is not a timer reward, a certificate, a sales claim or current curriculum completion.';
commit;
