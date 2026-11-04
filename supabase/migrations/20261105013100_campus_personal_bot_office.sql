begin;
create table public.edu_campus_personal_offices(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 document jsonb not null check(octet_length(document::text)<=18000 and document->>'schemaVersion'='1' and jsonb_typeof(document->'profiles')='array' and jsonb_array_length(document->'profiles') between 1 and 8),
 revision uuid not null, updated_at timestamptz not null default now()
);
alter table public.edu_campus_personal_offices enable row level security;
revoke all on public.edu_campus_personal_offices from anon,authenticated;
grant select,insert,update on public.edu_campus_personal_offices to authenticated;
grant all on public.edu_campus_personal_offices to service_role;
create policy personal_office_owner on public.edu_campus_personal_offices for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
commit;
