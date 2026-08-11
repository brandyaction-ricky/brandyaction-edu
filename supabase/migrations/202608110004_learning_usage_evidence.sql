begin;

create table if not exists public.learning_usage_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  item_type text not null check (item_type in ('material_download', 'live_join', 'replay_view')),
  item_id uuid not null,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  use_count integer not null default 1 check (use_count > 0),
  unique (enrollment_id, item_type, item_id)
);

alter table public.learning_usage_events enable row level security;
revoke all on public.learning_usage_events from public, anon, authenticated;
grant all on public.learning_usage_events to service_role;

commit;
