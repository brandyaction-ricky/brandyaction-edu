create table public.edu_member_mvp (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_mvp boolean not null default false,
  border_color text,
  revision uuid not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint mvp_color check (border_color is null or border_color ~ '^#[0-9A-F]{6}$'),
  constraint mvp_removed_color check (is_mvp or border_color is null)
);
create index edu_member_mvp_updated_by_idx on public.edu_member_mvp(updated_by);
create table public.edu_mvp_settings (
  id boolean primary key default true check (id),
  color text not null check (color ~ '^#[0-9A-F]{6}$'),
  revision uuid not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index edu_mvp_settings_updated_by_idx on public.edu_mvp_settings(updated_by);
alter table public.edu_member_mvp enable row level security;
alter table public.edu_mvp_settings enable row level security;
revoke all on public.edu_member_mvp, public.edu_mvp_settings from public, anon, authenticated;
grant select, insert, update on public.edu_member_mvp, public.edu_mvp_settings to service_role;
comment on table public.edu_member_mvp is 'Manual recognition only; does not change roles, enrollment, progress, discounts or messaging.';
