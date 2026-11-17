-- Campus support is independent of the existing lesson question/AI service.
-- Candidate only: no implicit deployment or environment activation.
begin;
create function public.edu_campus_support_scope(p_enrollment uuid,p_user uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_user=(select auth.uid()) and exists(
 select 1 from public.enrollments e join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.id=p_enrollment and e.user_id=p_user and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()));
$$;
revoke all on function public.edu_campus_support_scope(uuid,uuid) from public,anon;
grant execute on function public.edu_campus_support_scope(uuid,uuid) to authenticated;

create table public.edu_campus_support_requests(
 id uuid primary key,user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 lesson_id uuid,lesson_version text,category text not null check(category in('understanding','tool','decision','feedback','time')),
 title text not null check(length(btrim(title)) between 1 and 120),tried text not null default '' check(length(tried)<=2000),
 question text not null check(length(btrim(question)) between 1 and 4000),context_url text not null default '' check(length(context_url)<=2000 and (context_url='' or context_url~'^https?://')),
 status text not null default 'open' check(status in('open','in_progress','resolved','withdrawn')),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((lesson_id is null and lesson_version is null) or (lesson_id is not null and length(lesson_version) between 1 and 160)));
create index edu_campus_support_enrollment on public.edu_campus_support_requests(enrollment_id,created_at desc,id);
create index edu_campus_support_owner on public.edu_campus_support_requests(user_id,created_at desc,id);
alter table public.edu_campus_support_requests enable row level security;
revoke all on public.edu_campus_support_requests from public,anon,authenticated;
grant select,insert on public.edu_campus_support_requests to authenticated;
grant all on public.edu_campus_support_requests to service_role;
create policy support_request_own_select on public.edu_campus_support_requests for select to authenticated using(user_id=(select auth.uid()) and public.edu_campus_support_scope(enrollment_id,user_id));
create policy support_request_own_insert on public.edu_campus_support_requests for insert to authenticated with check(user_id=(select auth.uid()) and public.edu_campus_support_scope(enrollment_id,user_id) and status='open' and revision=1 and (lesson_id is null or exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id and w.is_published join public.enrollments e on e.id=enrollment_id and e.course_id=w.course_id where l.id=lesson_id and l.is_published and l.updated_at=lesson_version::timestamptz)));

create function public.edu_campus_support_created_clock() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.created_at:=now();new.updated_at:=now();return new;end;$$;
revoke all on function public.edu_campus_support_created_clock() from public,anon,authenticated;
create trigger support_created_clock before insert on public.edu_campus_support_requests for each row execute function public.edu_campus_support_created_clock();

create table public.edu_campus_support_actions(
 id uuid primary key,request_id uuid not null references public.edu_campus_support_requests(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),kind text not null check(kind in('reply','handover','status')),
 content text not null check(length(btrim(content)) between 1 and 4000),destination_status text not null check(destination_status in('open','in_progress','resolved')),created_at timestamptz not null default now());
create index edu_campus_support_actions_request on public.edu_campus_support_actions(request_id,created_at,id);
create index edu_campus_support_actions_actor on public.edu_campus_support_actions(actor_id);
alter table public.edu_campus_support_actions enable row level security;
revoke all on public.edu_campus_support_actions from public,anon,authenticated;
grant select on public.edu_campus_support_actions to authenticated;
grant all on public.edu_campus_support_actions to service_role;
create policy support_action_own_read on public.edu_campus_support_actions for select to authenticated using(kind<>'handover' and exists(select 1 from public.edu_campus_support_requests r where r.id=request_id and r.user_id=(select auth.uid())));

create table public.edu_campus_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 mode text not null default 'quiet' check(mode in('quiet','together','help')),reminders boolean not null default false,alumni boolean not null default false,
 known_lessons jsonb not null default '{}'::jsonb check(jsonb_typeof(known_lessons)='object' and octet_length(known_lessons::text)<=120000),updated_at timestamptz not null default now());
alter table public.edu_campus_preferences enable row level security;
revoke all on public.edu_campus_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.edu_campus_preferences to authenticated;
grant all on public.edu_campus_preferences to service_role;
create policy campus_preferences_owner on public.edu_campus_preferences for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')) with check(user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));

