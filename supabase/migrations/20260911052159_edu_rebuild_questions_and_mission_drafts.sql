begin;
create table public.edu_questions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 course_id uuid references public.courses(id) on delete set null,
 title text not null check (length(title) between 1 and 200),
 content text not null check (length(content) between 1 and 10000),
 answer text,
 status text not null default 'open' check (status in ('open','answered')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index edu_questions_user_idx on public.edu_questions(user_id,created_at desc);
create index edu_questions_course_idx on public.edu_questions(course_id);
alter table public.edu_questions enable row level security;
create policy edu_questions_owner_read on public.edu_questions for select to authenticated using ((select auth.uid())=user_id);
create policy edu_questions_admin on public.edu_questions for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.edu_questions to authenticated;
grant all on public.edu_questions to service_role;

create table public.edu_mission_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 mission_id uuid not null references public.curriculum_missions(id) on delete cascade,
 content text not null default '',
 url text not null default '',
 updated_at timestamptz not null default now(),
 unique (enrollment_id,mission_id)
);
create index edu_mission_drafts_user_idx on public.edu_mission_drafts(user_id);
create index edu_mission_drafts_mission_idx on public.edu_mission_drafts(mission_id);
alter table public.edu_mission_drafts enable row level security;
create policy edu_mission_drafts_owner_read on public.edu_mission_drafts for select to authenticated using ((select auth.uid())=user_id);
grant select on public.edu_mission_drafts to authenticated;
grant all on public.edu_mission_drafts to service_role;
commit;
