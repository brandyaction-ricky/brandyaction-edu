-- Only the database publishes roster invalidations. No names or user IDs travel on this topic.
create function public.edu_campus_roster_reader(topic text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case when topic ~ '^campus-roster:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.edu_campus_space_member(split_part(topic, ':', 2)::uuid) else false end
$$;
revoke all on function public.edu_campus_roster_reader(text) from public, anon;
grant execute on function public.edu_campus_roster_reader(text) to authenticated;

create policy campus_roster_read on realtime.messages for select to authenticated
using (extension = 'broadcast' and public.edu_campus_roster_reader((select realtime.topic())));
create policy campus_roster_read_guard on realtime.messages as restrictive for select to public
using (case when (select realtime.topic()) like 'campus-roster:%'
  then auth.role() = 'authenticated' and extension = 'broadcast'
    and public.edu_campus_roster_reader((select realtime.topic()))
  else true end);
create policy campus_roster_send_guard on realtime.messages as restrictive for insert to public
with check (coalesce((select realtime.topic()), '') not like 'campus-roster:%');

create function public.edu_campus_notify_roster() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cohort uuid;
begin
  if tg_op = 'DELETE' then
    cohort := old.cohort_id;
  else
    cohort := new.cohort_id;
  end if;
  perform realtime.send('{}'::jsonb, 'roster-changed', 'campus-roster:' || cohort::text, true);
  return null;
exception when others then
  -- The existing heartbeat can still recover the list if broadcasting is unavailable.
  raise warning 'campus roster broadcast unavailable (%)', sqlstate;
  return null;
end;
$$;
revoke all on function public.edu_campus_notify_roster() from public, anon, authenticated;
create trigger campus_roster_membership after insert or delete on public.edu_campus_space_presence
for each row execute function public.edu_campus_notify_roster();
create trigger campus_roster_replacement after update on public.edu_campus_space_presence
for each row when (old.session_id is distinct from new.session_id or old.expires_at <= now() and new.expires_at > now())
execute function public.edu_campus_notify_roster();
