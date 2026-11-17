-- Observed HTTP operations only. No message, nickname, user identity or movement is retained.
begin;
create table public.edu_campus_space_http_metrics(
 cohort_id uuid not null references public.cohorts(id) on delete cascade,bucket_at timestamptz not null,
 requests bigint not null default 0 check(requests>=0),client_errors bigint not null default 0 check(client_errors>=0),
 server_errors bigint not null default 0 check(server_errors>=0),slow_requests bigint not null default 0 check(slow_requests>=0),
 total_ms bigint not null default 0 check(total_ms>=0),max_ms integer not null default 0 check(max_ms>=0),
 primary key(cohort_id,bucket_at));
alter table public.edu_campus_space_http_metrics enable row level security;
revoke all on public.edu_campus_space_http_metrics from public,anon,authenticated;
grant all on public.edu_campus_space_http_metrics to service_role;
create function public.edu_campus_observe_space_http(p_actor uuid,p_cohort uuid,p_status integer,p_elapsed integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare bucket timestamptz;
begin
 if p_status is null or p_status<200 or p_status>599 or p_elapsed is null or p_elapsed<0 or p_elapsed>120000 then raise exception 'Invalid observation' using errcode='23514';end if;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.user_id=p_actor and e.cohort_id=p_cohort and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())) then return false;end if;
 bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/300)*300);
 insert into public.edu_campus_space_http_metrics(cohort_id,bucket_at,requests,client_errors,server_errors,slow_requests,total_ms,max_ms)
 values(p_cohort,bucket,1,(p_status between 400 and 499)::int,(p_status>=500)::int,(p_elapsed>=3000)::int,p_elapsed,p_elapsed)
 on conflict(cohort_id,bucket_at) do update set requests=edu_campus_space_http_metrics.requests+1,
 client_errors=edu_campus_space_http_metrics.client_errors+excluded.client_errors,server_errors=edu_campus_space_http_metrics.server_errors+excluded.server_errors,
 slow_requests=edu_campus_space_http_metrics.slow_requests+excluded.slow_requests,total_ms=edu_campus_space_http_metrics.total_ms+excluded.total_ms,max_ms=greatest(edu_campus_space_http_metrics.max_ms,excluded.max_ms);
 return true;
end;$$;
revoke all on function public.edu_campus_observe_space_http(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.edu_campus_observe_space_http(uuid,uuid,integer,integer) to service_role;
commit;