create table public.edu_campus_office_sessions(
 id uuid primary key,cohort_id uuid not null references public.cohorts(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),kind text not null check(kind in('mentor','study','demo')),
 starts_at timestamptz not null,ends_at timestamptz not null,capacity integer not null check(capacity between 1 and 100),
 location_url text not null default '' check(length(location_url)<=2000 and (location_url='' or location_url~'^https?://')),
 student_created boolean not null default false,shared_goal text not null default '' check(length(shared_goal)<=300),live_until timestamptz,
 status text not null default 'open' check(status in('open','cancelled')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),check(ends_at>starts_at and ends_at<=starts_at+interval '8 hours'));
create index campus_office_cohort on public.edu_campus_office_sessions(cohort_id,starts_at);
create index campus_office_author on public.edu_campus_office_sessions(created_by);
alter table public.edu_campus_office_sessions enable row level security;
revoke all on public.edu_campus_office_sessions from public,anon,authenticated;
grant select on public.edu_campus_office_sessions to authenticated;
grant all on public.edu_campus_office_sessions to service_role;
create policy campus_office_read on public.edu_campus_office_sessions for select to authenticated using(exists(select 1 from public.enrollments e where e.cohort_id=edu_campus_office_sessions.cohort_id and public.edu_campus_support_scope(e.id,e.user_id)));

create table public.edu_campus_office_bookings(
 id uuid primary key,session_id uuid not null references public.edu_campus_office_sessions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,status text not null check(status in('reserved','cancelled')),
 checked_in_at timestamptz,queue_status text not null default 'none' check(queue_status in('none','waiting','called','done')),
 created_at timestamptz not null default now(),unique(session_id,user_id));
create index campus_office_bookings_owner on public.edu_campus_office_bookings(user_id,created_at);
alter table public.edu_campus_office_bookings enable row level security;
revoke all on public.edu_campus_office_bookings from public,anon,authenticated;
grant select on public.edu_campus_office_bookings to authenticated;
grant all on public.edu_campus_office_bookings to service_role;
create policy campus_booking_own on public.edu_campus_office_bookings for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));

