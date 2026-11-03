begin;
create table public.edu_member_erasure_requests (
 request_id uuid primary key default gen_random_uuid(),
 member_id uuid not null unique references public.profiles(id),
 actor_id uuid not null references public.profiles(id),
 environment text not null check(environment in ('dev','production')),
 state text not null default 'requested' check(state in ('requested','processing','retry','blocked','complete')),
 received_at timestamptz not null default now(), deadline_at timestamptz not null default now()+interval '30 days',
 next_attempt_at timestamptz not null default now(), attempts integer not null default 0, uncertain_attempts integer not null default 0,
 lease uuid, lease_until timestamptz, disabled_at timestamptz, completed_at timestamptz,
 counts jsonb not null default '{}', storage_removed bigint not null default 0,
 storage_failed integer not null default 0, last_code text,
 check((state='processing')=(lease is not null and lease_until is not null)),
 check((state='complete')=(completed_at is not null))
);
create index edu_member_erasure_due on public.edu_member_erasure_requests(environment,next_attempt_at) where state in ('requested','retry','processing');
alter table public.edu_member_erasure_requests enable row level security;
revoke all on public.edu_member_erasure_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.edu_member_erasure_requests to service_role;

create function public.edu_request_member_erasure(p_actor uuid,p_member uuid,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; target public.profiles;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 if p_actor=p_member or p_environment not in ('dev','production') then raise exception 'ERASURE_INVALID';end if;
 select * into target from public.profiles where id=p_member for update;
 if not found then raise exception 'ERASURE_NOT_FOUND';end if;
 select * into r from public.edu_member_erasure_requests where member_id=p_member;
 if found then
   if r.environment<>p_environment then raise exception 'ERASURE_ENVIRONMENT';end if;
   return jsonb_build_object('requestId',r.request_id,'state',r.state);
 end if;
 if target.role='admin' and (select count(*) from public.profiles where role='admin' and status='active')<=1 then raise exception 'ERASURE_LAST_ADMIN';end if;
 insert into public.edu_member_erasure_requests(member_id,actor_id,environment) values(p_member,p_actor,p_environment) returning * into r;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'member.erasure_requested','profile',p_member::text,jsonb_build_object('requestId',r.request_id,'state','requested','deadlineAt',r.deadline_at));
 return jsonb_build_object('requestId',r.request_id,'state',r.state);
end;$$;

