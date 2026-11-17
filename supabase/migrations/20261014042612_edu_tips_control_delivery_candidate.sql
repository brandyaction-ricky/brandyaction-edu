begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Inactive local candidate. Owner-only settings; no key, consumer or activation seed.
create table edu_tips_private.control_settings (
 id smallint primary key check(id=1),
 capture_enabled boolean not null default false,
 sending_enabled boolean not null default false,
 identity_enabled boolean not null default false,
 source_authority_ref text check(source_authority_ref ~ '^[A-Za-z0-9._:-]{1,100}$'),
 check(not capture_enabled or source_authority_ref is not null),
 environment text check(environment in ('dev','production')),
 consumer_id uuid references edu_tips_private.erasure_consumers(id),
 check(not(capture_enabled or sending_enabled) or (environment is not null and consumer_id is not null))
);
insert into edu_tips_private.control_settings(id) values(1);
create table edu_tips_private.control_authorities (
 request_id uuid primary key references edu_tips_private.erasure_outbox(request_id),
 origin_contract_version text not null check(origin_contract_version='2.0.0-rc.2'),
 deadline_profile text not null check(deadline_profile='rc2_5_30_30'),
 authority_ref text not null check(authority_ref ~ '^[A-Za-z0-9._:-]{1,100}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table edu_tips_private.control_deliveries (
 request_id uuid primary key references edu_tips_private.erasure_outbox(request_id),
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 environment text not null check(environment in ('dev','production')),
 payload jsonb not null,
 request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 attempt_count integer not null default 0 check(attempt_count>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid,
 lease_until timestamptz,
 confirmed_at timestamptz,
 acknowledgment jsonb,
 last_error_code text check(last_error_code in ('disabled','invalid_request','invalid_configuration','timeout','network_error','remote_rejected','remote_unavailable','invalid_ack')),
 attention boolean not null default false,
 check((lease_token is null)=(lease_until is null)),
 check((confirmed_at is null)=(acknowledgment is null))
);
create index edu_tips_control_due on edu_tips_private.control_deliveries(consumer_id,environment,next_attempt_at,request_id) where confirmed_at is null;
create index edu_tips_control_consumer on edu_tips_private.control_deliveries(consumer_id);
create table edu_tips_private.pending_identities (
 id uuid primary key default gen_random_uuid(),
 member_id uuid references public.profiles(id) on delete set null,
 consent_epoch text not null unique check(consent_epoch ~ '^ce_[A-Za-z0-9_-]{32}$'),
 wording_version text not null references public.edu_personalization_terms(version),
 consent_revision uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 retired_at timestamptz,
 registered_at timestamptz
);
create unique index edu_tips_pending_current on edu_tips_private.pending_identities(member_id) where retired_at is null;
create index edu_tips_pending_terms on edu_tips_private.pending_identities(wording_version) where retired_at is null;
alter table edu_tips_private.control_authorities enable row level security;
alter table edu_tips_private.control_settings enable row level security;
alter table edu_tips_private.control_deliveries enable row level security;
alter table edu_tips_private.pending_identities enable row level security;
revoke all on edu_tips_private.control_authorities,edu_tips_private.control_settings,edu_tips_private.control_deliveries,edu_tips_private.pending_identities from public,anon,authenticated,service_role;
grant select on edu_tips_private.control_settings,edu_tips_private.control_deliveries,edu_tips_private.pending_identities to service_role;

-- Preserve microseconds. Millisecond-aligned values retain existing vector bytes.
create function edu_tips_private.control_utc(t timestamptz) returns text language sql immutable strict set search_path='' as $$
 select case when t=date_trunc('milliseconds',t) then to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 else to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
$$;
create function edu_tips_private.control_digest(b jsonb) returns text language sql immutable strict set search_path='' as $$
 select encode(sha256(convert_to(array_to_json(array['tips.block.v1',b->>'control_version',b->>'environment',b->>'tenant_id',b->>'brand_id',b->>'receiver_id',b->>'origin_contract_version',b->>'deadline_profile',
 b#>>'{block,requestId}',b#>>'{block,customer_id}',b#>>'{block,consent_epoch}',b#>>'{block,reason}',b#>>'{block,at}',b#>>'{block,active_due_at}',b#>>'{block,model_due_at}',b#>>'{block,residual_due_at}'])::text,'UTF8')),'hex')
$$;
create function edu_tips_private.queue_control(req uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare cfg edu_tips_private.control_settings; q edu_tips_private.erasure_outbox; s edu_tips_private.subjects; b jsonb; authority edu_tips_private.control_authorities;
begin
 select * into cfg from edu_tips_private.control_settings where id=1 for share;
 if not cfg.capture_enabled then return false;end if;
 if not exists(select 1 from edu_tips_private.erasure_consumers c where c.id=cfg.consumer_id and c.environment=cfg.environment and c.tenant_id='brandyaction' and c.brand_id='brandyaction_edu') then raise exception 'TIPS_CONTROL_CONFIGURATION';end if;
 select * into q from edu_tips_private.erasure_outbox where request_id=req;
 if not found then raise exception 'TIPS_CONTROL_REQUEST';end if;
 select * into authority from edu_tips_private.control_authorities where request_id=req;
 if not found or q.active_due_at-q.requested_at<>interval '120 hours' or q.model_due_at-q.requested_at<>interval '720 hours' or q.residual_due_at-q.requested_at<>interval '720 hours' then return false;end if;
 select * into s from edu_tips_private.subjects where id=q.subject_id;
 b:=jsonb_build_object('control_version','1.0.0-draft.1','environment',cfg.environment,'tenant_id','brandyaction','brand_id','brandyaction_edu','receiver_id','tips-customer-controls','origin_contract_version',authority.origin_contract_version,'deadline_profile',authority.deadline_profile,
 'block',jsonb_build_object('requestId',q.request_id,'customer_id',s.customer_id,'consent_epoch',s.consent_epoch,'reason',q.reason,'at',edu_tips_private.control_utc(q.requested_at),'active_due_at',edu_tips_private.control_utc(q.active_due_at),'model_due_at',edu_tips_private.control_utc(q.model_due_at),'residual_due_at',edu_tips_private.control_utc(q.residual_due_at)));
 insert into edu_tips_private.control_deliveries(request_id,consumer_id,environment,payload,request_digest) values(req,cfg.consumer_id,cfg.environment,b,edu_tips_private.control_digest(b)) on conflict(request_id) do nothing;
 return true;
end$$;
create function edu_tips_private.control_inserted() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg edu_tips_private.control_settings;
begin
 select * into cfg from edu_tips_private.control_settings where id=1 for share;
 if cfg.capture_enabled then
 insert into edu_tips_private.control_authorities(request_id,origin_contract_version,deadline_profile,authority_ref) values(new.request_id,'2.0.0-rc.2','rc2_5_30_30',cfg.source_authority_ref) on conflict(request_id) do nothing;
 perform edu_tips_private.queue_control(new.request_id);
 end if;
 return new;
end$$;
create trigger edu_tips_control_enqueue after insert on edu_tips_private.erasure_outbox for each row execute function edu_tips_private.control_inserted();
-- Explicit owner-approved activation may backfill original requests. No migration backfill.
create function public.edu_tips_backfill_control_candidate(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$
declare req uuid; n integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'TIPS_CONTROL_INVALID';end if;
 for req in select q.request_id from edu_tips_private.erasure_outbox q where q.completed_at is null
 and not exists(select 1 from edu_tips_private.control_deliveries d where d.request_id=q.request_id)
 order by q.requested_at,q.request_id limit p_limit loop
 if edu_tips_private.queue_control(req) then n:=n+1;end if;
 end loop;
 return n;
end$$;
create function public.edu_tips_claim_control_candidate(p_consumer uuid,p_environment text,p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg edu_tips_private.control_settings; r jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'TIPS_CONTROL_INVALID';end if;
 select * into cfg from edu_tips_private.control_settings where id=1 for share;
 if not cfg.sending_enabled then return '[]'::jsonb;end if;
 if p_consumer is distinct from cfg.consumer_id or p_environment is distinct from cfg.environment then raise exception 'TIPS_CONTROL_SCOPE';end if;
 with due as(select request_id from edu_tips_private.control_deliveries where consumer_id=p_consumer and environment=p_environment and confirmed_at is null and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()) order by next_attempt_at,request_id for update skip locked limit p_limit),
 claimed as(update edu_tips_private.control_deliveries d set attempt_count=d.attempt_count+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' from due where d.request_id=due.request_id returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('requestId',request_id,'leaseToken',lease_token,'attempt',attempt_count,'body',payload) order by next_attempt_at,request_id),'[]'::jsonb) into r from claimed;
 return r;
end$$;
create function public.edu_tips_confirm_control_candidate(p_request uuid,p_lease uuid,p_consumer uuid,p_environment text,p_ack jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare d edu_tips_private.control_deliveries; k text; a timestamptz;
begin
 select * into d from edu_tips_private.control_deliveries where request_id=p_request for update;
 if not found or d.consumer_id is distinct from p_consumer or d.environment is distinct from p_environment or d.lease_token is distinct from p_lease or d.lease_until is null or d.lease_until<=clock_timestamp() or d.confirmed_at is not null then return false;end if;
 if jsonb_typeof(p_ack) is distinct from 'object' or not(p_ack ?& array['control_version','environment','tenant_id','brand_id','receiver_id','requestId','customer_id','consent_epoch','request_digest','status','blocked_at','cancellation'])
 or p_ack-array['control_version','environment','tenant_id','brand_id','receiver_id','requestId','customer_id','consent_epoch','request_digest','status','blocked_at','cancellation']<>'{}'::jsonb then raise exception 'TIPS_CONTROL_ACK_INVALID';end if;
 foreach k in array array['control_version','environment','tenant_id','brand_id','receiver_id'] loop
 if p_ack->k is distinct from d.payload->k then raise exception 'TIPS_CONTROL_ACK_INVALID';end if;
 end loop;
 foreach k in array array['requestId','customer_id','consent_epoch'] loop
 if p_ack->k is distinct from d.payload#>array['block',k] then raise exception 'TIPS_CONTROL_ACK_INVALID';end if;
 end loop;
 if p_ack->>'request_digest' is distinct from d.request_digest or p_ack->>'status' is distinct from 'blocked' or p_ack->>'cancellation' is distinct from 'requested'
 or jsonb_typeof(p_ack->'blocked_at') is distinct from 'string' or p_ack->>'blocked_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(\d{3})?Z$' then raise exception 'TIPS_CONTROL_ACK_INVALID';end if;
 begin a:=(p_ack->>'blocked_at')::timestamptz;exception when others then raise exception 'TIPS_CONTROL_ACK_INVALID';end;
 if to_char(a at time zone 'UTC',case when length(p_ack->>'blocked_at')=27 then 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"' else 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' end)<>p_ack->>'blocked_at' or a<(d.payload#>>'{block,at}')::timestamptz or a>clock_timestamp()+interval '60 seconds' then raise exception 'TIPS_CONTROL_ACK_INVALID';end if;
 update edu_tips_private.control_deliveries set acknowledgment=p_ack,confirmed_at=clock_timestamp(),lease_token=null,lease_until=null,last_error_code=null,attention=false where request_id=p_request;
 return true;
end$$;
create function public.edu_tips_defer_control_candidate(p_request uuid,p_lease uuid,p_consumer uuid,p_environment text,p_code text,p_next timestamptz,p_attention boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_code is null or p_code not in ('disabled','invalid_request','invalid_configuration','timeout','network_error','remote_rejected','remote_unavailable','invalid_ack') or p_next is null or not isfinite(p_next) or p_next>clock_timestamp()+interval '3602 seconds' or p_attention is null then raise exception 'TIPS_CONTROL_INVALID';end if;
 update edu_tips_private.control_deliveries set next_attempt_at=greatest(p_next,clock_timestamp()),last_error_code=p_code,
 attention=p_attention or (payload#>>'{block,at}')::timestamptz<=clock_timestamp()-interval '60 seconds',lease_token=null,lease_until=null
 where request_id=p_request and consumer_id=p_consumer and environment=p_environment and lease_token=p_lease and lease_until>clock_timestamp() and confirmed_at is null;
 return found;
end$$;

create function public.edu_tips_control_status_candidate(p_consumer uuid,p_environment text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from edu_tips_private.erasure_consumers where id=p_consumer and environment=p_environment and brand_id='brandyaction_edu' and tenant_id='brandyaction') then raise exception 'TIPS_CONTROL_SCOPE';end if;
 return (select jsonb_build_object('pending',count(*) filter(where confirmed_at is null),'confirmed',count(*) filter(where confirmed_at is not null),
 'attention',count(*) filter(where confirmed_at is null and (attention or (payload#>>'{block,at}')::timestamptz<=clock_timestamp()-interval '60 seconds')),
 'unclassified',(select count(*) from edu_tips_private.erasure_outbox q where q.completed_at is null and not exists(select 1 from edu_tips_private.control_deliveries d where d.request_id=q.request_id)),
 'sending_enabled',coalesce((select sending_enabled and consumer_id=p_consumer and environment=p_environment from edu_tips_private.control_settings where id=1),false))
 from edu_tips_private.control_deliveries where consumer_id=p_consumer and environment=p_environment);
end$$;
revoke all on function public.edu_tips_control_status_candidate(uuid,text) from public,anon,authenticated;
grant execute on function public.edu_tips_control_status_candidate(uuid,text) to service_role;

-- Pending epoch survives retries and marketing-only revisions; generation is
-- never fabricated as new legal consent. No automatic rekey/profile migration.
create function public.edu_tips_prepare_identity_candidate(p_member uuid,p_version text,p_revision uuid,p_epoch text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pref public.edu_personalization_preferences; s edu_tips_private.subjects; pending edu_tips_private.pending_identities;
begin
 if not(select identity_enabled from edu_tips_private.control_settings where id=1) then return jsonb_build_object('error','disabled');end if;
 if p_epoch is null or p_epoch !~ '^ce_[A-Za-z0-9_-]{32}$' then raise exception 'TIPS_IDENTITY_INVALID';end if;
 perform 1 from public.profiles where id=p_member and status='active' and role not in ('admin','staff') and not is_internal and deleted_at is null for update;
 if not found or not edu_tips_private.lock_current_terms(p_version) then return jsonb_build_object('error','not_eligible');end if;
 select * into pref from public.edu_personalization_preferences where member_id=p_member for update;
 if not found or not pref.analysis or not pref.overseas or pref.wording_version is distinct from p_version or pref.revision is distinct from p_revision then return jsonb_build_object('error','not_eligible');end if;
 if exists(select 1 from edu_tips_private.subjects x join edu_tips_private.erasure_outbox q on q.subject_id=x.id where x.member_id=p_member and q.completed_at is null) then return jsonb_build_object('error','erasure_pending');end if;
 select * into s from edu_tips_private.subjects where member_id=p_member and retired_at is null;
 if found then return jsonb_build_object('state','registered','customer_id',s.customer_id,'consent_epoch',s.consent_epoch);end if;
 -- A technical rekey is not a new legal consent. Without an agreed migration
 -- authority, permit a subsequent generation only with a real post-retirement
 -- affirmative analysis/overseas receipt (marketing-only revisions do not count).
 if exists(select 1 from edu_tips_private.subjects x where x.member_id=p_member and x.retired_at is not null)
 and not exists(select 1 from public.edu_personalization_receipts r
 where r.member_id=p_member and r.wording_version=p_version
 and r.choices->'analysis'='true'::jsonb and r.choices->'overseas'='true'::jsonb
 and (r.previous_choices->'analysis' is distinct from 'true'::jsonb or r.previous_choices->'overseas' is distinct from 'true'::jsonb
 or exists(select 1 from edu_tips_private.subjects x where x.member_id=p_member and x.retired_at is not null and x.wording_version is distinct from p_version))
 and r.occurred_at >= (select max(x.retired_at) from edu_tips_private.subjects x where x.member_id=p_member))
 then return jsonb_build_object('error','identity_migration_required');end if;
 select * into pending from edu_tips_private.pending_identities where member_id=p_member and retired_at is null for update;
 if found and pending.wording_version is distinct from p_version then
 update edu_tips_private.pending_identities set retired_at=clock_timestamp() where id=pending.id;pending.id:=null;
 end if;
 if pending.id is null then
 insert into edu_tips_private.pending_identities(member_id,consent_epoch,wording_version,consent_revision) values(p_member,p_epoch,p_version,p_revision) returning * into pending;
 else update edu_tips_private.pending_identities set consent_revision=p_revision where id=pending.id;end if;
 return jsonb_build_object('state','pending','pending_id',pending.id,'consent_epoch',pending.consent_epoch,'revision',p_revision);
end$$;
create function public.edu_tips_finish_identity_candidate(p_member uuid,p_pending uuid,p_epoch text,p_customer text,p_version text,p_revision uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pending edu_tips_private.pending_identities; r jsonb;
begin
 if not(select identity_enabled from edu_tips_private.control_settings where id=1) then return jsonb_build_object('error','disabled');end if;
 perform 1 from public.profiles where id=p_member for update;
 select * into pending from edu_tips_private.pending_identities where id=p_pending and member_id=p_member and retired_at is null for update;
 if not found or pending.consent_epoch is distinct from p_epoch or pending.wording_version is distinct from p_version or pending.consent_revision is distinct from p_revision then return jsonb_build_object('error','not_eligible');end if;
 r:=public.edu_tips_register_subject(p_member,p_customer,p_epoch,p_version,p_revision);
 update edu_tips_private.pending_identities set registered_at=coalesce(registered_at,clock_timestamp()) where id=p_pending;
 return r;
end$$;
create function edu_tips_private.retire_pending_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then update edu_tips_private.pending_identities set retired_at=coalesce(retired_at,clock_timestamp()) where member_id=old.member_id and retired_at is null;return old;end if;
 if not new.analysis or not new.overseas or new.wording_version is distinct from old.wording_version then
 update edu_tips_private.pending_identities set retired_at=clock_timestamp() where member_id=new.member_id and retired_at is null;end if;
 return new;
end$$;
create trigger edu_tips_pending_consent_retire after update or delete on public.edu_personalization_preferences for each row execute function edu_tips_private.retire_pending_identity();
create function edu_tips_private.retire_pending_member() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then update edu_tips_private.pending_identities set retired_at=coalesce(retired_at,clock_timestamp()) where member_id=old.id and retired_at is null;return old;end if;
 if new.status<>'active' or new.role in ('admin','staff') or new.is_internal or new.deleted_at is not null then update edu_tips_private.pending_identities set retired_at=clock_timestamp() where member_id=new.id and retired_at is null;end if;
 return new;
end$$;
create trigger edu_tips_pending_member_retire before update of status,role,is_internal,deleted_at or delete on public.profiles for each row execute function edu_tips_private.retire_pending_member();
-- Settings cannot strand unresolved requests under a different consumer/environment.
create function edu_tips_private.guard_control_settings() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.consumer_id is distinct from old.consumer_id or new.environment is distinct from old.environment)
 and exists(select 1 from edu_tips_private.control_deliveries where confirmed_at is null) then raise exception 'TIPS_CONTROL_PENDING';end if;
 if (new.capture_enabled or new.sending_enabled) and not exists(select 1 from edu_tips_private.erasure_consumers where id=new.consumer_id and environment=new.environment and brand_id='brandyaction_edu' and tenant_id='brandyaction') then raise exception 'TIPS_CONTROL_SCOPE';end if;
 return new;
end$$;
create trigger edu_tips_control_settings_guard before update on edu_tips_private.control_settings for each row execute function edu_tips_private.guard_control_settings();
create function edu_tips_private.guard_control_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.request_id is distinct from old.request_id or new.consumer_id is distinct from old.consumer_id or new.environment is distinct from old.environment or new.payload is distinct from old.payload or new.request_digest is distinct from old.request_digest or new.created_at is distinct from old.created_at then raise exception 'TIPS_CONTROL_IMMUTABLE';end if;
 if old.confirmed_at is not null and (new.confirmed_at is distinct from old.confirmed_at or new.acknowledgment is distinct from old.acknowledgment) then raise exception 'TIPS_CONTROL_IMMUTABLE';end if;
 return new;
end$$;
create trigger edu_tips_control_snapshot_guard before update on edu_tips_private.control_deliveries for each row execute function edu_tips_private.guard_control_snapshot();
create function edu_tips_private.retire_pending_terms() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.is_current and not new.is_current then update edu_tips_private.pending_identities set retired_at=clock_timestamp() where wording_version=old.version and retired_at is null;end if;
 return new;
end$$;
create trigger edu_tips_pending_terms_retire after update of is_current on public.edu_personalization_terms for each row execute function edu_tips_private.retire_pending_terms();
revoke all on function edu_tips_private.guard_control_settings(),edu_tips_private.guard_control_snapshot(),edu_tips_private.retire_pending_terms() from public,anon,authenticated,service_role;
revoke all on function edu_tips_private.control_utc(timestamptz),edu_tips_private.control_digest(jsonb),edu_tips_private.queue_control(uuid),edu_tips_private.control_inserted(),edu_tips_private.retire_pending_identity(),edu_tips_private.retire_pending_member() from public,anon,authenticated,service_role;
revoke all on function public.edu_tips_backfill_control_candidate(integer),public.edu_tips_claim_control_candidate(uuid,text,integer),public.edu_tips_confirm_control_candidate(uuid,uuid,uuid,text,jsonb),public.edu_tips_defer_control_candidate(uuid,uuid,uuid,text,text,timestamptz,boolean),public.edu_tips_prepare_identity_candidate(uuid,text,uuid,text),public.edu_tips_finish_identity_candidate(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_tips_backfill_control_candidate(integer),public.edu_tips_claim_control_candidate(uuid,text,integer),public.edu_tips_confirm_control_candidate(uuid,uuid,uuid,text,jsonb),public.edu_tips_defer_control_candidate(uuid,uuid,uuid,text,text,timestamptz,boolean),public.edu_tips_prepare_identity_candidate(uuid,text,uuid,text),public.edu_tips_finish_identity_candidate(uuid,uuid,text,text,text,uuid) to service_role;
commit;
