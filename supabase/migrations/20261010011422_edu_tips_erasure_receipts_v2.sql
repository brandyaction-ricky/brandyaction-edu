begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No consumer, key, scheduler or live feature is seeded. This is the DB core only.
create table edu_tips_private.erasure_consumers (
 id uuid primary key,
 environment text not null check(environment in ('dev','production')),
 tenant_id text not null check(tenant_id='brandyaction'),
 brand_id text not null check(brand_id='brandyaction_edu'),
 last_ordinal bigint not null default 0 check(last_ordinal>=0),
 acked_ordinal bigint not null default 0 check(acked_ordinal between 0 and last_ordinal)
);
create table edu_tips_private.erasure_deliveries (
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 request_id uuid not null references edu_tips_private.erasure_outbox(request_id),
 delivery_id uuid not null default gen_random_uuid(),
 ordinal bigint not null check(ordinal>0),
 published_at timestamptz not null default clock_timestamp(),
 accepted_revision bigint not null default 0,
 phase text,
 completed_at timestamptz,
 -- Sticky violation: late reports are accepted without hiding missed deadlines.
 deadline_breached boolean not null default false,
 primary key(consumer_id,request_id),
 unique(consumer_id,ordinal),
 unique(consumer_id,delivery_id)
);
create index edu_tips_erasure_delivery_request on edu_tips_private.erasure_deliveries(request_id);
create table edu_tips_private.erasure_receipts (
 consumer_id uuid not null,
 request_id uuid not null,
 receipt_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 payload jsonb not null,
 accepted_at timestamptz not null default clock_timestamp(),
 primary key(consumer_id,receipt_id),
 unique(consumer_id,request_id,revision),
 foreign key(consumer_id,request_id) references edu_tips_private.erasure_deliveries(consumer_id,request_id)
);
alter table edu_tips_private.erasure_consumers enable row level security;
alter table edu_tips_private.erasure_deliveries enable row level security;
alter table edu_tips_private.erasure_receipts enable row level security;
revoke all on edu_tips_private.erasure_consumers,edu_tips_private.erasure_deliveries,edu_tips_private.erasure_receipts from public,anon,authenticated,service_role;
grant select on edu_tips_private.erasure_consumers to service_role;
grant update(last_ordinal,acked_ordinal) on edu_tips_private.erasure_consumers to service_role;
grant select,insert on edu_tips_private.erasure_deliveries,edu_tips_private.erasure_receipts to service_role;
grant update(accepted_revision,phase,completed_at,deadline_breached) on edu_tips_private.erasure_deliveries to service_role;

