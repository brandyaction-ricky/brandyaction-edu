-- Synthetic dependency schema ONLY. Run in a new in-memory/isolated test database.
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table public.profiles(id uuid primary key, role text not null, status text not null default 'active', full_name text);
create table public.site_settings(key text primary key, value jsonb not null);
create table public.mission_submissions(
  id uuid primary key, status text not null default 'submitted',
  reviewed_at timestamptz, reviewed_by uuid references public.profiles(id), reviewer_feedback text
);
create table public.audit_logs(
  id bigint generated always as identity primary key, actor_user_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id text,
  before_data jsonb, after_data jsonb, ip_address inet, created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);
alter table public.audit_logs enable row level security;
create policy admins_read_audit_logs on public.audit_logs for select to authenticated using (false);
grant usage on schema public to service_role,authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on public.audit_logs to authenticated;
insert into public.profiles(id,role,full_name) values
 ('00000000-0000-4000-8000-000000000001','admin','가상 검토자 A'),
 ('00000000-0000-4000-8000-000000000002','staff','가상 검토자 B'),
 ('00000000-0000-4000-8000-000000000003','member','가상 회원');
insert into public.site_settings values ('edu_staff_permissions_00000000-0000-4000-8000-000000000002','{"members":true}');
