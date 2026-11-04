begin;
-- Dormant adapter: no schedule, credentials, connector registration or external I/O.
create table private.edu_campus_office_dispatches (
 id uuid primary key,
 owner_id uuid not null references public.profiles(id),
 enrollment_id uuid not null references public.enrollments(id),
 job_id uuid not null references public.edu_campus_office_jobs(id),
 job_revision integer not null check(job_revision>0),
 connector_id text not null,
 key_version text not null,
 payload jsonb not null check(octet_length(payload::text)<=24000),
 operation text not null default 'submit' check(operation in ('submit','status','cancel')),
 status text not null default 'queued' check(status in ('queued','leased','accepted','uncertain','rejected','cancelled')),
 revision integer not null default 1,
 attempts integer not null default 0 check(attempts between 0 and 12),
 operation_attempts integer not null default 0 check(operation_attempts between 0 and 4),
 cancel_requested boolean not null default false,
 lease_id uuid,
 lease_expires_at timestamptz,
 available_at timestamptz not null default now(),
 last_code text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(job_id,job_revision)
);
create index edu_campus_office_dispatch_ready on private.edu_campus_office_dispatches(available_at,id) where status='queued';
create index edu_campus_office_dispatch_owner on private.edu_campus_office_dispatches(owner_id,enrollment_id,created_at desc);
create table private.edu_campus_office_dispatch_receipts(owner_id uuid not null,request_id uuid not null,command jsonb not null,result jsonb not null,primary key(owner_id,request_id));
alter table private.edu_campus_office_dispatches enable row level security;
alter table private.edu_campus_office_dispatch_receipts enable row level security;
revoke all on private.edu_campus_office_dispatches,private.edu_campus_office_dispatch_receipts from public,anon,authenticated,service_role;
create function private.campus_office_dispatch_view(d private.edu_campus_office_dispatches) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',d.id,'jobId',d.job_id,'jobRevision',d.job_revision,'status',d.status,'operation',d.operation,'revision',d.revision,'attempts',d.attempts,'cancelRequested',d.cancel_requested,'lastCode',d.last_code,'updatedAt',d.updated_at)
$$;
create function private.campus_office_dispatch_list(p_enrollment uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.campus_office_scope(p_enrollment,auth.uid()) then raise exception 'scope' using errcode='42501';end if;
 return coalesce((select jsonb_agg(private.campus_office_dispatch_view(d) order by d.created_at desc) from (select distinct on (job_id) * from private.edu_campus_office_dispatches where owner_id=auth.uid() and enrollment_id=p_enrollment order by job_id,job_revision desc) d),'[]'::jsonb);
end $$;
create function private.campus_office_dispatch_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rid uuid:=(p_command->>'requestId')::uuid; eid uuid:=(p_command->>'enrollmentId')::uuid; a text:=p_command->>'action'; j public.edu_campus_office_jobs; d private.edu_campus_office_dispatches; old private.edu_campus_office_dispatch_receipts; result jsonb; cid text:=p_command->>'connectorId'; kv text:=p_command->>'keyVersion';
begin
 if u is null or rid is null or octet_length(p_command::text)>4000 or not private.campus_office_scope(eid,u) then raise exception 'scope' using errcode='42501';end if;
 perform pg_advisory_xact_lock(812004731);
 select * into old from private.edu_campus_office_dispatch_receipts where owner_id=u and request_id=rid;
 if found then if old.command<>p_command then raise exception 'replay conflict' using errcode='23505';end if;return old.result;end if;
 select * into j from public.edu_campus_office_jobs where id=(p_command->>'jobId')::uuid and owner_id=u and enrollment_id=eid for update;
 if not found then raise exception 'scope' using errcode='42501';end if;
 if coalesce((p_command->>'expectedJobRevision')::integer,0)<1 or j.revision<>(p_command->>'expectedJobRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
 if a='enqueue' then
  if j.status not in ('awaiting_connection','revision_requested') or not exists(select 1 from private.edu_campus_office_connectors c where c.connector_id=cid and c.owner_id=u and c.key_version=kv and c.enabled) then raise exception 'connection unavailable' using errcode='42501';end if;
  if exists(select 1 from private.edu_campus_office_dispatches x where x.job_id=j.id and x.status in ('queued','leased','uncertain') and x.job_revision<>j.revision) then raise exception 'prior delivery unresolved' using errcode='40001';end if;
  if (select count(*) from private.edu_campus_office_dispatches x where x.owner_id=u and x.created_at>now()-interval '1 minute')>=5 then raise exception 'rate limit' using errcode='23514';end if;
  insert into private.edu_campus_office_dispatches(id,owner_id,enrollment_id,job_id,job_revision,connector_id,key_version,payload) values(rid,u,eid,j.id,j.revision,cid,kv,jsonb_build_object('jobId',j.id,'ownerId',u,'expectedRevision',j.revision,'objective',j.objective,'materialUrls',j.material_urls,'outputType',j.output_type,'revisionNote',j.review_note)) returning * into d;
 else
  select * into d from private.edu_campus_office_dispatches where id=(p_command->>'dispatchId')::uuid and owner_id=u and job_id=j.id for update;
  if not found then raise exception 'scope' using errcode='42501';end if;
  if coalesce((p_command->>'expectedRevision')::integer,0)<1 or d.revision<>(p_command->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
  if a='cancel' and d.status not in ('cancelled','rejected') and j.status not in ('review','approved','archived') then
   if d.status='queued' and d.attempts=0 then d.status:='cancelled';d.last_code:='cancelled_before_send';
   elsif d.status<>'leased' then d.operation:='cancel';d.operation_attempts:=0;d.status:='queued';end if;
   d.cancel_requested:=true;
  elsif a='reconcile' and d.status='uncertain' and d.attempts<12 then d.operation:=case when d.cancel_requested then 'cancel' else 'status' end;d.operation_attempts:=0;d.status:='queued';
  elsif a='retry' and d.status='rejected' and not d.cancel_requested and d.attempts<12 and j.revision=d.job_revision and j.status in ('awaiting_connection','revision_requested') then d.operation:='submit';d.operation_attempts:=0;d.status:='queued';
  else raise exception 'invalid transition' using errcode='40001';end if;
  update private.edu_campus_office_dispatches set status=d.status,operation=d.operation,operation_attempts=d.operation_attempts,cancel_requested=d.cancel_requested,last_code=d.last_code,revision=revision+1,available_at=now(),updated_at=now() where id=d.id returning * into d;
 end if;
 if d.status='cancelled' and d.attempts=0 and j.status in ('awaiting_connection','revision_requested') then
  update public.edu_campus_office_jobs set status='failed',error_note='외부로 전송하기 전에 취소했습니다.',revision=revision+1,updated_at=now() where id=j.id returning * into j;
  insert into public.edu_campus_office_history(job_id,revision,actor_type,action,status,note,draft_text) values(j.id,j.revision,'learner','cancel_before_send',j.status,'전송 전 취소','');
 end if;
 result:=private.campus_office_dispatch_view(d);
 insert into private.edu_campus_office_dispatch_receipts values(u,rid,p_command,result);
 return result;
end $$;
create function private.campus_office_dispatch_claim(p_connector text,p_key_version text,p_allowed_owners uuid[],p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.edu_campus_office_dispatches;j public.edu_campus_office_jobs;
begin
 if current_setting('role',true)<>'service_role' or p_lease is null or cardinality(p_allowed_owners) not between 1 and 1000 then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(812004731);
 -- Expired leases are ambiguous: never automatically replay a submit.
 update private.edu_campus_office_dispatches set status='uncertain',last_code='lease_expired',lease_id=null,lease_expires_at=null,revision=revision+1,updated_at=now() where status='leased' and lease_expires_at<=now() and connector_id=p_connector;
 select * into d from private.edu_campus_office_dispatches where status='queued' and connector_id=p_connector and key_version=p_key_version and owner_id=any(p_allowed_owners) and available_at<=now() order by available_at,id for update skip locked limit 1;
 if not found then return null;end if;
 select * into j from public.edu_campus_office_jobs where id=d.job_id for update;
 if d.attempts>=12 or d.operation_attempts>=4 then update private.edu_campus_office_dispatches set status='uncertain',last_code='attempt_limit',revision=revision+1,updated_at=now() where id=d.id;return null;end if;
 if not private.campus_office_scope(d.enrollment_id,d.owner_id) or not exists(select 1 from private.edu_campus_office_connectors c where c.connector_id=d.connector_id and c.key_version=d.key_version and c.owner_id=d.owner_id and c.enabled) then
  update private.edu_campus_office_dispatches set status=case when attempts=0 then 'cancelled' else 'uncertain' end,last_code='access_changed',revision=revision+1,updated_at=now() where id=d.id;return null;
 end if;
 if d.operation='submit' and (j.revision<>d.job_revision or j.status not in ('awaiting_connection','revision_requested')) then update private.edu_campus_office_dispatches set status=case when attempts=0 then 'cancelled' else 'uncertain' end,last_code='job_changed',revision=revision+1,updated_at=now() where id=d.id;return null;end if;
 update private.edu_campus_office_dispatches set status='leased',attempts=attempts+1,operation_attempts=operation_attempts+1,lease_id=p_lease,lease_expires_at=now()+interval '60 seconds',revision=revision+1,updated_at=now() where id=d.id returning * into d;
 return jsonb_build_object('id',d.id,'leaseId',d.lease_id,'attempt',d.attempts,'operation',d.operation,'connectorId',d.connector_id,'keyVersion',d.key_version,'payload',case when d.operation='submit' then d.payload else jsonb_build_object('jobId',d.job_id,'ownerId',d.owner_id) end);
end $$;
create function private.campus_office_dispatch_finish(p_id uuid,p_lease uuid,p_outcome text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.edu_campus_office_dispatches;j public.edu_campus_office_jobs;
begin
 if current_setting('role',true)<>'service_role' or p_id is null or p_lease is null or p_outcome is null or p_outcome not in ('accepted','not_found','cancelled','busy','uncertain','rejected') then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(812004731);
 select * into d from private.edu_campus_office_dispatches where id=p_id for update;
 if not found or d.status<>'leased' or d.lease_id<>p_lease or d.lease_expires_at<=now() then raise exception 'lease conflict' using errcode='40001';end if;
 select * into j from public.edu_campus_office_jobs where id=d.job_id for update;
 d.last_code:=p_outcome;
 d.status:=case when p_outcome='accepted' and d.operation in ('submit','status') then 'accepted' when p_outcome='cancelled' and d.operation in ('cancel','status') then 'cancelled' when p_outcome in ('not_found','rejected') and d.operation<>'cancel' then 'rejected' when p_outcome='not_found' and d.operation='cancel' then 'cancelled' when p_outcome='busy' and d.operation_attempts<4 and d.attempts<12 then 'queued' else 'uncertain' end;
 if d.cancel_requested and d.operation<>'cancel' and d.status<>'cancelled' then d.operation:='cancel';d.operation_attempts:=0;d.status:='queued';end if;
 update private.edu_campus_office_dispatches set status=d.status,operation=d.operation,operation_attempts=d.operation_attempts,last_code=d.last_code,lease_id=null,lease_expires_at=null,revision=revision+1,available_at=now()+interval '30 seconds',updated_at=now() where id=d.id returning * into d;
 if d.status='cancelled' and j.status in ('awaiting_connection','revision_requested','queued','running') then
  update public.edu_campus_office_jobs set status='failed',error_note='외부 작업 취소를 확인했습니다. 다시 진행하려면 새 요청을 검토해 주세요.',revision=revision+1,updated_at=now() where id=j.id returning * into j;
  insert into public.edu_campus_office_history(job_id,revision,actor_type,action,status,note,draft_text) values(j.id,j.revision,'connector','cancel_confirmed',j.status,'서명된 외부 작업 취소 확인','');
 end if;
 return private.campus_office_dispatch_view(d);
end $$;
-- Do not hide a request while an external delivery is unresolved. Existing
-- review/approval remains owner-controlled after a draft has actually arrived.
alter function private.campus_office_mutate(jsonb) rename to campus_office_mutate_before_dispatch;
create function private.campus_office_mutate(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(812004731);
 if exists(select 1 from private.edu_campus_office_receipts r where r.actor_id=auth.uid() and r.request_id=(p_command->>'requestId')::uuid) then return private.campus_office_mutate_before_dispatch(p_command);end if;
 if p_command->>'action' in ('archive','retry') and exists(select 1 from private.edu_campus_office_dispatches d join public.edu_campus_office_jobs j on j.id=d.job_id where j.id=(p_command->>'jobId')::uuid and j.owner_id=auth.uid() and d.job_revision<=j.revision and ((d.status in ('queued','leased','uncertain')) or (d.status='accepted' and j.status in ('awaiting_connection','queued','running','revision_requested'))) and not exists(select 1 from private.edu_campus_office_dispatches newer where newer.job_id=d.job_id and newer.job_revision>d.job_revision)) then raise exception 'delivery unresolved' using errcode='40001';end if;
 return private.campus_office_mutate_before_dispatch(p_command);
end $$;
create or replace function public.edu_campus_office_mutate(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.campus_office_mutate(p_command)$$;
revoke all on function private.campus_office_mutate(jsonb),private.campus_office_mutate_before_dispatch(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.campus_office_mutate(jsonb) to authenticated;

-- Keep the reviewed ingress implementation, adding cancellation fencing only.
alter function private.campus_office_ingest(text,text,uuid[],uuid,text,jsonb) rename to campus_office_ingest_before_dispatch;
create function private.campus_office_ingest(p_connector text,p_key_version text,p_allowed_owners uuid[],p_event_id uuid,p_payload_hash text,p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare latest private.edu_campus_office_dispatches;
begin
 perform pg_advisory_xact_lock(812004731);
 select * into latest from private.edu_campus_office_dispatches where job_id=(p_event->>'jobId')::uuid order by job_revision desc limit 1;
 if found and ((p_event->>'dispatchId') is null or (p_event->>'dispatchId')::uuid<>latest.id or latest.connector_id<>p_connector) then raise exception 'dispatch mismatch' using errcode='40001';end if;
 if exists(select 1 from private.edu_campus_office_dispatches d where d.job_id=(p_event->>'jobId')::uuid and d.job_revision<=(p_event->>'expectedRevision')::integer and (d.cancel_requested or d.status='cancelled') and not exists(select 1 from private.edu_campus_office_dispatches newer where newer.job_id=d.job_id and newer.job_revision>d.job_revision)) then raise exception 'cancel fence' using errcode='40001';end if;
 return private.campus_office_ingest_before_dispatch(p_connector,p_key_version,p_allowed_owners,p_event_id,p_payload_hash,p_event);
end $$;
create function public.edu_campus_office_dispatch_list(p_enrollment uuid) returns jsonb language sql security invoker set search_path='' as $$select private.campus_office_dispatch_list(p_enrollment)$$;
create function public.edu_campus_office_dispatch_command(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.campus_office_dispatch_command(p_command)$$;
create function public.edu_campus_office_dispatch_claim(p_connector text,p_key_version text,p_allowed_owners uuid[],p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$select private.campus_office_dispatch_claim(p_connector,p_key_version,p_allowed_owners,p_lease)$$;
create function public.edu_campus_office_dispatch_finish(p_id uuid,p_lease uuid,p_outcome text) returns jsonb language sql security invoker set search_path='' as $$select private.campus_office_dispatch_finish(p_id,p_lease,p_outcome)$$;
-- The public wrapper must resolve the new fence (SQL function body is recompiled).
create or replace function public.edu_campus_office_ingest(p_connector text,p_key_version text,p_allowed_owners uuid[],p_event_id uuid,p_payload_hash text,p_event jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.campus_office_ingest(p_connector,p_key_version,p_allowed_owners,p_event_id,p_payload_hash,p_event)$$;
revoke all on function private.campus_office_dispatch_view(private.edu_campus_office_dispatches),private.campus_office_dispatch_list(uuid),private.campus_office_dispatch_command(jsonb),private.campus_office_dispatch_claim(text,text,uuid[],uuid),private.campus_office_dispatch_finish(uuid,uuid,text),public.edu_campus_office_dispatch_list(uuid),public.edu_campus_office_dispatch_command(jsonb),public.edu_campus_office_dispatch_claim(text,text,uuid[],uuid),public.edu_campus_office_dispatch_finish(uuid,uuid,text),private.campus_office_ingest(text,text,uuid[],uuid,text,jsonb),private.campus_office_ingest_before_dispatch(text,text,uuid[],uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.campus_office_dispatch_list(uuid),private.campus_office_dispatch_command(jsonb),public.edu_campus_office_dispatch_list(uuid),public.edu_campus_office_dispatch_command(jsonb) to authenticated;
grant execute on function private.campus_office_dispatch_claim(text,text,uuid[],uuid),private.campus_office_dispatch_finish(uuid,uuid,text),public.edu_campus_office_dispatch_claim(text,text,uuid[],uuid),public.edu_campus_office_dispatch_finish(uuid,uuid,text),private.campus_office_ingest(text,text,uuid[],uuid,text,jsonb) to service_role;
commit;
