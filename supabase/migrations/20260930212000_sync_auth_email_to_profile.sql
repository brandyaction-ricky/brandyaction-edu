begin;

-- Keep the member directory aligned only after Supabase Auth has confirmed
-- the new login email. Orders and enrollments remain attached to auth.uid().
create or replace function public.edu_sync_auth_email_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = coalesce(new.email, '')
     where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.edu_sync_auth_email_to_profile() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.edu_sync_auth_email_to_profile();

commit;