-- Server-only, invoker RPC: caller verifies active session; DB repeats membership and
-- locks the session row so two concurrent reservations cannot exceed capacity.
create function public.edu_campus_reserve_office(p_actor uuid,p_session uuid,p_request uuid,p_cancel boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_campus_office_sessions; b public.edu_campus_office_bookings; n integer;
begin
 select * into s from public.edu_campus_office_sessions where id=p_session for update;
 if s.id is null then raise exception 'Session unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id and p.status='active' join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null where e.user_id=p_actor and e.cohort_id=s.cohort_id and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())) then raise exception 'Access denied' using errcode='42501'; end if;
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
revoke all on function public.edu_campus_reserve_office(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.edu_campus_reserve_office(uuid,uuid,uuid,boolean) to service_role;

-- Atomic admin follow-up, append-only evidence plus revision-checked status.
create function public.edu_campus_support_followup(p_actor uuid,p_request uuid,p_action uuid,p_revision integer,p_kind text,p_content text,p_status text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_campus_support_requests; a public.edu_campus_support_actions;
begin
 if p_kind not in('reply','handover','status') or length(btrim(p_content)) not between 1 and 4000 or p_status not in('open','in_progress','resolved') then raise exception 'Invalid followup' using errcode='23514';end if;
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and p.role in('admin','staff')) then raise exception 'Access denied' using errcode='42501';end if;
 select * into r from public.edu_campus_support_requests where id=p_request for update;
 if r.id is null then raise exception 'Request unavailable' using errcode='P0002';end if;
 select * into a from public.edu_campus_support_actions where id=p_action;
 if a.id is not null then if a.request_id<>p_request or a.actor_id<>p_actor or a.kind<>p_kind or a.content<>p_content or a.destination_status<>p_status then raise exception 'Duplicate action mismatch' using errcode='23514';end if;return to_jsonb(r);end if;
 if r.revision<>p_revision or r.status='withdrawn' then raise exception 'Revision conflict' using errcode='23514';end if;
 insert into public.edu_campus_support_actions(id,request_id,actor_id,kind,content,destination_status) values(p_action,p_request,p_actor,p_kind,p_content,p_status);
 update public.edu_campus_support_requests set status=p_status,revision=revision+1,updated_at=now() where id=p_request returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function public.edu_campus_support_followup(uuid,uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.edu_campus_support_followup(uuid,uuid,uuid,integer,text,text,text) to service_role;
create function public.edu_campus_create_study(p_actor uuid,p_enrollment uuid,p_id uuid,p_title text,p_goal text,p_start timestamptz,p_end timestamptz,p_capacity integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.enrollments;s public.edu_campus_office_sessions;
begin
 perform 1 from public.profiles where id=p_actor and status='active' for update;
 if not found then raise exception 'Access denied' using errcode='42501';end if;
 select * into e from public.enrollments where id=p_enrollment and user_id=p_actor and status='active' and revoked_at is null and (access_starts_at is null or access_starts_at<=now()) and (access_ends_at is null or access_ends_at>now());
 if e.id is null or not exists(select 1 from public.courses c join public.cohorts h on h.course_id=c.id and h.id=e.cohort_id and h.archived_at is null where c.id=e.course_id and c.status='published' and c.archived_at is null) then raise exception 'Access denied' using errcode='42501';end if;
 if length(btrim(p_title)) not between 1 and 120 or length(btrim(p_goal)) not between 1 and 300 or p_start<now()-interval '1 minute' or p_start>now()+interval '30 days' or p_end<=p_start or p_end>p_start+interval '3 hours' or p_capacity not between 2 and 12 then raise exception 'Invalid study' using errcode='23514';end if;
 select * into s from public.edu_campus_office_sessions where id=p_id;
 if s.id is not null then if row(s.created_by,s.cohort_id,s.title,s.shared_goal,s.starts_at,s.ends_at,s.capacity,s.student_created) is distinct from row(p_actor,e.cohort_id,p_title,p_goal,p_start,p_end,p_capacity,true) then raise exception 'Study retry mismatch' using errcode='23514';end if;return to_jsonb(s);end if;
 if (select count(*) from public.edu_campus_office_sessions where created_by=p_actor and student_created and status='open' and ends_at>now())>=3 then raise exception 'Too many studies' using errcode='23514';end if;
 insert into public.edu_campus_office_sessions(id,cohort_id,title,kind,starts_at,ends_at,capacity,created_by,student_created,shared_goal) values(p_id,e.cohort_id,p_title,'study',p_start,p_end,p_capacity,p_actor,true,p_goal) returning * into s;
 return to_jsonb(s);
end;$$;
revoke all on function public.edu_campus_create_study(uuid,uuid,uuid,text,text,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.edu_campus_create_study(uuid,uuid,uuid,text,text,timestamptz,timestamptz,integer) to service_role;

create function public.edu_campus_office_queue(p_actor uuid,p_session uuid,p_kind text,p_booking uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_campus_office_sessions;b public.edu_campus_office_bookings;
begin
 select * into s from public.edu_campus_office_sessions where id=p_session for update;
 if s.id is null or s.status<>'open' or now()<s.starts_at-interval '10 minutes' or now()>=s.ends_at then raise exception 'Session unavailable' using errcode='23514';end if;
 if p_kind in('checkin','leave') then
  if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id and p.status='active' join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null where e.user_id=p_actor and e.cohort_id=s.cohort_id and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())) then raise exception 'Access denied' using errcode='42501';end if;
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
revoke all on function public.edu_campus_office_queue(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_campus_office_queue(uuid,uuid,text,uuid) to service_role;

-- An operator's workload calendar, not a student due date or access gate.
create table public.edu_campus_review_windows(
 id uuid primary key,cohort_id uuid not null references public.cohorts(id) on delete cascade,
 mission_id uuid not null references public.curriculum_missions(id) on delete cascade,
 planned_at timestamptz not null,status text not null default 'planned' check(status in('planned','cancelled')),
 revision integer not null default 1 check(revision>0),created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(cohort_id,mission_id));
create index campus_review_windows_mission on public.edu_campus_review_windows(mission_id);
create index campus_review_windows_creator on public.edu_campus_review_windows(created_by);
alter table public.edu_campus_review_windows enable row level security;
revoke all on public.edu_campus_review_windows from public,anon,authenticated;
grant all on public.edu_campus_review_windows to service_role;

commit;
