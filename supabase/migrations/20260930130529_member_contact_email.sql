begin;

alter table public.profiles add column contact_email text;
alter table public.profiles add constraint profiles_contact_email_valid check (
  contact_email is null or (
    char_length(contact_email) <= 254
    and contact_email = lower(btrim(contact_email))
    and contact_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);
comment on column public.profiles.contact_email is
  'Optional delivery email. Does not change Auth identity or historical order email. Used for future purchase notices.';

-- Existing profiles_update_own RLS still restricts authenticated users to themselves.
-- No UPDATE privilege is added for login email, role, status or consent.
grant update (contact_email) on public.profiles to authenticated;

commit;
