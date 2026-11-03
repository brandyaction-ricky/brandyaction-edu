-- Local candidate. No production/DEV deployment performed.
-- Enable only after private Realtime authorization and actual cohort tests pass.
begin;
create function public.edu_campus_space_member(p_cohort uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.enrollments e
 join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.user_id=(select auth.uid()) and e.cohort_id=p_cohort and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()));
$$;
revoke all on function public.edu_campus_space_member(uuid) from public,anon;
grant execute on function public.edu_campus_space_member(uuid) to authenticated;
create table public.edu_campus_space_profiles(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 nickname text not null check(char_length(btrim(nickname)) between 1 and 24),
 gender text not null check(gender in ('male','female')),
 coat text not null check(coat ~ '^#[0-9a-fA-F]{6}$'),
 status text not null check(status in ('quiet','joinable','help','working')),
 low_motion boolean not null default false, photo_opt_in boolean not null default false,
 note text not null default '' check(char_length(note)<=2000),
 desk text not null default '' check(char_length(desk)<=120)
);
alter table public.edu_campus_space_profiles enable row level security;
revoke all on public.edu_campus_space_profiles from public,anon,authenticated;
grant select,insert,update on public.edu_campus_space_profiles to authenticated;
create policy campus_space_profile_read on public.edu_campus_space_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy campus_space_profile_add on public.edu_campus_space_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy campus_space_profile_edit on public.edu_campus_space_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create table public.edu_campus_space_presence(
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null,
 nickname text not null check(char_length(btrim(nickname)) between 1 and 24),
 gender text not null check(gender in ('male','female')),coat text not null check(coat ~ '^#[0-9a-fA-F]{6}$'),
 status text not null check(status in ('quiet','joinable','help','working')),
 photo_opt_in boolean not null default false,
 focus_until timestamptz, focus_mode integer not null default 0 check(focus_mode in (0,3,5,25,50)),
 touched_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '75 seconds',
 primary key(cohort_id,user_id)
);
create index edu_campus_space_presence_expiry on public.edu_campus_space_presence(cohort_id,expires_at);
alter table public.edu_campus_space_presence enable row level security;
revoke all on public.edu_campus_space_presence from public,anon,authenticated;
grant select,insert,update,delete on public.edu_campus_space_presence to authenticated;
create policy campus_space_presence_read on public.edu_campus_space_presence for select to authenticated using(user_id=(select auth.uid()) or public.edu_campus_space_member(cohort_id));
create policy campus_space_presence_add on public.edu_campus_space_presence for insert to authenticated with check(user_id=(select auth.uid()) and public.edu_campus_space_member(cohort_id));
create policy campus_space_presence_edit on public.edu_campus_space_presence for update to authenticated using(user_id=(select auth.uid()) and public.edu_campus_space_member(cohort_id)) with check(user_id=(select auth.uid()) and public.edu_campus_space_member(cohort_id));
create policy campus_space_presence_leave on public.edu_campus_space_presence for delete to authenticated using(user_id=(select auth.uid()));
create function public.edu_campus_space_presence_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.cohort_id::text,74));
 if (select count(*) from public.edu_campus_space_presence p where p.cohort_id=new.cohort_id and p.user_id<>new.user_id and p.expires_at>now())>=24 then raise exception 'Campus capacity reached' using errcode='54000';end if;
 if TG_OP='UPDATE' then
  if row(new.cohort_id,new.user_id) is distinct from row(old.cohort_id,old.user_id) then raise exception 'Presence identity is immutable' using errcode='23514'; end if;
  if old.touched_at>clock_timestamp()-interval '4 seconds' then raise exception 'Presence rate limit' using errcode='P0001'; end if;
 end if;
 new.touched_at=clock_timestamp();new.expires_at=new.touched_at+interval '75 seconds';
 if new.focus_until is not null and (new.focus_until<new.touched_at-interval '5 seconds' or new.focus_until>new.touched_at+interval '51 minutes') then raise exception 'Invalid focus time' using errcode='23514';end if;
 return new;