create function public.edu_claim_member_erasure(p_environment text,p_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; jobs jsonb:='[]';token uuid;
begin
 if p_environment not in ('dev','production') or p_limit not between 1 and 3 then raise exception 'ERASURE_INVALID';end if;
 for r in select * from public.edu_member_erasure_requests
   where environment=p_environment and (disabled_at is null or disabled_at<=now()-interval '3 minutes')
     and ((state in ('requested','retry') and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
   order by received_at for update skip locked limit p_limit loop
   -- Disable EDU access only when the approved worker is enabled. Intake alone never deletes a member.
   if r.disabled_at is null then
     begin
       if not exists(select 1 from public.profiles where id=r.member_id and status='withdrawn') then perform public.edu_delete_member(r.actor_id,r.member_id);end if;
       -- Stop queued session creation and drain requests signed before withdrawal.
       update public.edu_diagnosis_outbox j set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null
       from public.edu_diagnosis_attempts a where j.attempt_id=a.id and a.user_id=r.member_id and j.state in ('pending','working');
       update public.edu_member_erasure_requests set disabled_at=now(),state='retry',next_attempt_at=now()+interval '3 minutes' where request_id=r.request_id;
     exception when others then
       update public.edu_member_erasure_requests set state='blocked',last_code='LOCAL_WITHDRAWAL_BLOCKED',lease=null,lease_until=null where request_id=r.request_id;
       continue;
     end;
     continue;
   end if;
   token:=gen_random_uuid();
   update public.edu_member_erasure_requests set state='processing',lease=token,lease_until=now()+interval '2 minutes',attempts=attempts+1,
     uncertain_attempts=uncertain_attempts+case when r.state='processing' then 1 else 0 end where request_id=r.request_id;
   jobs:=jobs||jsonb_build_array(jsonb_build_object('requestId',r.request_id,'subject',r.member_id,'environment',r.environment,'lease',token));
 end loop;
 return jobs;
end;$$;

create function public.edu_finish_member_erasure(p_request uuid,p_lease uuid,p_result jsonb,p_code text,p_retryable boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; totals jsonb;done boolean;k text;
begin
 select * into r from public.edu_member_erasure_requests where request_id=p_request for update;
 if not found or r.state<>'processing' or r.lease<>p_lease then raise exception 'ERASURE_LEASE_CHANGED';end if;
 if p_code is not null and p_code !~ '^[A-Z_]{1,80}$' then raise exception 'ERASURE_INVALID';end if;
 if p_result is not null then
   if (p_result->>'requestId') is distinct from p_request::text or (p_result->>'erased') is distinct from 'true' or jsonb_typeof(p_result->'counts') is distinct from 'object'
     or coalesce(p_result->>'storageRemoved','') !~ '^\d+$' or coalesce(p_result->>'storageFailedCount','') !~ '^\d+$'
     or not (p_result->'counts' ?& array['sessions','report_requests','report_jobs','precision_calls','precision_stages','precision_artifacts','precision_quality_receipts','precision_issues','markdown_exports','precision_diagnostics','admin_report_events'])
     then raise exception 'ERASURE_INVALID';end if;
   totals:=r.counts;
   for k in select jsonb_object_keys(p_result->'counts') loop
     if k not in ('sessions','report_requests','report_jobs','precision_calls','precision_stages','precision_artifacts','precision_quality_receipts','precision_issues','markdown_exports','precision_diagnostics','admin_report_events')
       or coalesce(p_result->'counts'->>k,'') !~ '^\d+$' then raise exception 'ERASURE_INVALID';end if;
     totals:=jsonb_set(totals,array[k],to_jsonb(coalesce((r.counts->>k)::bigint,0)+(p_result->'counts'->>k)::bigint),true);
   end loop;
   update public.edu_member_erasure_requests set counts=totals,storage_removed=storage_removed+(p_result->>'storageRemoved')::bigint,storage_failed=(p_result->>'storageFailedCount')::integer where request_id=p_request;
 end if;
 done:=p_result is not null and (p_result->>'storageFailedCount')::integer=0 and p_code is null;
 update public.edu_member_erasure_requests set state=case when done then 'complete' when p_retryable then 'retry' else 'blocked' end,
   completed_at=case when done then now() end,last_code=p_code,lease=null,lease_until=null,
   uncertain_attempts=uncertain_attempts+case when p_code in ('NETWORK','INVALID_RESPONSE','UNAVAILABLE') then 1 else 0 end,
   next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(r.attempts,7))::integer)) where request_id=p_request;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 select r.actor_id,'member.diagnosis_erasure','profile',r.member_id::text,
   jsonb_build_object('requestId',request_id,'state',state,'counts',counts,'storageRemoved',storage_removed,'storageFailedCount',storage_failed,'uncertainAttempts',uncertain_attempts,'completedAt',completed_at,'code',last_code)
 from public.edu_member_erasure_requests where request_id=p_request;
 return done;
end;$$;

create function public.edu_read_member_erasure(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r."receivedAt" desc) from (
   select request_id as "requestId",member_id as "memberId",state,received_at as "receivedAt",deadline_at as "deadlineAt",next_attempt_at as "nextAttemptAt",attempts,uncertain_attempts as "uncertainAttempts",counts,storage_removed as "storageRemoved",storage_failed as "storageFailedCount",last_code as "lastCode",completed_at as "completedAt"
   from public.edu_member_erasure_requests order by received_at desc limit 100
 )r),'[]'::jsonb);
end;$$;
create function public.edu_retry_member_erasure(p_actor uuid,p_request uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 update public.edu_member_erasure_requests set state='requested',next_attempt_at=now(),last_code=null where request_id=p_request and state in ('retry','blocked');
 if not found then raise exception 'ERASURE_NOT_RETRYABLE';end if;
end;$$;
revoke all on function public.edu_request_member_erasure(uuid,uuid,text),public.edu_claim_member_erasure(text,integer),public.edu_finish_member_erasure(uuid,uuid,jsonb,text,boolean),public.edu_read_member_erasure(uuid),public.edu_retry_member_erasure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_request_member_erasure(uuid,uuid,text),public.edu_claim_member_erasure(text,integer),public.edu_finish_member_erasure(uuid,uuid,jsonb,text,boolean),public.edu_read_member_erasure(uuid),public.edu_retry_member_erasure(uuid,uuid) to service_role;
commit;
