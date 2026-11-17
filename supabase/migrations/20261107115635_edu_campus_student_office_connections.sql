begin;
-- An operator enables the verified DEV project separately after migration.
create table private.campus_student_reporting_enabled (enabled boolean primary key check(enabled));
alter table private.campus_student_reporting_enabled enable row level security;
revoke all on private.campus_student_reporting_enabled from public,anon,authenticated;
create table private.campus_student_connections (
  id text primary key default ('s-' || gen_random_uuid()::text),
  owner_id uuid not null references public.profiles on delete cascade,
  enrollment_id uuid not null references public.enrollments on delete cascade,
  employee_id text not null, telegram_url text not null,
  verifier text unique not null check(verifier ~ '^[0-9a-f]{64}$'),
  confirmation text not null default substr(replace(gen_random_uuid()::text,'-',''),1,12),
  pair_until timestamptz not null, confirmed_at timestamptz, revoked_at timestamptz
);
create unique index campus_student_one_employee on private.campus_student_connections(owner_id,enrollment_id,employee_id) where revoked_at is null;
alter table private.campus_student_connections enable row level security;
revoke all on private.campus_student_connections from public,anon,authenticated;

create function private.campus_student_connection(p_enrollment uuid,p_employee text,p_action text,p_code text,p_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid()); c private.campus_student_connections; link text; issued timestamptz;
begin
  if actor is null or not private.campus_office_scope(p_enrollment,actor) then raise insufficient_privilege; end if;
  if p_action <> 'revoke' and not exists(select from private.campus_student_reporting_enabled) then raise insufficient_privilege; end if;
  if p_action = 'list' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'employeeId',employee_id,
      'status',case when confirmed_at is not null then 'active' when pair_until>now() then 'pending' else 'expired' end,
      'confirmation',case when confirmed_at is null and pair_until>now() then confirmation end))
      from private.campus_student_connections where owner_id=actor and enrollment_id=p_enrollment and revoked_at is null),'[]');
  end if;
  if p_action='revoke' then
    update private.campus_student_connections set revoked_at=coalesce(revoked_at,now())
      where id=p_id and owner_id=actor and enrollment_id=p_enrollment returning * into c;
    if not found then raise insufficient_privilege; end if;
    update private.edu_campus_office_connectors set enabled=false where connector_id=c.id and owner_id=actor;
    return jsonb_build_object('revoked',true);
  end if;
  if p_action is distinct from 'pair' or p_code is null or p_code !~ '^MS1-[0-9]{10}-[a-f0-9]{64}$' then
    raise exception 'invalid pairing code' using errcode='23514';
  end if;
  issued := to_timestamp(split_part(p_code,'-',2)::bigint);
  if issued > clock_timestamp()+interval '30 seconds' or issued+interval '10 minutes' <= clock_timestamp() then
    raise exception 'pairing expired' using errcode='23514';
  end if;
  select p->>'telegramUrl' into link from public.edu_campus_personal_offices o
    cross join lateral jsonb_array_elements(o.document->'profiles') p
    where o.owner_id=actor and p->>'employeeId'=p_employee and p_employee<>'manager';
  if link is null or link !~ '^https://t\.me/[a-z][a-z0-9_]{4,31}$' then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7));
  select * into c from private.campus_student_connections where owner_id=actor and enrollment_id=p_enrollment and employee_id=p_employee and revoked_at is null for update;
  if found then
    if c.verifier=split_part(p_code,'-',3) and c.pair_until=issued+interval '10 minutes' and c.telegram_url=link then return jsonb_build_object('id',c.id); end if;
    raise exception 'disconnect previous connection' using errcode='40001';
  end if;
  if (select count(*) from private.campus_student_connections where owner_id=actor and pair_until>now()-interval '1 hour')>=32 then
    raise exception 'too many pairings' using errcode='40001';
  end if;
  insert into private.campus_student_connections(owner_id,enrollment_id,employee_id,telegram_url,verifier,pair_until)
    values(actor,p_enrollment,p_employee,link,split_part(p_code,'-',3),issued+interval '10 minutes') returning * into c;
  return jsonb_build_object('id',c.id);
