begin;
-- One invalidation counter per enrollment, no job IDs, prompts, drafts or event history.
create table public.edu_campus_office_inbox_signals (
 enrollment_id uuid primary key references public.enrollments(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 version bigint not null
);
alter table public.edu_campus_office_inbox_signals enable row level security;
revoke all on public.edu_campus_office_inbox_signals from public, anon, authenticated;
grant select on public.edu_campus_office_inbox_signals to authenticated;
create policy office_signal_student on public.edu_campus_office_inbox_signals for select to authenticated
 using(owner_id=(select auth.uid()) and private.campus_office_scope(enrollment_id,owner_id));
create function private.campus_office_bump_inbox() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.edu_campus_office_inbox_signals as s(enrollment_id,owner_id,version)
 values(new.enrollment_id,new.owner_id,1)
 on conflict(enrollment_id) do update set version=s.version+1,owner_id=excluded.owner_id;
 return null;
end; $$;
revoke all on function private.campus_office_bump_inbox() from public, anon, authenticated;
create trigger office_signal_created after insert on public.edu_campus_office_jobs for each row execute function private.campus_office_bump_inbox();
create trigger office_signal_revision after update of revision on public.edu_campus_office_jobs for each row
 when (new.revision is distinct from old.revision) execute function private.campus_office_bump_inbox();
alter publication supabase_realtime add table public.edu_campus_office_inbox_signals;
notify pgrst,'reload schema';
commit;
