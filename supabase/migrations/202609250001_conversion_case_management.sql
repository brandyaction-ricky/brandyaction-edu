begin;

alter table public.edu_conversion_cases
  add column purchase_outcome text not null default 'unknown',
  add column purchase_checked_at timestamptz,
  add column purchase_checked_by uuid references public.profiles(id) on delete set null,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null,
  add constraint edu_conversion_cases_purchase_outcome_check check (purchase_outcome in ('unknown','paid','not_paid')),
  add constraint edu_conversion_cases_purchase_check_check check (
    (purchase_outcome='unknown' and purchase_checked_at is null and purchase_checked_by is null)
    or (purchase_outcome in ('paid','not_paid') and purchase_checked_at is not null and purchase_checked_by is not null)
  ),
  add constraint edu_conversion_cases_archive_check check ((archived_at is null) = (archived_by is null));

create function public.edu_conversion_case_manage(
  p_actor uuid,p_request uuid,p_payload jsonb,p_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  permissions jsonb;
  receipt public.edu_conversion_receipts%rowtype;
  inquiry public.edu_conversion_cases%rowtype;
  operation text;
  target_id uuid;
  output jsonb;
begin
  if p_request is null or p_payload_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload) is distinct from 'object'
    or (p_payload->>'operation') not in ('purchase_outcome','archive','restore') then raise exception 'CONVERSION_INVALID'; end if;
  if (p_payload->>'operation'='purchase_outcome' and ((p_payload-'case_id'-'expected_version'-'operation'-'purchase_outcome')<>'{}'::jsonb or not (p_payload ? 'purchase_outcome')))
    or (p_payload->>'operation'<>'purchase_outcome' and ((p_payload-'case_id'-'expected_version'-'operation')<>'{}'::jsonb or p_payload ? 'purchase_outcome'))
    or (p_payload->>'expected_version') !~ '^[1-9][0-9]*$' then raise exception 'CONVERSION_INVALID'; end if;
  if p_payload->>'operation'='purchase_outcome' and (p_payload->>'purchase_outcome') not in ('unknown','paid','not_paid') then raise exception 'CONVERSION_INVALID'; end if;
  select * into actor from public.profiles where id=p_actor and status='active';
  if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
  if actor.role='staff' then
    select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text;
    if (permissions->'members') is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(207260920,1);
  insert into public.edu_conversion_receipts(actor_id,request_id,action,payload_hash,payload)
    values(p_actor,p_request,'manage_case',p_payload_hash,p_payload) on conflict do nothing;
  select * into receipt from public.edu_conversion_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.action<>'manage_case' or receipt.payload_hash<>p_payload_hash or receipt.payload<>p_payload then raise exception 'CONVERSION_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;
  target_id := (p_payload->>'case_id')::uuid;
  operation := p_payload->>'operation';
  select * into inquiry from public.edu_conversion_cases where id=target_id for update;
  if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
  if inquiry.input_version<>(p_payload->>'expected_version')::integer then raise exception 'CONVERSION_STALE'; end if;
  if operation='purchase_outcome' then
    if inquiry.archived_at is not null then raise exception 'CONVERSION_INVALID'; end if;
    update public.edu_conversion_cases set purchase_outcome=p_payload->>'purchase_outcome',
      purchase_checked_at=case when p_payload->>'purchase_outcome'='unknown' then null else now() end,
      purchase_checked_by=case when p_payload->>'purchase_outcome'='unknown' then null else p_actor end
      where id=target_id returning * into inquiry;
  elsif operation='archive' then
    update public.edu_conversion_cases set archived_at=coalesce(archived_at,now()),archived_by=coalesce(archived_by,p_actor)
      where id=target_id returning * into inquiry;
  else
    update public.edu_conversion_cases set archived_at=null,archived_by=null where id=target_id returning * into inquiry;
  end if;
  output := jsonb_build_object('case',to_jsonb(inquiry)-'source_revision');
  update public.edu_conversion_receipts set result=output where actor_id=p_actor and request_id=p_request;
  return output;
end;
$$;

revoke all on function public.edu_conversion_case_manage(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.edu_conversion_case_manage(uuid,uuid,jsonb,text) to service_role;

commit;
