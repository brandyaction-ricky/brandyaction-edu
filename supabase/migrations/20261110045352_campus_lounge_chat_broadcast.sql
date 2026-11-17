-- Reuse the cohort's private topic. Clients fetch the messages with their own credentials.
create function public.edu_campus_notify_lounge_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cohort uuid;
begin
  if tg_op = 'DELETE' then
    cohort := old.cohort_id;
  else
    cohort := new.cohort_id;
  end if;
  perform realtime.send('{}'::jsonb, 'chat-changed', 'campus-roster:' || cohort::text, true);
  return null;
exception when others then
  raise warning 'campus lounge chat broadcast unavailable (%)', sqlstate;
  return null;
end;
$$;
revoke all on function public.edu_campus_notify_lounge_chat() from public, anon, authenticated;
create trigger campus_lounge_chat_changed after insert or delete on public.edu_campus_space_chat
for each row execute function public.edu_campus_notify_lounge_chat();