end;$$;
create trigger campus_space_presence_guard before insert or update on public.edu_campus_space_presence for each row execute function public.edu_campus_space_presence_guard();
create table public.edu_campus_space_seats(
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 seat_id text not null check(seat_id in ('desk-1','desk-2','desk-3')),
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null, expires_at timestamptz not null default now()+interval '75 seconds',
 primary key(cohort_id,seat_id),unique(cohort_id,user_id)
);
alter table public.edu_campus_space_seats enable row level security;
revoke all on public.edu_campus_space_seats from public,anon,authenticated;
grant select,insert,update,delete on public.edu_campus_space_seats to authenticated;
create policy campus_space_seat_read on public.edu_campus_space_seats for select to authenticated using(user_id=(select auth.uid()) or public.edu_campus_space_member(cohort_id));
create policy campus_space_seat_add on public.edu_campus_space_seats for insert to authenticated with check(user_id=(select auth.uid()) and public.edu_campus_space_member(cohort_id));
create policy campus_space_seat_claim on public.edu_campus_space_seats for update to authenticated using(public.edu_campus_space_member(cohort_id) and (user_id=(select auth.uid()) or expires_at<now())) with check(user_id=(select auth.uid()) and public.edu_campus_space_member(cohort_id));
create policy campus_space_seat_leave on public.edu_campus_space_seats for delete to authenticated using(user_id=(select auth.uid()));
create function public.edu_campus_space_seat_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and row(new.cohort_id,new.seat_id) is distinct from row(old.cohort_id,old.seat_id) then raise exception 'Seat identity is immutable' using errcode='23514';end if;
 if not exists(select 1 from public.edu_campus_space_presence p where p.user_id=new.user_id and p.cohort_id=new.cohort_id and p.session_id=new.session_id and p.expires_at>now()) then raise exception 'Join before taking a seat' using errcode='23514';end if;
 new.expires_at=clock_timestamp()+interval '75 seconds';return new;
end;$$;
create trigger campus_space_seat_guard before insert or update on public.edu_campus_space_seats for each row execute function public.edu_campus_space_seat_guard();
-- Moving between seats is atomic: failure preserves the previous seat.
create function public.edu_campus_space_claim_seat(p_cohort uuid,p_session uuid,p_seat text)
returns void language plpgsql security invoker set search_path='' as $$
declare target public.edu_campus_space_seats;actor uuid;
begin
 actor=(select auth.uid());
 if actor is null or not public.edu_campus_space_member(p_cohort) then raise exception 'Membership required' using errcode='42501';end if;
 if p_seat not in ('desk-1','desk-2','desk-3') then raise exception 'Invalid seat' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_cohort::text,75));
 if not exists(select 1 from public.edu_campus_space_presence p where p.cohort_id=p_cohort and p.user_id=actor and p.session_id=p_session and p.expires_at>now()) then raise exception 'Current session required' using errcode='42501';end if;
 select * into target from public.edu_campus_space_seats where cohort_id=p_cohort and seat_id=p_seat;
 if found and target.user_id<>actor and target.expires_at>now() then raise exception 'Seat occupied' using errcode='23505';end if;
 delete from public.edu_campus_space_seats where cohort_id=p_cohort and user_id=actor and seat_id<>p_seat;
 insert into public.edu_campus_space_seats(cohort_id,seat_id,user_id,session_id) values(p_cohort,p_seat,actor,p_session)
 on conflict(cohort_id,seat_id)do update set user_id=excluded.user_id,session_id=excluded.session_id;
