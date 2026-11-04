begin;
set local lock_timeout='5s';
-- Empty rules preserve the current global/member publication choices.
create table public.edu_diagnosis_cohort_publication (
 cohort_id uuid primary key references public.cohorts(id),
 enabled boolean not null,
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.edu_diagnosis_cohort_publication enable row level security;
revoke all on public.edu_diagnosis_cohort_publication from public,anon,authenticated,service_role;
grant select,insert,update on public.edu_diagnosis_cohort_publication to service_role;
alter table public.edu_diagnosis_admin_events drop constraint edu_diagnosis_admin_events_action_check;
alter table public.edu_diagnosis_admin_events add constraint edu_diagnosis_admin_events_action_check
 check(action in ('publish_all','publish_member','publish_cohort','retry_report'));

-- Match the existing paid-order/manual-grant eligibility, using actual cohort IDs.
-- Paid orders remain eligible after curriculum access expires, as before.
create function public.edu_diagnosis_student_cohorts(p_user uuid) returns table(cohort_id uuid)
language sql stable security invoker set search_path='' as $$
 select i.cohort_id from public.orders o join public.order_items i on i.order_id=o.id
 join public.cohorts c on c.id=i.cohort_id and c.course_id=i.course_id
 where o.user_id=p_user and o.status='paid'
 and exists(select 1 from public.edu_diagnosis_offers f where f.course_id=i.course_id and f.enabled)
 union
 select e.cohort_id from public.enrollments e join public.cohorts c on c.id=e.cohort_id and c.course_id=e.course_id
 where e.user_id=p_user and e.order_item_id is null and e.status='active' and e.revoked_at is null
 and e.access_starts_at<=now() and(e.access_ends_at is null or e.access_ends_at>now())
 and exists(select 1 from public.edu_diagnosis_offers f where f.course_id=e.course_id and f.enabled)
$$;
create function public.edu_diagnosis_student_published(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select enabled from public.edu_diagnosis_publication_overrides where user_id=p_user),
 (select bool_or(coalesce(r.enabled,c.learners_published)) from public.edu_diagnosis_student_cohorts(p_user) s
 left join public.edu_diagnosis_cohort_publication r on r.cohort_id=s.cohort_id),c.learners_published)
 from public.edu_diagnosis_control c where c.singleton
$$;
create or replace function public.edu_diagnosis_actor_allowed(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p cross join public.edu_diagnosis_control c
 where c.singleton and c.enabled and p.id=p_actor and p.status='active' and (
 p.role='admin' or exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p_actor and not a.admin_test)
 or (public.edu_diagnosis_student_eligible(p_actor) and public.edu_diagnosis_student_published(p_actor))))
$$;

