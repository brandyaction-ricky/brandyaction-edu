-- Local candidate only. Requires the space presence migration.
begin;
alter table public.edu_campus_space_profiles add column accessory text not null default 'none' check(accessory in ('none','glasses','headset'));
alter table public.edu_campus_space_profiles add column desk_theme text not null default 'orbital' check(desk_theme in ('orbital','night','garden'));
alter table public.edu_campus_space_presence add column accessory text not null default 'none' check(accessory in ('none','glasses','headset'));
create table public.edu_campus_space_controls(
 cohort_id uuid primary key references public.cohorts(id) on delete cascade,
 announcement text not null default '' check(char_length(announcement)<=500),
 paused boolean not null default false,
 closed_zones text[] not null default '{}' check(cardinality(closed_zones)<=6 and closed_zones<@array['desk','mission','board','chat','terrace','launch']::text[]),
 revision integer not null default 1 check(revision>0),
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
alter table public.edu_campus_space_controls enable row level security;
revoke all on public.edu_campus_space_controls from public,anon,authenticated;
grant select on public.edu_campus_space_controls to authenticated;
grant select,insert,update on public.edu_campus_space_controls to service_role;
create policy campus_space_controls_read on public.edu_campus_space_controls for select to authenticated using(public.edu_campus_space_member(cohort_id));
create function public.edu_campus_space_open(p_cohort uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select public.edu_campus_space_member(p_cohort) and not exists(select 1 from public.edu_campus_space_controls where cohort_id=p_cohort and paused);
$$;
revoke all on function public.edu_campus_space_open(uuid) from public,anon;
grant execute on function public.edu_campus_space_open(uuid) to authenticated;
create function public.edu_campus_space_zone_open(p_cohort uuid,p_zone text) returns boolean language sql stable security invoker set search_path='' as $$
 select public.edu_campus_space_open(p_cohort) and not exists(select 1 from public.edu_campus_space_controls where cohort_id=p_cohort and p_zone=any(closed_zones));
$$;
revoke all on function public.edu_campus_space_zone_open(uuid,text) from public,anon;
grant execute on function public.edu_campus_space_zone_open(uuid,text) to authenticated;
-- Restrictive policies cannot be bypassed by existing permissive membership policies.
create policy campus_space_presence_open_insert on public.edu_campus_space_presence as restrictive for insert to authenticated with check(public.edu_campus_space_open(cohort_id));
create policy campus_space_presence_open_update on public.edu_campus_space_presence as restrictive for update to authenticated using(public.edu_campus_space_open(cohort_id)) with check(public.edu_campus_space_open(cohort_id));
create policy campus_space_seat_open_insert on public.edu_campus_space_seats as restrictive for insert to authenticated with check(public.edu_campus_space_zone_open(cohort_id,'desk'));
create policy campus_space_seat_open_update on public.edu_campus_space_seats as restrictive for update to authenticated using(public.edu_campus_space_open(cohort_id)) with check(public.edu_campus_space_open(cohort_id));
create policy campus_space_chat_open_insert on public.edu_campus_space_chat as restrictive for insert to authenticated with check(public.edu_campus_space_zone_open(cohort_id,'chat'));
create or replace function public.edu_campus_space_topic(p_topic text,p_write boolean)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare parts text[];cohort uuid;actor uuid;
begin
 parts=string_to_array(p_topic,':');
 if array_length(parts,1)<>3 or parts[1]<>'campus-space' then return false;end if;
 begin cohort=parts[2]::uuid;actor=parts[3]::uuid;exception when invalid_text_representation then return false;end;
 return public.edu_campus_space_open(cohort) and (not p_write or actor=(select auth.uid()))
 and exists(select 1 from public.edu_campus_space_presence p where p.cohort_id=cohort and p.user_id=actor and p.expires_at>now());
end;$$;
commit;