end;$$;
revoke all on function public.edu_campus_space_claim_seat(uuid,uuid,text) from public,anon;
grant execute on function public.edu_campus_space_claim_seat(uuid,uuid,text) to authenticated;
create table public.edu_campus_space_chat(
 id uuid primary key,cohort_id uuid not null references public.cohorts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null,nickname text not null default '',
 body text not null check(char_length(btrim(body)) between 1 and 300),created_at timestamptz not null default now()
);
create index campus_space_chat_recent on public.edu_campus_space_chat(cohort_id,created_at desc);
create index campus_space_chat_rate on public.edu_campus_space_chat(user_id,created_at desc);
alter table public.edu_campus_space_chat enable row level security;
revoke all on public.edu_campus_space_chat from public,anon,authenticated;
grant select,insert,delete on public.edu_campus_space_chat to authenticated;
create policy campus_space_chat_read on public.edu_campus_space_chat for select to authenticated using(public.edu_campus_space_member(cohort_id) and created_at>now()-interval '24 hours');
create policy campus_space_chat_send on public.edu_campus_space_chat for insert to authenticated with check(user_id=(select auth.uid()) and public.edu_campus_space_member(cohort_id));
create policy campus_space_chat_delete on public.edu_campus_space_chat for delete to authenticated using(user_id=(select auth.uid()));
create function public.edu_campus_space_chat_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,73));
 select p.nickname into new.nickname from public.edu_campus_space_presence p where p.cohort_id=new.cohort_id and p.user_id=new.user_id and p.session_id=new.session_id and p.expires_at>now();
 if new.nickname is null then raise exception 'Join before chatting' using errcode='23514';end if;
 if (select count(*) from public.edu_campus_space_chat c where c.user_id=new.user_id and c.created_at>now()-interval '1 minute')>=12 then raise exception 'Chat rate limit' using errcode='P0001';end if;
 new.created_at=clock_timestamp();return new;
end;$$;
create trigger campus_space_chat_guard before insert on public.edu_campus_space_chat for each row execute function public.edu_campus_space_chat_guard();
-- Authenticated actor is bound to the topic, never the client supplied payload.
-- Requires Realtime private-channel configuration. Do not ALTER realtime-owned tables.
create function public.edu_campus_space_topic(p_topic text,p_write boolean)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare parts text[];cohort uuid;actor uuid;
begin
 parts=string_to_array(p_topic,':');
 if array_length(parts,1)<>3 or parts[1]<>'campus-space' then return false;end if;
 begin cohort=parts[2]::uuid;actor=parts[3]::uuid;exception when invalid_text_representation then return false;end;
 return public.edu_campus_space_member(cohort) and (not p_write or actor=(select auth.uid()))
 and exists(select 1 from public.edu_campus_space_presence p where p.cohort_id=cohort and p.user_id=actor and p.expires_at>now());
end;$$;
revoke all on function public.edu_campus_space_topic(text,boolean) from public,anon;
grant execute on function public.edu_campus_space_topic(text,boolean) to authenticated;
create policy campus_space_actor_receive on realtime.messages for select to authenticated using(extension='broadcast' and public.edu_campus_space_topic((select realtime.topic()),false));
create policy campus_space_actor_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.edu_campus_space_topic((select realtime.topic()),true));
-- Protect this namespace even if the project already has a permissive legacy policy.
create policy campus_space_receive_guard on realtime.messages as restrictive for select to authenticated
using(case when (select realtime.topic()) like 'campus-space:%' then extension='broadcast' and public.edu_campus_space_topic((select realtime.topic()),false) else true end);
create policy campus_space_send_guard on realtime.messages as restrictive for insert to authenticated
with check(case when (select realtime.topic()) like 'campus-space:%' then extension='broadcast' and public.edu_campus_space_topic((select realtime.topic()),true) else true end);
-- Explicit maintenance entry point for a scheduler running as the database owner.
-- Invoker privileges only. Configure hourly before enabling the live room; never expose to clients.
create function public.edu_campus_space_prune() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from public.edu_campus_space_chat where created_at < now()-interval '7 days';
 delete from public.edu_campus_space_seats where expires_at < now()-interval '1 day';
 delete from public.edu_campus_space_presence where expires_at < now()-interval '1 day';
end;$$;
revoke all on function public.edu_campus_space_prune() from public,anon,authenticated;
-- Revoke unused public trigger-function invocation, while keeping triggers effective.
revoke all on function public.edu_campus_space_presence_guard(),public.edu_campus_space_seat_guard(),public.edu_campus_space_chat_guard() from public,anon,authenticated;
commit;
