begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Internal heartbeat only. No member, request, receipt or consumer identifiers.
create table edu_tips_private.erasure_monitor_runs (
 id bigint generated always as identity primary key,
 environment text not null check(environment in ('dev','production')),
 recorded_at timestamptz not null default statement_timestamp(),
 status text not null check(status in ('no_overdue','overdue','check_unavailable')),
 checked_consumers integer not null check(checked_consumers between 0 and 8),
 pending_overdue_requests bigint not null check(pending_overdue_requests>=0),
 oldest_overdue_at timestamptz,
 constraint erasure_monitor_run_consistency check(
  (status='check_unavailable' and checked_consumers=0 and pending_overdue_requests=0 and oldest_overdue_at is null)
  or (status='no_overdue' and checked_consumers>0 and pending_overdue_requests=0 and oldest_overdue_at is null)
  or (status='overdue' and checked_consumers>0 and pending_overdue_requests>0 and oldest_overdue_at is not null)
 )
);
create index erasure_monitor_runs_latest on edu_tips_private.erasure_monitor_runs(environment,recorded_at desc,id desc);
alter table edu_tips_private.erasure_monitor_runs enable row level security;
revoke all on edu_tips_private.erasure_monitor_runs from public,anon,authenticated,service_role;
grant select,insert on edu_tips_private.erasure_monitor_runs to service_role;

create function public.edu_tips_record_erasure_monitor_run(
 p_environment text,p_status text,p_checked_consumers integer,p_pending_overdue_requests bigint,p_oldest_overdue_at timestamptz
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r edu_tips_private.erasure_monitor_runs;
begin
 insert into edu_tips_private.erasure_monitor_runs(environment,status,checked_consumers,pending_overdue_requests,oldest_overdue_at)
 values(p_environment,p_status,p_checked_consumers,p_pending_overdue_requests,p_oldest_overdue_at)
 returning * into r;
 return jsonb_build_object('recorded_at',r.recorded_at,'status',r.status);
end$$;
revoke all on function public.edu_tips_record_erasure_monitor_run(text,text,integer,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.edu_tips_record_erasure_monitor_run(text,text,integer,bigint,timestamptz) to service_role;

create function public.edu_tips_read_erasure_monitor_status(p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare latest edu_tips_private.erasure_monitor_runs; last_ok timestamptz;
begin
 if p_environment not in ('dev','production') then raise exception 'TIPS_ENVIRONMENT';end if;
 select * into latest from edu_tips_private.erasure_monitor_runs
 where environment=p_environment order by recorded_at desc,id desc limit 1;
 select recorded_at into last_ok from edu_tips_private.erasure_monitor_runs
 where environment=p_environment and status in ('no_overdue','overdue') order by recorded_at desc,id desc limit 1;
 return jsonb_build_object('last_attempt_at',latest.recorded_at,'last_success_at',last_ok,
  'last_status',latest.status,'checked_consumers',latest.checked_consumers,
  'pending_overdue_requests',latest.pending_overdue_requests,'oldest_overdue_at',latest.oldest_overdue_at);
end$$;
revoke all on function public.edu_tips_read_erasure_monitor_status(text) from public,anon,authenticated;
grant execute on function public.edu_tips_read_erasure_monitor_status(text) to service_role;
commit;
