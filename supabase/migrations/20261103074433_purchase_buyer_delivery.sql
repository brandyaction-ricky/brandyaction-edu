create table public.edu_purchase_delivery_batches (
  id uuid primary key,
  cohort_id uuid not null references public.cohorts(id),
  created_by uuid not null references public.profiles(id),
  channel text not null check (channel in ('sms','lms','alimtalk','email')),
  template_id uuid references public.crm_templates(id),
  subject text,
  content text not null,
  room_link text,
  template_hash text,
  recipient_ids uuid[] not null check (cardinality(recipient_ids) between 1 and 100),
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','sending','completed','failed','unknown','cancelled')),
  accepted_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  unknown_count integer not null default 0,
  check ((channel = 'email' and template_id is null and subject is not null and template_hash is null)
      or (channel <> 'email' and template_id is not null and subject is null and template_hash is not null))
);
create index edu_purchase_delivery_due_idx on public.edu_purchase_delivery_batches(scheduled_at, id) where status = 'scheduled';
create index edu_purchase_delivery_cohort_idx on public.edu_purchase_delivery_batches(cohort_id, created_at desc);
alter table public.edu_purchase_delivery_batches enable row level security;
revoke all on public.edu_purchase_delivery_batches from public, anon, authenticated;
grant select, insert, update on public.edu_purchase_delivery_batches to service_role;

alter table public.crm_message_logs
  add column purchase_batch_id uuid references public.edu_purchase_delivery_batches(id);
create unique index edu_purchase_delivery_receipt_uidx on public.crm_message_logs(purchase_batch_id, member_id)
  where purchase_batch_id is not null;