end;
$$;
create function public.edu_campus_student_connection(p_enrollment uuid,p_employee text,p_action text,p_code text,p_id text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.campus_student_connection(p_enrollment,p_employee,p_action,p_code,p_id);
$$;
revoke all on function private.campus_student_connection(uuid,text,text,text,text), public.edu_campus_student_connection(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function private.campus_student_connection(uuid,text,text,text,text), public.edu_campus_student_connection(uuid,text,text,text,text) to authenticated;

create function private.campus_student_report(p_verifier text,p_issued bigint,p_confirm text,p_event_id uuid,p_payload_hash text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.campus_student_connections;
begin
  if current_setting('role',true) is distinct from 'service_role' or not exists(select from private.campus_student_reporting_enabled) then raise insufficient_privilege; end if;
  select * into c from private.campus_student_connections where verifier=p_verifier and revoked_at is null for update;
  if not found or c.pair_until <> to_timestamp(p_issued)+interval '10 minutes' or not private.campus_office_scope(c.enrollment_id,c.owner_id)
     or not exists (select from public.edu_campus_personal_offices o cross join lateral jsonb_array_elements(o.document->'profiles') p
       where o.owner_id=c.owner_id and p->>'employeeId'=c.employee_id and p->>'telegramUrl'=c.telegram_url) then raise insufficient_privilege; end if;
  if p_confirm is not null then
    if p_confirm<>c.confirmation or (c.confirmed_at is null and c.pair_until<=clock_timestamp()) then raise insufficient_privilege; end if;
    if c.confirmed_at is null then
      update private.campus_student_connections set confirmed_at=clock_timestamp() where id=c.id returning * into c;
      insert into private.edu_campus_office_connectors(connector_id,owner_id,key_version,enabled) values(c.id,c.owner_id,'s1',true);
    end if;
    return jsonb_build_object('connectorId',c.id,'enrollmentId',c.enrollment_id,'notBefore',floor(extract(epoch from c.confirmed_at)*1000));
  end if;
  if c.confirmed_at is null or p_event is null then raise insufficient_privilege; end if;
  if p_event->>'event'='registered' then
    if (p_event->>'enrollmentId')::uuid is distinct from c.enrollment_id then raise insufficient_privilege; end if;
    return private.campus_office_register(c.id,'s1',array[c.owner_id],p_event_id,p_payload_hash,p_event);
  end if;
  if p_event ? 'dispatchId' or not exists(select from public.edu_campus_office_jobs where id=(p_event->>'jobId')::uuid and owner_id=c.owner_id and enrollment_id=c.enrollment_id and connector_id=c.id) then raise insufficient_privilege; end if;
  return public.edu_campus_office_ingest(c.id,'s1',array[c.owner_id],p_event_id,p_payload_hash,p_event);
end;
$$;
create function public.edu_campus_student_report(p_verifier text,p_issued bigint,p_confirm text,p_event_id uuid,p_payload_hash text,p_event jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.campus_student_report(p_verifier,p_issued,p_confirm,p_event_id,p_payload_hash,p_event);
$$;
revoke all on function private.campus_student_report(text,bigint,text,uuid,text,jsonb),public.edu_campus_student_report(text,bigint,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.campus_student_report(text,bigint,text,uuid,text,jsonb),public.edu_campus_student_report(text,bigint,text,uuid,text,jsonb) to service_role;
-- Removing or changing the Telegram employee permanently retires its credentials.
create function private.campus_student_roster_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  with retired as (
    update private.campus_student_connections c set revoked_at=now()
    where c.owner_id=old.owner_id and c.revoked_at is null and not exists(
      select from jsonb_array_elements(case when tg_op='DELETE' then '[]'::jsonb else new.document->'profiles' end) p
      where p->>'employeeId'=c.employee_id and p->>'telegramUrl'=c.telegram_url)
    returning c.id,c.owner_id
  )
  update private.edu_campus_office_connectors k set enabled=false from retired r where k.connector_id=r.id and k.owner_id=r.owner_id;
  return null;
end;
$$;
revoke all on function private.campus_student_roster_changed() from public,anon,authenticated;
create trigger campus_student_roster_changed after update of document or delete on public.edu_campus_personal_offices
for each row execute function private.campus_student_roster_changed();

create or replace function private.campus_office_connection(p_enrollment uuid) returns text language sql stable security definer set search_path='' as $$
 select case when private.campus_office_scope(p_enrollment,(select auth.uid())) and exists(
   select from private.edu_campus_office_connectors k left join private.campus_student_connections c on c.id=k.connector_id
   where k.owner_id=(select auth.uid()) and k.enabled and (c.id is null or c.enrollment_id=p_enrollment)
 ) then 'incoming_adapter_registered' else 'not_connected' end;
$$;
commit;
