begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Existing pending requests stay unapproved. Installing this migration deletes nobody.
alter table public.edu_member_erasure_requests
 add column approved_at timestamptz,
 add column approved_by uuid references public.profiles(id),
 add column auth_erased_at timestamptz,
 add constraint edu_erasure_approval_pair check((approved_at is null)=(approved_by is null));

create function public.edu_approve_member_erasure(p_actor uuid,p_request uuid,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 if p_environment is null or p_environment not in ('dev','production') then raise exception 'ERASURE_ENVIRONMENT';end if;
 select * into r from public.edu_member_erasure_requests where request_id=p_request for update;
 if not found or r.environment<>p_environment then raise exception 'ERASURE_NOT_FOUND';end if;
 if r.member_id=p_actor then raise exception 'ERASURE_SELF';end if;
 if r.state='complete' or (r.state='processing' and r.lease_until>now()) then
  return jsonb_build_object('requestId',r.request_id,'state',r.state);
 end if;
 -- Recheck current permission and last-administrator protection in the existing function.
 if r.disabled_at is null then
  if not exists(select 1 from public.profiles where id=r.member_id and status='withdrawn') then
   perform public.edu_delete_member(p_actor,r.member_id);
  end if;
  -- This address and channel choices were added after the original withdrawal function.
  update public.profiles set contact_email=null,marketing_use_consent_at=null,ad_sms_consent_at=null,
   ad_kakao_consent_at=null,ad_email_consent_at=null,consent_revision=gen_random_uuid(),consent_updated_at=now()
   where id=r.member_id;
  -- Preserve consent receipts; revoke the current choices and trigger downstream erasure.
  update public.edu_personalization_preferences set analysis=false,overseas=false,revision=gen_random_uuid(),updated_at=now() where member_id=r.member_id;
  update public.edu_diagnosis_outbox j set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null
   from public.edu_diagnosis_attempts a where j.attempt_id=a.id and a.user_id=r.member_id and j.state in ('pending','working');
 end if;
 update public.edu_member_erasure_requests set
  approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,p_actor),disabled_at=coalesce(disabled_at,now()),
  state='requested',lease=null,lease_until=null,last_code=null,
  next_attempt_at=greatest(now(),coalesce(disabled_at,now())+interval '3 minutes')
 where request_id=p_request;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'member.erasure_approved','profile',r.member_id::text,jsonb_build_object('requestId',p_request,'environment',p_environment));
 return jsonb_build_object('requestId',p_request,'state','requested');
end;$$;

create function public.edu_claim_approved_member_erasure(p_environment text,p_limit integer default 3,p_request uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; jobs jsonb:='[]';token uuid;
begin
 if p_environment is null or p_environment not in ('dev','production') or p_limit is null or p_limit not between 1 and 3 then raise exception 'ERASURE_INVALID';end if;
 for r in select * from public.edu_member_erasure_requests
   where approved_at is not null and environment=p_environment and (p_request is null or request_id=p_request) and (disabled_at is null or disabled_at<=now()-interval '3 minutes')
     and ((state in ('requested','retry') and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
   order by received_at for update skip locked limit p_limit loop
   if r.disabled_at is null then raise exception 'ERASURE_NOT_WITHDRAWN';end if;
   token:=gen_random_uuid();
   update public.edu_member_erasure_requests set state='processing',lease=token,lease_until=now()+interval '2 minutes',attempts=attempts+1,
     uncertain_attempts=uncertain_attempts+case when r.state='processing' then 1 else 0 end where request_id=r.request_id;
   jobs:=jobs||jsonb_build_array(jsonb_build_object('requestId',r.request_id,'subject',r.member_id,'environment',r.environment,'lease',token,'authErased',r.auth_erased_at is not null));
 end loop;
 return jobs;
end;$$;


-- Keep the scheduled worker signature; it can only claim explicitly approved requests.
create or replace function public.edu_claim_member_erasure(p_environment text,p_limit integer default 3)
returns jsonb language sql security invoker set search_path='' as $$
 select public.edu_claim_approved_member_erasure(p_environment,p_limit,null);
$$;
create function public.edu_record_member_auth_erasure(p_request uuid,p_lease uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.edu_member_erasure_requests set auth_erased_at=coalesce(auth_erased_at,now())
 where request_id=p_request and state='processing' and lease=p_lease and lease_until>now() and approved_at is not null and disabled_at is not null;
 if not found then raise exception 'ERASURE_LEASE_CHANGED';end if;
end;$$;
create or replace function public.edu_finish_member_erasure(p_request uuid,p_lease uuid,p_result jsonb,p_code text,p_retryable boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; totals jsonb;done boolean;k text;
begin
 select * into r from public.edu_member_erasure_requests where request_id=p_request for update;
 if not found or r.state<>'processing' or r.lease is distinct from p_lease or r.lease_until<=now() then raise exception 'ERASURE_LEASE_CHANGED';end if;
 if p_code is not null and p_code !~ '^[A-Z_]{1,80}$' then raise exception 'ERASURE_INVALID';end if;
 if p_result is not null and r.auth_erased_at is null then raise exception 'ERASURE_AUTH_PENDING';end if;
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


create or replace function public.edu_read_member_erasure(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r."receivedAt" desc) from (
  select q.request_id as "requestId",q.member_id as "memberId",q.state,q.received_at as "receivedAt",q.deadline_at as "deadlineAt",
   q.next_attempt_at as "nextAttemptAt",q.attempts,q.uncertain_attempts as "uncertainAttempts",q.counts,q.storage_removed as "storageRemoved",
   q.storage_failed as "storageFailedCount",q.last_code as "lastCode",q.completed_at as "completedAt",
   q.approved_at as "approvedAt",q.disabled_at as "disabledAt",q.auth_erased_at as "authErasedAt",
   case when q.disabled_at is null then p.full_name end as "memberName",
   case when q.disabled_at is null then p.email end as "memberEmail"
  from public.edu_member_erasure_requests q join public.profiles p on p.id=q.member_id order by q.received_at desc limit 100
 )r),'[]'::jsonb);
end;$$;
-- Old clients may requeue an approved request, but cannot authorize a pending request.
create or replace function public.edu_retry_member_erasure(p_actor uuid,p_request uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare environment text;
begin
 select q.environment into environment from public.edu_member_erasure_requests q where request_id=p_request and approved_at is not null and state in ('retry','blocked');
 if environment is null then raise exception 'ERASURE_NOT_RETRYABLE';end if;
 perform public.edu_approve_member_erasure(p_actor,p_request,environment);
end;$$;
revoke all on function public.edu_approve_member_erasure(uuid,uuid,text),public.edu_claim_approved_member_erasure(text,integer,uuid),public.edu_record_member_auth_erasure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_approve_member_erasure(uuid,uuid,text),public.edu_claim_approved_member_erasure(text,integer,uuid),public.edu_record_member_auth_erasure(uuid,uuid) to service_role;
commit;
