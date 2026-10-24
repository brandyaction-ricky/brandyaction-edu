-- Separate from legacy acquisition surveys. Only authenticated server handlers may write.
create table public.edu_onboarding_steps (
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  step text not null check (step in ('telegram','app','orientation','learning')),
  confirmation_value text not null default '' check (length(confirmation_value) <= 100),
  comment text not null default '' check (length(comment) <= 1000),
  confirmed_at timestamptz not null default now(),
  primary key (order_id,step),
  check ((step = 'learning' and length(btrim(comment)) > 0) or (step <> 'learning' and comment = ''))
);
create index edu_onboarding_steps_user_idx on public.edu_onboarding_steps(user_id);
alter table public.edu_onboarding_steps enable row level security;
revoke all on public.edu_onboarding_steps from public,anon,authenticated,service_role;
grant select,insert,update on public.edu_onboarding_steps to service_role;
