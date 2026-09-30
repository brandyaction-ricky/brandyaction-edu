-- Optional, explicitly public nickname/message; never derive these from legal names.
create table public.edu_member_encouragements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  public_name text not null default '',
  message text not null default '',
  revision uuid not null,
  updated_at timestamptz not null default now(),
  constraint encouragement_public_name check (char_length(public_name) <= 40 and public_name = btrim(public_name)),
  constraint encouragement_message check (char_length(message) <= 80 and message = btrim(message)),
  constraint encouragement_named_message check (message = '' or public_name <> '')
);
alter table public.edu_member_encouragements enable row level security;
revoke all on public.edu_member_encouragements from public, anon, authenticated;
grant select, insert, update on public.edu_member_encouragements to service_role;
comment on table public.edu_member_encouragements is 'Server-only owner edits; API publishes only opted-in nickname/message from active members. Blank message withdraws publication.';
