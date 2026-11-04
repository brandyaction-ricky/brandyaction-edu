begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Local candidate only. No scheduler, recipient, key or feature is seeded.
-- Observing overdue evidence must survive a later receipt claiming timely deletion.
create table edu_tips_private.erasure_deadline_breaches (
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 request_id uuid not null references edu_tips_private.erasure_outbox(request_id),
 stage text not null check(stage in ('active','model','residual')),
 due_at timestamptz not null,
 first_detected_at timestamptz not null default statement_timestamp(),
 cause text not null check(cause in ('evidence_overdue','reported_late')),
 primary key(consumer_id,request_id,stage)
);
alter table edu_tips_private.erasure_deadline_breaches enable row level security;
revoke all on edu_tips_private.erasure_deadline_breaches from public,anon,authenticated,service_role;
grant select,insert on edu_tips_private.erasure_deadline_breaches to service_role;

-- Server-internal report, NOT the TIPS public API. Identities/receipt payloads
-- never leave this function. Missing consumer configuration is an error, not OK.
create function public.edu_tips_check_erasure_deadlines(p_consumer uuid,p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare checked_at timestamptz:=statement_timestamp(); result jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>200 then raise exception 'TIPS_INVALID';end if;
 -- Same lock order as publication, receipts and ACK.
 perform 1 from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if not found then raise exception 'TIPS_CONSUMER';end if;

 insert into edu_tips_private.erasure_deadline_breaches(consumer_id,request_id,stage,due_at,first_detected_at,cause)
 select p_consumer,q.request_id,x.stage,x.due_at,checked_at,
  case when x.done_at is null then 'evidence_overdue' else 'reported_late' end
 from edu_tips_private.erasure_outbox q
 left join edu_tips_private.erasure_deliveries d on d.request_id=q.request_id and d.consumer_id=p_consumer
 left join edu_tips_private.erasure_receipts r on r.consumer_id=d.consumer_id and r.request_id=d.request_id and r.revision=d.accepted_revision
 cross join lateral (values
  ('active',q.active_due_at,(r.payload->>'active_erased_at')::timestamptz),
  ('model',q.model_due_at,case when r.payload->>'models' in ('done','not_applicable') then (r.payload->>'model_resolved_at')::timestamptz end),
  ('residual',q.residual_due_at,case when r.payload->>'residuals' in ('done','not_applicable') then (r.payload->>'residual_erased_at')::timestamptz end)
 ) as x(stage,due_at,done_at)
 where coalesce(x.done_at,checked_at)>x.due_at
 on conflict(consumer_id,request_id,stage) do nothing;

 with source as materialized (
  select q.request_id,q.requested_at,q.completed_at as globally_verified_at,
   d.delivery_id,d.ordinal,d.accepted_revision,d.phase,d.completed_at as reported_completed_at,
   c.acked_ordinal,coalesce(d.deadline_breached,false) as receipt_deadline_breached,
   q.active_due_at,q.model_due_at,q.residual_due_at,
   (r.payload->>'active_erased_at')::timestamptz as active_at,
   case when r.payload->>'models' in ('done','not_applicable') then (r.payload->>'model_resolved_at')::timestamptz end as model_at,
   case when r.payload->>'residuals' in ('done','not_applicable') then (r.payload->>'residual_erased_at')::timestamptz end as residual_at
  from edu_tips_private.erasure_outbox q
  cross join edu_tips_private.erasure_consumers c
  left join edu_tips_private.erasure_deliveries d on d.request_id=q.request_id and d.consumer_id=c.id
  left join edu_tips_private.erasure_receipts r on r.consumer_id=d.consumer_id and r.request_id=d.request_id and r.revision=d.accepted_revision
  where c.id=p_consumer
 ), stages as materialized (
  select s.request_id,x.stage,x.due_at,x.done_at,
   x.done_at is null and checked_at>x.due_at as pending_overdue,
   x.done_at>x.due_at as reported_late
  from source s cross join lateral (values
   ('active',s.active_due_at,s.active_at),('model',s.model_due_at,s.model_at),('residual',s.residual_due_at,s.residual_at)
  ) as x(stage,due_at,done_at)
 ), flagged as materialized (
  select s.*,
   coalesce((select jsonb_agg(x.stage order by x.due_at,x.stage) from stages x where x.request_id=s.request_id and x.pending_overdue),'[]'::jsonb) as pending_stages,
   (select min(x.due_at) from stages x where x.request_id=s.request_id and x.pending_overdue) as overdue_since,
   coalesce((select jsonb_agg(x.stage order by x.stage) from stages x where x.request_id=s.request_id and x.reported_late),'[]'::jsonb) as late_stages,
   coalesce((select jsonb_agg(jsonb_build_object('stage',b.stage,'due_at',b.due_at,'first_detected_at',b.first_detected_at,'cause',b.cause) order by b.due_at,b.stage)
    from edu_tips_private.erasure_deadline_breaches b where b.consumer_id=p_consumer and b.request_id=s.request_id),'[]'::jsonb) as breach_history
  from source s
 ), summary as (
  select count(*) as total_requests,
   count(*) filter(where delivery_id is null) as unpublished_requests,
   count(*) filter(where coalesce(accepted_revision,0)=0) as no_receipt_requests,
   count(*) filter(where pending_stages<>'[]'::jsonb) as pending_overdue_requests,
   count(*) filter(where late_stages<>'[]'::jsonb) as reported_late_requests,
   count(*) filter(where breach_history<>'[]'::jsonb or receipt_deadline_breached) as breach_history_requests,
   count(*) filter(where reported_completed_at is not null and ordinal>acked_ordinal) as awaiting_ack_requests,
   count(*) filter(where reported_completed_at is not null and globally_verified_at is null) as awaiting_global_verification_requests,
   min(overdue_since) as oldest_overdue_at
  from flagged
 ), limited as (
  select * from flagged where breach_history<>'[]'::jsonb or receipt_deadline_breached
  order by overdue_since nulls last,requested_at,request_id limit p_limit
 )
 select jsonb_build_object('checked_at',checked_at,'consumer_id',p_consumer,
  'environment',(select environment from edu_tips_private.erasure_consumers where id=p_consumer),
  'summary',(select to_jsonb(s) from summary s),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'request_id',request_id,'delivery_id',delivery_id,'phase',phase,
   'pending_overdue_stages',pending_stages,'reported_late_stages',late_stages,'breach_history',breach_history,
   'receipt_deadline_breached',receipt_deadline_breached,'reported_completed_at',reported_completed_at
  ) order by overdue_since nulls last,requested_at,request_id) from limited),'[]'::jsonb),
  'truncated',(select breach_history_requests>p_limit from summary)) into result;
 return result;
end$$;
revoke all on function public.edu_tips_check_erasure_deadlines(uuid,integer) from public,anon,authenticated;
grant execute on function public.edu_tips_check_erasure_deadlines(uuid,integer) to service_role;
commit;
