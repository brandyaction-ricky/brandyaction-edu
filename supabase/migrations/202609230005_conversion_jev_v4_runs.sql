begin;

-- Keep the new question contract apart from v1/v2 and the first human review.
-- A reservation is unique per source inquiry, including failed attempts.
create table public.edu_conversion_jev_v4_runs (
  id uuid primary key default gen_random_uuid(),
  v1_run_id uuid not null unique references public.edu_conversion_runs(id) on delete restrict,
  case_id uuid not null references public.edu_conversion_cases(id) on delete restrict,
  calibration_review_id uuid not null references public.edu_conversion_reviews(id) on delete restrict,
  input_version integer not null check (input_version > 0),
  contract_version integer not null default 4 check (contract_version = 4),
  status text not null check (status in ('pending','completed','failed')),
  result jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (result is not null))
);

create index edu_conversion_jev_v4_case_created on public.edu_conversion_jev_v4_runs(case_id,created_at desc);

alter table public.edu_conversion_jev_v4_runs enable row level security;
revoke all on public.edu_conversion_jev_v4_runs from public,anon,authenticated,service_role;
grant select,insert,update on public.edu_conversion_jev_v4_runs to service_role;

commit;
