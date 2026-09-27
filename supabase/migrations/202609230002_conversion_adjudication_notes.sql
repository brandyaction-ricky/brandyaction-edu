begin;

-- A second opinion is an append-only review of a disagreement, never a
-- correction to the first blind calibration or a customer-facing decision.
create table public.edu_conversion_adjudication_notes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.edu_conversion_runs(id) on delete restrict,
  calibration_review_id uuid not null references public.edu_conversion_reviews(id) on delete restrict,
  dimension text not null check (dimension in ('purchase_intent','primary_barrier','purchase_readiness','next_action')),
  assessment text not null check (assessment in ('human_better_supported','jev_better_supported','both_plausible','neither_supported','insufficient_evidence')),
  basis text not null check (basis in ('explicit_signal','interpretation','category_gap','missing_context')),
  rationale text not null check (length(btrim(rationale)) between 10 and 1000),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (actor_id,request_id)
);

create index edu_conversion_adjudication_run_created
  on public.edu_conversion_adjudication_notes(run_id,created_at desc);

alter table public.edu_conversion_adjudication_notes enable row level security;
revoke all on public.edu_conversion_adjudication_notes from public,anon,authenticated;
grant select,insert on public.edu_conversion_adjudication_notes to service_role;

commit;