-- Serialise publication per consumer BEFORE allocating ordinals. A late source
-- transaction receives a later ordinal; source timestamps are never a watermark.
create function public.edu_tips_publish_erasures(p_consumer uuid,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path='' as $$
declare c edu_tips_private.erasure_consumers; q record; n integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'TIPS_INVALID';end if;
 select * into c from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if not found then raise exception 'TIPS_CONSUMER';end if;
 for q in select o.request_id from edu_tips_private.erasure_outbox o
  where not exists(select 1 from edu_tips_private.erasure_deliveries d where d.consumer_id=p_consumer and d.request_id=o.request_id)
  order by o.requested_at,o.request_id limit p_limit loop
  n:=n+1;
  insert into edu_tips_private.erasure_deliveries(consumer_id,request_id,ordinal) values(p_consumer,q.request_id,c.last_ordinal+n);
 end loop;
 update edu_tips_private.erasure_consumers set last_ordinal=c.last_ordinal+n where id=p_consumer;
 return n;
end$$;

create function edu_tips_private.validate_erasure_receipt(p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare k text; v jsonb; phase_rank integer; dt timestamptz; previous_dt timestamptz;
 required text[]:=array['requestId','receipt_id','receipt_revision','customer_id','consent_epoch','phase','observed_at','blocked_at','active_erased_at','model_resolved_at','residual_erased_at','counts','models','residuals','evidence_sha256','error_code'];
begin
 if p is null or jsonb_typeof(p)<>'object' then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if not (p ?& required) or exists(select 1 from jsonb_object_keys(p) x where not x=any(required)) then raise exception 'TIPS_INVALID_RECEIPT';end if;
 foreach k in array array['requestId','receipt_id','customer_id','consent_epoch','phase','observed_at','blocked_at','models','residuals','evidence_sha256'] loop
  if jsonb_typeof(p->k)<>'string' then raise exception 'TIPS_INVALID_RECEIPT';end if;
 end loop;
 if (p->>'requestId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 or (p->>'receipt_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 or (p->>'customer_id') !~ '^k[1-9][0-9]*:[A-Za-z0-9_-]{43}$'
 or (p->>'consent_epoch') !~ '^ce_[A-Za-z0-9_-]{32}$'
 or (p->>'evidence_sha256') !~ '^[0-9a-f]{64}$' then raise exception 'TIPS_INVALID_RECEIPT';end if;
 phase_rank:=array_position(array['blocked','active_erased','model_resolved','completed'],p->>'phase');
 if phase_rank is null or (p->>'models') not in ('pending','done','not_applicable') or (p->>'residuals') not in ('pending','done','not_applicable')
 or (p->'error_code'<>'null'::jsonb and (jsonb_typeof(p->'error_code')<>'string' or (p->>'error_code') not in ('delete_retry','model_retry','residual_pending','verification_failed'))) then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if jsonb_typeof(p->'receipt_revision')<>'number' then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if (p->>'receipt_revision')::numeric<1 or (p->>'receipt_revision')::numeric>9007199254740991 or trunc((p->>'receipt_revision')::numeric)<>(p->>'receipt_revision')::numeric then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if jsonb_typeof(p->'counts')<>'object' then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if not ((p->'counts') ?& array['events','learning_rows','profiles','predictions','files','models'])
  or (select count(*) from jsonb_object_keys(p->'counts'))<>6 then raise exception 'TIPS_INVALID_RECEIPT';end if;
 for k,v in select * from jsonb_each(p->'counts') loop
  if jsonb_typeof(v)<>'number' then raise exception 'TIPS_INVALID_RECEIPT';end if;
  if (v::text)::numeric<0 or (v::text)::numeric>9007199254740991 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'TIPS_INVALID_RECEIPT';end if;
 end loop;
 -- All timestamps are UTC. Completed stages require their timestamps; timestamps
 -- already reported are immutable across later revisions (checked below).
 foreach k in array array['blocked_at','active_erased_at','model_resolved_at','residual_erased_at','observed_at'] loop
  if p->k='null'::jsonb then
   if k in ('blocked_at','observed_at') or (k='active_erased_at' and phase_rank>=2)
    or (k='model_resolved_at' and phase_rank>=3) or (k='residual_erased_at' and phase_rank=4) then raise exception 'TIPS_INVALID_RECEIPT';end if;
  else
   if jsonb_typeof(p->k)<>'string' or (p->>k) !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$' then raise exception 'TIPS_INVALID_RECEIPT';end if;
   begin dt:=(p->>k)::timestamptz;exception when others then raise exception 'TIPS_INVALID_RECEIPT';end;
   if dt>clock_timestamp() or (previous_dt is not null and dt<previous_dt) then raise exception 'TIPS_INVALID_RECEIPT';end if;
   previous_dt:=dt;
  end if;
 end loop;
 if p->'model_resolved_at'<>'null'::jsonb and (p->'active_erased_at'='null'::jsonb or p->>'models'='pending') then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if p->'residual_erased_at'<>'null'::jsonb and (p->'model_resolved_at'='null'::jsonb or p->>'residuals'='pending') then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if phase_rank>=3 and p->>'models'='pending' then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if phase_rank=4 and (p->>'residuals'='pending' or p->'error_code'<>'null'::jsonb) then raise exception 'TIPS_INVALID_RECEIPT';end if;
end$$;

create function public.edu_tips_accept_erasure_receipt(p_consumer uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d edu_tips_private.erasure_deliveries; q edu_tips_private.erasure_outbox; s edu_tips_private.subjects;
 prior edu_tips_private.erasure_receipts; old_payload jsonb; req uuid; receipt uuid; rev bigint; k text; breached boolean;
begin
 perform edu_tips_private.validate_erasure_receipt(p_payload);
 req:=(p_payload->>'requestId')::uuid;receipt:=(p_payload->>'receipt_id')::uuid;rev:=(p_payload->>'receipt_revision')::numeric::bigint;
 -- Same lock order as publisher/ACK; this also serialises receipt ID conflicts.
 perform 1 from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if not found then raise exception 'TIPS_CONSUMER';end if;
 select * into prior from edu_tips_private.erasure_receipts where consumer_id=p_consumer and receipt_id=receipt;
 if found then
  if prior.payload<>p_payload then raise exception 'TIPS_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('requestId',req,'receipt_id',receipt,'accepted_revision',prior.revision,'phase',prior.payload->>'phase');
 end if;
 select * into d from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and request_id=req for update;
 if not found then raise exception 'TIPS_UNKNOWN_REQUEST';end if;
 select * into q from edu_tips_private.erasure_outbox where request_id=req;
 select * into s from edu_tips_private.subjects where id=q.subject_id;
 if s.customer_id<>p_payload->>'customer_id' or s.consent_epoch<>p_payload->>'consent_epoch' then raise exception 'TIPS_IDENTITY_CONFLICT';end if;
 if (p_payload->>'blocked_at')::timestamptz<q.requested_at then raise exception 'TIPS_INVALID_RECEIPT';end if;
 if rev<=d.accepted_revision or (d.phase is not null and array_position(array['blocked','active_erased','model_resolved','completed'],p_payload->>'phase')<array_position(array['blocked','active_erased','model_resolved','completed'],d.phase)) then raise exception 'TIPS_REVISION_CONFLICT';end if;
 select payload into old_payload from edu_tips_private.erasure_receipts where consumer_id=p_consumer and request_id=req and revision=d.accepted_revision;
 if found then
  if (p_payload->>'observed_at')::timestamptz<(old_payload->>'observed_at')::timestamptz then raise exception 'TIPS_REVISION_CONFLICT';end if;
  foreach k in array array['blocked_at','active_erased_at','model_resolved_at','residual_erased_at'] loop
   if old_payload->k<>'null'::jsonb and (p_payload->>k)::timestamptz is distinct from (old_payload->>k)::timestamptz then raise exception 'TIPS_REVISION_CONFLICT';end if;
  end loop;
  for k in select jsonb_object_keys(old_payload->'counts') loop
   if (p_payload->'counts'->>k)::numeric<(old_payload->'counts'->>k)::numeric then raise exception 'TIPS_REVISION_CONFLICT';end if;
  end loop;
  foreach k in array array['models','residuals'] loop
   if old_payload->>k<>'pending' and p_payload->>k is distinct from old_payload->>k then raise exception 'TIPS_REVISION_CONFLICT';end if;
  end loop;
 end if;
 breached:=coalesce((p_payload->>'active_erased_at')::timestamptz,clock_timestamp())>q.active_due_at
  or coalesce((p_payload->>'model_resolved_at')::timestamptz,clock_timestamp())>q.model_due_at
  or coalesce((p_payload->>'residual_erased_at')::timestamptz,clock_timestamp())>q.residual_due_at;
 insert into edu_tips_private.erasure_receipts(consumer_id,request_id,receipt_id,revision,payload) values(p_consumer,req,receipt,rev,p_payload);
 update edu_tips_private.erasure_deliveries set accepted_revision=rev,phase=p_payload->>'phase',deadline_breached=deadline_breached or breached,
  completed_at=case when p_payload->>'phase'='completed' then coalesce(completed_at,clock_timestamp()) else null end
  where consumer_id=p_consumer and request_id=req;
 -- This is the consumer's reported completion, NOT independently verified remote
 -- deletion and NOT global clearance for new analysis. Keep outbox.completed_at shut.
 return jsonb_build_object('requestId',req,'receipt_id',receipt,'accepted_revision',rev,'phase',p_payload->>'phase');
end$$;

-- delivery_id is an internal handle, never the public cursor. The later HTTP
-- adapter must issue/verify consumer-bound opaque cursors and map them to this ID.
create function public.edu_tips_ack_erasures(p_consumer uuid,p_through uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c edu_tips_private.erasure_consumers; target bigint; current_id uuid;
begin
 select * into c from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if not found then raise exception 'TIPS_CONSUMER';end if;
 select ordinal into target from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and delivery_id=p_through;
 if not found then raise exception 'TIPS_UNKNOWN_CURSOR';end if;
 if target>c.acked_ordinal then
  if target>c.last_ordinal or (select count(*) from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and ordinal>c.acked_ordinal and ordinal<=target)<>target-c.acked_ordinal then raise exception 'TIPS_ACK_GAP';end if;
  if exists(select 1 from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and ordinal>c.acked_ordinal and ordinal<=target and completed_at is null) then raise exception 'TIPS_ACK_GAP';end if;
  update edu_tips_private.erasure_consumers set acked_ordinal=target where id=p_consumer;
  return p_through;
 end if;
 select delivery_id into current_id from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and ordinal=c.acked_ordinal;
 return current_id;
end$$;
revoke all on function edu_tips_private.validate_erasure_receipt(jsonb) from public,anon,authenticated;
grant execute on function edu_tips_private.validate_erasure_receipt(jsonb) to service_role;
revoke all on function public.edu_tips_publish_erasures(uuid,integer),public.edu_tips_accept_erasure_receipt(uuid,jsonb),public.edu_tips_ack_erasures(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_tips_publish_erasures(uuid,integer),public.edu_tips_accept_erasure_receipt(uuid,jsonb),public.edu_tips_ack_erasures(uuid,uuid) to service_role;
commit;