create function public.edu_diagnosis_admin_cohort_publication(p_actor uuid,p_request uuid,p_cohort uuid,p_enabled boolean,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.edu_diagnosis_control;e public.edu_diagnosis_admin_events;v jsonb;payload jsonb;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_request is null or p_cohort is null or p_enabled is null or p_revision is null or p_revision<0 then raise exception 'DIAGNOSIS_INVALID';end if;
 payload:=jsonb_build_object('enabled',p_enabled,'revision',p_revision,'cohortId',p_cohort);
 select * into c from public.edu_diagnosis_control where singleton for update;
 select * into e from public.edu_diagnosis_admin_events where request_id=p_request;
 if found then
 if e.actor_id<>p_actor or e.action<>'publish_cohort' or e.payload<>payload then raise exception 'DIAGNOSIS_CONFLICT';end if;
 return e.result;end if;
 if c.publication_revision<>p_revision then raise exception 'DIAGNOSIS_CONFLICT';end if;
 if c.enabled is distinct from true then raise exception 'DIAGNOSIS_DISABLED';end if;
 if not exists(select 1 from public.cohorts h join public.edu_diagnosis_offers f on f.course_id=h.course_id and f.enabled where h.id=p_cohort) then raise exception 'DIAGNOSIS_INVALID';end if;
 insert into public.edu_diagnosis_cohort_publication(cohort_id,enabled,updated_by) values(p_cohort,p_enabled,p_actor)
 on conflict(cohort_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 update public.edu_diagnosis_control set publication_revision=publication_revision+1 where singleton returning * into c;
 v:=jsonb_build_object('revision',c.publication_revision,'cohortId',p_cohort,'enabled',p_enabled);
 insert into public.edu_diagnosis_admin_events(request_id,actor_id,action,payload,result) values(p_request,p_actor,'publish_cohort',payload,v);
 return v;
end $$;

-- Keep legacy global/member API signatures and receipt payloads compatible.
create or replace function public.edu_diagnosis_admin_publication(p_actor uuid,p_request uuid,p_action text,p_user uuid,p_enabled boolean,p_revision bigint)
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
 if c.enabled is distinct from true then raise exception 'DIAGNOSIS_DISABLED';end if;
 if p_action='publish_member' then
 if not public.edu_diagnosis_student_eligible(p_user) then raise exception 'DIAGNOSIS_FORBIDDEN';end if;
 insert into public.edu_diagnosis_publication_overrides(user_id,enabled,updated_by) values(p_user,p_enabled,p_actor)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 else
 update public.edu_diagnosis_control set learners_published=p_enabled where singleton;
 -- Preserve the existing safeupdate protection while retaining explicit bulk semantics.
 update public.edu_diagnosis_publication_overrides set enabled=p_enabled,updated_by=p_actor,updated_at=now() where user_id is not null;
 update public.edu_diagnosis_cohort_publication set enabled=p_enabled,updated_by=p_actor,updated_at=now() where cohort_id is not null;
 end if;
 update public.edu_diagnosis_control set publication_revision=publication_revision+1 where singleton returning * into c;
 v:=jsonb_build_object('revision',c.publication_revision,'allPublished',c.learners_published,'userId',p_user,'enabled',p_enabled);
 insert into public.edu_diagnosis_admin_events(request_id,actor_id,action,user_id,payload,result) values(p_request,p_actor,p_action,p_user,payload,v);return v;
end $$;

create function public.edu_diagnosis_admin_scoped_list(p_actor uuid,p_cohort uuid default null,p_member uuid default null,p_before uuid default null,p_query text default '',p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;rows jsonb;cursor uuid;choices jsonb;scope_state jsonb;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_limit is null or p_limit not between 1 and 100 or p_query is null or length(p_query)>100 or(p_member is not null and p_cohort is not null) then raise exception 'DIAGNOSIS_INVALID';end if;
 if p_cohort is not null and not exists(select 1 from public.cohorts h join public.edu_diagnosis_offers f on f.course_id=h.course_id and f.enabled where h.id=p_cohort) then raise exception 'DIAGNOSIS_INVALID';end if;
 with eligible as materialized (
 select p.* from public.profiles p where public.edu_diagnosis_student_eligible(p.id)
 and(p_member is null or p.id=p_member)
 and(p_cohort is null or exists(select 1 from public.edu_diagnosis_student_cohorts(p.id) s where s.cohort_id=p_cohort))
 ),page as(select * from eligible p where(p_before is null or p.id>p_before) and public.edu_member_directory_matches(p.id,p_query) order by id limit p_limit+1),
 visible as(select * from page order by id limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.full_name,'수강생'),'email',p.email,'phone',p.phone,'paymentContacts',public.edu_member_payment_contacts(p.id),
 'published',public.edu_diagnosis_student_published(p.id),'override',o.enabled,
 'attemptId',a.id,'state',coalesce(a.state,'not_started'),'startedAt',a.created_at,'updatedAt',a.updated_at,
 'report',case when r.attempt_id is null then null else jsonb_build_object('state',r.state,'checkedAt',r.checked_at,'updatedAt',r.updated_at,'errorCode',r.error_code,'canRetry',r.retry_allowed,'version',r.remote_version,'details',r.details) end,
 'binding',case when a.remote_response_id is null then null else jsonb_build_object('subject',p.id,'attemptId',a.id,'responseId',a.remote_response_id,'releaseId',f.release_id,'packageVersion',f.package_version) end) order by p.id),'[]'::jsonb),
 case when(select count(*) from page)>p_limit then(select max(id::text)::uuid from visible) else null end into rows,cursor
 from visible p left join public.edu_diagnosis_publication_overrides o on o.user_id=p.id
 left join public.edu_diagnosis_attempts a on a.user_id=p.id and a.is_current and not a.admin_test
 left join public.edu_diagnosis_offers f on f.id=a.offer_id left join public.edu_diagnosis_report_observations r on r.attempt_id=a.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'code',h.cohort_code,'courseTitle',t.title,'enabled',coalesce(r.enabled,c.learners_published),'inherited',r.enabled is null) order by t.title,h.created_at desc,h.id),'[]'::jsonb)
 into choices from public.cohorts h join public.courses t on t.id=h.course_id cross join public.edu_diagnosis_control c
 left join public.edu_diagnosis_cohort_publication r on r.cohort_id=h.id
 where c.singleton and exists(select 1 from public.edu_diagnosis_offers f where f.course_id=h.course_id and f.enabled);
 if p_cohort is not null then
 select jsonb_build_object('id',h.id,'name',h.name,'enabled',coalesce(r.enabled,c.learners_published),'inherited',r.enabled is null,
 'individualCount',(select count(*) from public.profiles p join public.edu_diagnosis_publication_overrides o on o.user_id=p.id where public.edu_diagnosis_student_eligible(p.id) and exists(select 1 from public.edu_diagnosis_student_cohorts(p.id) s where s.cohort_id=p_cohort)))
 into scope_state from public.cohorts h cross join public.edu_diagnosis_control c left join public.edu_diagnosis_cohort_publication r on r.cohort_id=h.id where c.singleton and h.id=p_cohort;
 end if;
 select jsonb_build_object('enabled',c.enabled,'allPublished',c.learners_published,'revision',c.publication_revision,'rows',rows,'nextCursor',cursor,'cohorts',choices,'cohort',scope_state,
 'eligibleCount',(select count(*) from public.profiles p where public.edu_diagnosis_student_eligible(p.id) and(p_cohort is null or exists(select 1 from public.edu_diagnosis_student_cohorts(p.id) s where s.cohort_id=p_cohort))),
 'startedCount',(select count(*) from public.profiles p where public.edu_diagnosis_student_eligible(p.id) and(p_cohort is null or exists(select 1 from public.edu_diagnosis_student_cohorts(p.id) s where s.cohort_id=p_cohort)) and exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p.id and not a.admin_test)))
 into result from public.edu_diagnosis_control c where c.singleton;
 return result;
end $$;
create or replace function public.edu_diagnosis_admin_list(p_actor uuid,p_before uuid default null,p_query text default '',p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path='' as $$
 select public.edu_diagnosis_admin_scoped_list(p_actor,null,null,p_before,p_query,p_limit)
$$;
create or replace function public.edu_diagnosis_admin_member(p_actor uuid,p_member uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_member is null then raise exception 'DIAGNOSIS_INVALID';end if;
 return public.edu_diagnosis_admin_scoped_list(p_actor,null,p_member,null,'',1);
end $$;
revoke all on function public.edu_diagnosis_student_cohorts(uuid),public.edu_diagnosis_student_published(uuid),public.edu_diagnosis_admin_cohort_publication(uuid,uuid,uuid,boolean,bigint),public.edu_diagnosis_admin_scoped_list(uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_student_cohorts(uuid),public.edu_diagnosis_student_published(uuid),public.edu_diagnosis_admin_cohort_publication(uuid,uuid,uuid,boolean,bigint),public.edu_diagnosis_admin_scoped_list(uuid,uuid,uuid,uuid,text,integer) to service_role;
commit;
