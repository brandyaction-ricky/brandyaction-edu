begin;
-- Publication changes affect new starts, never erase frozen answers or stop submitted jobs.
alter table public.edu_diagnosis_control add column learners_published boolean not null default false,
 add column publication_revision bigint not null default 0 check(publication_revision>=0);
create table public.edu_diagnosis_publication_overrides (
 user_id uuid primary key references public.profiles(id), enabled boolean not null,
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
create table public.edu_diagnosis_admin_events (
 request_id uuid primary key,actor_id uuid not null references public.profiles(id),
 action text not null check(action in ('publish_all','publish_member','retry_report')),
 user_id uuid references public.profiles(id),attempt_id uuid references public.edu_diagnosis_attempts(id),
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create index edu_diagnosis_admin_events_attempt on public.edu_diagnosis_admin_events(attempt_id,created_at);
create table public.edu_diagnosis_report_observations (
 attempt_id uuid primary key references public.edu_diagnosis_attempts(id),
 state text not null check(state in ('not_submitted','queued','processing','ready','needs_review','access_denied')),
 updated_at timestamptz not null,checked_at timestamptz not null default now(),
 error_code text check(error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
 retry_allowed boolean not null default false,remote_version text not null check(length(remote_version)<=150),
 details jsonb not null default '[]'::jsonb check(jsonb_typeof(details)='array' and octet_length(details::text)<=16384)
);
alter table public.edu_diagnosis_publication_overrides enable row level security;
alter table public.edu_diagnosis_admin_events enable row level security;
alter table public.edu_diagnosis_report_observations enable row level security;
revoke all on public.edu_diagnosis_publication_overrides,public.edu_diagnosis_admin_events,public.edu_diagnosis_report_observations from public,anon,authenticated,service_role;
grant select,insert,update on public.edu_diagnosis_publication_overrides,public.edu_diagnosis_report_observations to service_role;
grant select,insert on public.edu_diagnosis_admin_events to service_role;
grant update(learners_published,publication_revision) on public.edu_diagnosis_control to service_role;
create function public.edu_diagnosis_assert_admin(p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
begin if not exists(select 1 from public.profiles where id=p_actor and status='active' and role='admin') then raise exception 'DIAGNOSIS_FORBIDDEN';end if;end $$;
create function public.edu_diagnosis_student_eligible(p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and p.status='active' and p.role<>'admin' and exists(
 select 1 from public.edu_diagnosis_offers f where f.enabled and (
 exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=p_user and o.status='paid' and i.course_id=f.course_id)
 or exists(select 1 from public.enrollments e where e.user_id=p_user and e.course_id=f.course_id and e.order_item_id is null and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and(e.access_ends_at is null or e.access_ends_at>now())))))
$$;
create or replace function public.edu_diagnosis_actor_allowed(p_actor uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p cross join public.edu_diagnosis_control c where c.singleton and c.enabled and p.id=p_actor and p.status='active' and(
 p.role='admin' or exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p_actor and not a.admin_test)
 or (public.edu_diagnosis_student_eligible(p_actor) and coalesce((select enabled from public.edu_diagnosis_publication_overrides where user_id=p_actor),c.learners_published))))
$$;
create or replace function public.edu_diagnosis_fulfill_order(p_order uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if not exists(select 1 from public.orders o where o.id=p_order and public.edu_diagnosis_actor_allowed(o.user_id)) then return 0;end if;
 insert into public.edu_diagnosis_grants(user_id,offer_id,order_item_id)
 select o.user_id,f.id,i.id from public.orders o join public.order_items i on i.order_id=o.id join public.edu_diagnosis_offers f on f.course_id=i.course_id and f.enabled
 where o.id=p_order and o.status='paid' and o.user_id is not null on conflict(order_item_id) do nothing;
 get diagnostics affected=row_count;return affected;
end $$;
create function public.edu_diagnosis_admin_publication(p_actor uuid,p_request uuid,p_action text,p_user uuid,p_enabled boolean,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.edu_diagnosis_control;e public.edu_diagnosis_admin_events;v jsonb;payload jsonb;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_request is null or p_enabled is null or p_revision is null or p_revision<0 or p_action is null or p_action not in('publish_all','publish_member') or(p_action='publish_all' and p_user is not null) or(p_action='publish_member' and p_user is null) then raise exception 'DIAGNOSIS_INVALID';end if;
 payload:=jsonb_build_object('enabled',p_enabled,'revision',p_revision,'userId',p_user);
 select * into c from public.edu_diagnosis_control where singleton for update;
 select * into e from public.edu_diagnosis_admin_events where request_id=p_request;
 if found then if e.actor_id<>p_actor or e.action<>p_action or e.payload<>payload then raise exception 'DIAGNOSIS_CONFLICT';end if;return e.result;end if;
 if c.publication_revision<>p_revision then raise exception 'DIAGNOSIS_CONFLICT';end if;
 if not c.enabled then raise exception 'DIAGNOSIS_DISABLED';end if;
 if p_action='publish_member' then
 if not public.edu_diagnosis_student_eligible(p_user) then raise exception 'DIAGNOSIS_FORBIDDEN';end if;
 insert into public.edu_diagnosis_publication_overrides(user_id,enabled,updated_by) values(p_user,p_enabled,p_actor)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 else update public.edu_diagnosis_control set learners_published=p_enabled where singleton;
 update public.edu_diagnosis_publication_overrides set enabled=p_enabled,updated_by=p_actor,updated_at=now();end if;
 update public.edu_diagnosis_control set publication_revision=publication_revision+1 where singleton returning * into c;
 v:=jsonb_build_object('revision',c.publication_revision,'allPublished',c.learners_published,'userId',p_user,'enabled',p_enabled);
 insert into public.edu_diagnosis_admin_events(request_id,actor_id,action,user_id,payload,result) values(p_request,p_actor,p_action,p_user,payload,v);return v;
end $$;
create function public.edu_diagnosis_admin_list(p_actor uuid,p_before uuid default null,p_query text default '',p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;rows jsonb;cursor uuid;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_limit is null or p_limit not between 1 and 100 or p_query is null or length(p_query)>100 then raise exception 'DIAGNOSIS_INVALID';end if;
 with eligible as(select p.* from public.profiles p where public.edu_diagnosis_student_eligible(p.id) and(p_before is null or p.id>p_before) and(p_query='' or position(lower(p_query) in lower(coalesce(p.full_name,'')))>0)),
 page as(select * from eligible order by id limit p_limit+1),visible as(select * from page order by id limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.full_name,'수강생'),'published',coalesce(o.enabled,c.learners_published),'override',o.enabled,
 'attemptId',a.id,'state',coalesce(a.state,'not_started'),'startedAt',a.created_at,'updatedAt',a.updated_at,
 'report',case when r.attempt_id is null then null else jsonb_build_object('state',r.state,'checkedAt',r.checked_at,'updatedAt',r.updated_at,'errorCode',r.error_code,'canRetry',r.retry_allowed,'version',r.remote_version,'details',r.details) end,
 'binding',case when a.remote_response_id is null then null else jsonb_build_object('subject',p.id,'attemptId',a.id,'responseId',a.remote_response_id,'releaseId',f.release_id,'packageVersion',f.package_version) end) order by p.id),'[]'::jsonb),
 case when(select count(*) from page)>p_limit then(select max(id::text)::uuid from visible) else null end into rows,cursor
 from visible p cross join public.edu_diagnosis_control c left join public.edu_diagnosis_publication_overrides o on o.user_id=p.id
 left join public.edu_diagnosis_attempts a on a.user_id=p.id and a.is_current and not a.admin_test
 left join public.edu_diagnosis_offers f on f.id=a.offer_id left join public.edu_diagnosis_report_observations r on r.attempt_id=a.id where c.singleton;
 select jsonb_build_object('enabled',enabled,'allPublished',learners_published,'revision',publication_revision,'rows',rows,'nextCursor',cursor,
 'eligibleCount',(select count(*) from public.profiles p where public.edu_diagnosis_student_eligible(p.id)),
 'startedCount',(select count(*) from public.profiles p where public.edu_diagnosis_student_eligible(p.id) and exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p.id and not a.admin_test))) into result from public.edu_diagnosis_control where singleton;
 return result;
end $$;
create function public.edu_diagnosis_admin_context(p_actor uuid,p_attempt uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts;f public.edu_diagnosis_offers;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 select * into a from public.edu_diagnosis_attempts where id=p_attempt and not admin_test and is_current;
 if a.id is null or not public.edu_diagnosis_has_access(a.user_id,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN';end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('subject',a.user_id,'attemptId',a.id,'responseId',a.remote_response_id,'releaseId',f.release_id,'packageVersion',f.package_version);
end $$;
revoke all on function public.edu_diagnosis_assert_admin(uuid),public.edu_diagnosis_student_eligible(uuid),public.edu_diagnosis_admin_publication(uuid,uuid,text,uuid,boolean,bigint),public.edu_diagnosis_admin_list(uuid,uuid,text,integer),public.edu_diagnosis_admin_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_assert_admin(uuid),public.edu_diagnosis_student_eligible(uuid),public.edu_diagnosis_admin_publication(uuid,uuid,text,uuid,boolean,bigint),public.edu_diagnosis_admin_list(uuid,uuid,text,integer),public.edu_diagnosis_admin_context(uuid,uuid) to service_role;
-- Only the trusted bridge can record bounded, non-content status observations.
create function public.edu_diagnosis_admin_observe(p_actor uuid,p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb;b jsonb;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise exception 'DIAGNOSIS_INVALID';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 b:=public.edu_diagnosis_admin_context(p_actor,(r->>'attemptId')::uuid);
 if (b->>'subject',b->>'responseId',b->>'releaseId',b->>'packageVersion') is distinct from (r->>'subject',r->>'responseId',r->>'releaseId',r->>'packageVersion') then raise exception 'DIAGNOSIS_FORBIDDEN';end if;
 insert into public.edu_diagnosis_report_observations(attempt_id,state,updated_at,error_code,retry_allowed,remote_version,details)
 values((r->>'attemptId')::uuid,r->>'state',(r->>'updatedAt')::timestamptz,r->>'errorCode',(r->>'canRetry')::boolean,r->>'version',r->'details')
 on conflict(attempt_id) do update set state=excluded.state,updated_at=excluded.updated_at,error_code=excluded.error_code,retry_allowed=excluded.retry_allowed,remote_version=excluded.remote_version,details=excluded.details,checked_at=now();
 end loop;
end $$;
-- Replaying a request returns its original receipt; actor and attempt remain bound.
create function public.edu_diagnosis_admin_retry_receipt(p_actor uuid,p_request uuid,p_attempt uuid,p_expected text,p_result jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.edu_diagnosis_admin_events;b jsonb;payload jsonb;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);b:=public.edu_diagnosis_admin_context(p_actor,p_attempt);
 if p_request is null or p_expected is null or p_expected !~ '^[a-f0-9]{64}$' then raise exception 'DIAGNOSIS_INVALID';end if;
 payload:=jsonb_build_object('attemptId',p_attempt,'expectedVersion',p_expected);
 perform 1 from public.edu_diagnosis_control where singleton for update;
 select * into e from public.edu_diagnosis_admin_events where request_id=p_request;
 if found then if e.actor_id<>p_actor or e.action<>'retry_report' or e.attempt_id<>p_attempt or e.payload<>payload then raise exception 'DIAGNOSIS_CONFLICT';end if;return e.result;end if;
 if p_result is null then return null;end if;
 if p_result->>'state'<>'queued' or p_result->>'requestId' is distinct from p_request::text or p_result->>'attemptId' is distinct from p_attempt::text then raise exception 'DIAGNOSIS_INVALID';end if;
 insert into public.edu_diagnosis_admin_events(request_id,actor_id,action,user_id,attempt_id,payload,result) values(p_request,p_actor,'retry_report',(b->>'subject')::uuid,p_attempt,payload,p_result);
 return p_result;
end $$;
revoke all on function public.edu_diagnosis_admin_observe(uuid,jsonb),public.edu_diagnosis_admin_retry_receipt(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_admin_observe(uuid,jsonb),public.edu_diagnosis_admin_retry_receipt(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
