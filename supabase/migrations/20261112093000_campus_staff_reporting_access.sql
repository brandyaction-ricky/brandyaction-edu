begin;
-- Staff and administrators use the office, bot pairing and reporting without a pilot seat.
-- Students still need the global switch or the expiring pilot. Only the production pilot design has this function.
do $$
begin
  if to_regprocedure('private.campus_reporting_pilot_matches(uuid,uuid,text)') is null then return; end if;
  execute $fn$
    create or replace function private.campus_reporting_pilot_matches(p_owner uuid, p_enrollment uuid, p_url text)
    returns boolean language sql stable security definer set search_path='' as $body$
     select exists(select from private.campus_student_reporting_pilot p
       where p.owner_id=p_owner and p.enrollment_id=p_enrollment and now()<p.expires_at
         and (p_url is null or p.telegram_url=p_url))
      or exists(select from public.profiles s where s.id=p_owner and s.role in ('admin','staff') and s.status='active');
    $body$
  $fn$;
end $$;
commit;
