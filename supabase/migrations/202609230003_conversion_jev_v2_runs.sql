begin;

-- Experimental v2 answers are separate from the immutable v1 run and first
-- human calibration. One reservation per source run prevents duplicate calls.
create table public.edu_conversion_jev_v2_runs (
  id uuid primary key default gen_random_uuid(),
  v1_run_id uuid not null unique references public.edu_conversion_runs(id) on delete restrict,
  case_id uuid not null references public.edu_conversion_cases(id) on delete restrict,
  calibration_review_id uuid not null references public.edu_conversion_reviews(id) on delete restrict,
  input_version integer not null check (input_version > 0),
  contract_version integer not null default 2 check (contract_version = 2),
  status text not null check (status in ('pending','completed','failed')),
  result jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (result is not null))
);

create index edu_conversion_jev_v2_case_created on public.edu_conversion_jev_v2_runs(case_id,created_at desc);

alter table public.edu_conversion_jev_v2_runs enable row level security;
revoke all on public.edu_conversion_jev_v2_runs from public,anon,authenticated;
grant select,insert,update on public.edu_conversion_jev_v2_runs to service_role;

commit;
