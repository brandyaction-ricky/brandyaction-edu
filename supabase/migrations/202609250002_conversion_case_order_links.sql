begin;

create table public.edu_conversion_case_orders (
  case_id uuid not null references public.edu_conversion_cases(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (case_id, order_id),
  unique (order_id)
);

create index edu_conversion_case_orders_case on public.edu_conversion_case_orders(case_id, linked_at desc);
alter table public.edu_conversion_case_orders enable row level security;
revoke all on public.edu_conversion_case_orders from public, anon, authenticated, service_role;
grant select on public.edu_conversion_case_orders to service_role;

create function public.edu_conversion_case_order_manage(
  p_actor uuid, p_request uuid, p_payload jsonb, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  permissions jsonb;
  receipt public.edu_conversion_receipts%rowtype;
  inquiry public.edu_conversion_cases%rowtype;
  purchase public.orders%rowtype;
  operation text;
  purchase_id uuid;
  output jsonb;
begin
  if p_request is null or p_payload_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload) is distinct from 'object'
    or (p_payload->>'operation') not in ('link','unlink')
    or (p_payload-'case_id'-'expected_version'-'operation'-'order_id')<>'{}'::jsonb
    or (p_payload->>'expected_version') !~ '^[1-9][0-9]*$'
    or not (p_payload ? 'order_id') then raise exception 'CONVERSION_INVALID'; end if;
  operation := p_payload->>'operation';
  if operation='link' and (p_payload->>'order_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'CONVERSION_INVALID'; end if;
  if operation='unlink' and p_payload->'order_id'<>'null'::jsonb and (p_payload->>'order_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'CONVERSION_INVALID'; end if;

  select * into actor from public.profiles where id=p_actor and status='active';
  if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
  if actor.role='staff' then
    select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text;
    if (permissions->'members') is distinct from 'true'::jsonb
      or (permissions->'orders') is distinct from 'true'::jsonb
      or (permissions->'marketing') is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(207260920,2);
  insert into public.edu_conversion_receipts(actor_id,request_id,action,payload_hash,payload)
    values(p_actor,p_request,'manage_case_order',p_payload_hash,p_payload) on conflict do nothing;
  select * into receipt from public.edu_conversion_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.action<>'manage_case_order' or receipt.payload_hash<>p_payload_hash or receipt.payload<>p_payload then raise exception 'CONVERSION_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;

  select * into inquiry from public.edu_conversion_cases where id=(p_payload->>'case_id')::uuid for update;
  if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
  if inquiry.input_version<>(p_payload->>'expected_version')::integer or inquiry.archived_at is not null then raise exception 'CONVERSION_STALE'; end if;
  if inquiry.source_type<>'manual' or inquiry.sample_origin<>'current' or inquiry.course_id is null then raise exception 'CONVERSION_INVALID'; end if;
  if operation='link' then
    purchase_id := (p_payload->>'order_id')::uuid;
    select * into purchase from public.orders where id=purchase_id and status in ('paid','partially_refunded','refunded') and paid_at is not null;
    if not found then raise exception 'CONVERSION_ORDER_NOT_ELIGIBLE'; end if;
    if not exists (select 1 from public.order_items where order_id=purchase_id and course_id=inquiry.course_id and cohort_id=inquiry.cohort_id) then raise exception 'CONVERSION_ORDER_SCOPE'; end if;
    begin
      insert into public.edu_conversion_case_orders(case_id,order_id,linked_by) values(inquiry.id,purchase_id,p_actor) on conflict (case_id,order_id) do nothing;
    exception when unique_violation then raise exception 'CONVERSION_ORDER_ALREADY_LINKED'; end;
  else
    purchase_id := case when p_payload->'order_id'='null'::jsonb then null else (p_payload->>'order_id')::uuid end;
    if purchase_id is null then raise exception 'CONVERSION_INVALID'; end if;
    delete from public.edu_conversion_case_orders where case_id=inquiry.id and order_id=purchase_id;
  end if;

  output := jsonb_build_object('case_id',inquiry.id,'order_id',purchase_id,'operation',operation);
  update public.edu_conversion_receipts set result=output where actor_id=p_actor and request_id=p_request;
  return output;
end;
$$;

revoke all on function public.edu_conversion_case_order_manage(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.edu_conversion_case_order_manage(uuid,uuid,jsonb,text) to service_role;

commit;
