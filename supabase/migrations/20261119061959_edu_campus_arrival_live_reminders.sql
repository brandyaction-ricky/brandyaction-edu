begin;

create table public.edu_campus_arrival_live_reminders (
  event_id text not null check (event_id ~ '^moonshot-live-[0-9]{8}$'),
  phone text not null check (phone ~ '^010[0-9]{8}$'),
  consent_version smallint not null check (consent_version > 0),
  consented_at timestamptz not null default now(),
  primary key (event_id, phone)
);

create index edu_campus_arrival_live_reminders_latest
  on public.edu_campus_arrival_live_reminders (event_id, consented_at desc, phone);

alter table public.edu_campus_arrival_live_reminders enable row level security;
revoke all on public.edu_campus_arrival_live_reminders from public, anon, authenticated, service_role;
grant select, insert on public.edu_campus_arrival_live_reminders to service_role;

comment on table public.edu_campus_arrival_live_reminders is
  'Event-specific SMS opt-ins from the Moonshot welcome lounge. Separate from general marketing consent and CRM sending queues.';

commit;
