begin;

-- Confirmed product policy: paid and administrator-granted course content has
-- no access expiry. Refund/suspension rules still revoke access independently.
update public.enrollments
set access_ends_at = null
where status = 'active' and access_ends_at is not null;

create or replace function public.enforce_unlimited_active_enrollment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    new.access_ends_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists enrollments_unlimited_active_access on public.enrollments;
create trigger enrollments_unlimited_active_access
before insert or update of status, access_ends_at on public.enrollments
for each row execute function public.enforce_unlimited_active_enrollment();

revoke execute on function public.enforce_unlimited_active_enrollment() from public, anon, authenticated;

commit;
