begin;

create table public.edu_purchase_onboarding (
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  survey_room text not null check (survey_room in ('paid', 'organic', 'unknown')),
  survey_answered_at timestamptz not null default now(),
  tg_path text check (tg_path in ('existing', 'new')),
  tg_link_clicked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index edu_purchase_onboarding_user_idx on public.edu_purchase_onboarding(user_id, survey_answered_at desc);

alter table public.edu_purchase_onboarding enable row level security;
revoke all on public.edu_purchase_onboarding from public, anon, authenticated, service_role;
grant select, insert, update on public.edu_purchase_onboarding to service_role;

commit;
