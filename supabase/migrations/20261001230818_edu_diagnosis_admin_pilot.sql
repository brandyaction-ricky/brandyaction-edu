begin;
-- Additive admin pilot. Activation is a separate, scoped control/offer update.
alter table public.edu_diagnosis_control add column admin_only boolean not null default false;
alter table public.edu_diagnosis_grants add column admin_trial boolean not null default false;
alter table public.edu_diagnosis_grants drop constraint edu_diagnosis_grants_check;
alter table public.edu_diagnosis_grants add constraint edu_diagnosis_grants_source_check check (
 (admin_trial and num_nonnulls(order_item_id,enrollment_id)=0)
 or (not admin_trial and num_nonnulls(order_item_id,enrollment_id)=1)
);
create unique index edu_diagnosis_admin_trial_once on public.edu_diagnosis_grants(user_id,offer_id) where admin_trial;

-- Role is rechecked in the database, including signed server-to-server proofs.
create function public.edu_diagnosis_actor_allowed(p_actor uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p cross join public.edu_diagnosis_control c
 where c.singleton and c.enabled and p.id=p_actor and p.status='active' and (not c.admin_only or p.role='admin'))
$$;
revoke all on function public.edu_diagnosis_actor_allowed(uuid) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_actor_allowed(uuid) to service_role;


create or replace function public.edu_diagnosis_fulfill_order(p_order uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled and not admin_only) then return 0; end if;
 insert into public.edu_diagnosis_grants(user_id,offer_id,order_item_id)
 select o.user_id,f.id,i.id from public.orders o
 join public.order_items i on i.order_id=o.id
 join public.edu_diagnosis_offers f on f.course_id=i.course_id and f.enabled
 where o.id=p_order and o.status='paid' and o.user_id is not null
 on conflict(order_item_id) do nothing;
 get diagnostics affected=row_count;
 return affected;
end $$;

create or replace function public.edu_diagnosis_has_access(p_user uuid,p_code text,p_course uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.edu_diagnosis_grants g
 join public.edu_diagnosis_offers f on f.id=g.offer_id
 join public.profiles p on p.id=g.user_id and p.status='active'
 left join public.order_items i on i.id=g.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.enrollments e on e.id=g.enrollment_id
 where public.edu_diagnosis_actor_allowed(p_user) and g.user_id=p_user and f.diagnosis_code=p_code and (p_course is null or f.course_id=p_course)
 and (p_course is not null or not exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code)
   or g.offer_id=(select a.offer_id from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code))
 and ((g.admin_trial and p.role='admin') or (g.order_item_id is not null and o.user_id=p_user and o.status='paid' and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_user and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 )
$$;

create or replace function public.edu_diagnosis_available(p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('courseId',f.course_id,'title',c.title) order by c.title,f.id),'[]'::jsonb)
 from public.edu_diagnosis_offers f join public.courses c on c.id=f.course_id
 where f.enabled and exists(select 1 from public.edu_diagnosis_control where singleton and enabled)
 and public.edu_diagnosis_actor_allowed(p_actor) and (
  exists(select 1 from public.edu_diagnosis_control c join public.profiles p on p.id=p_actor where c.singleton and c.admin_only and p.role='admin') or
  exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=p_actor and o.status='paid' and i.course_id=f.course_id)
  or exists(select 1 from public.enrollments e where e.user_id=p_actor and e.course_id=f.course_id
    and e.order_item_id is null and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
 )
$$;

create or replace function public.edu_diagnosis_begin(p_actor uuid,p_course uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_diagnosis_offers; a public.edu_diagnosis_attempts; o record;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where course_id=p_course and enabled;
 if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));
 if exists(select 1 from public.edu_diagnosis_control where singleton and admin_only) then
  insert into public.edu_diagnosis_grants(user_id,offer_id,admin_trial) values(p_actor,f.id,true)
  on conflict(user_id,offer_id) where admin_trial do nothing;
 else
 -- Lazy reconciliation covers an already-paid course when an offer is first enabled.
 for o in select distinct orders.id from public.orders join public.order_items i on i.order_id=orders.id
   where orders.user_id=p_actor and orders.status='paid' and i.course_id=p_course
 loop perform public.edu_diagnosis_fulfill_order(o.id); end loop;
 insert into public.edu_diagnosis_grants(user_id,offer_id,enrollment_id)
 select p_actor,f.id,e.id from public.enrollments e where e.user_id=p_actor and e.course_id=p_course
   and e.order_item_id is null and e.status='active' and e.revoked_at is null
 on conflict(enrollment_id) do nothing;
 end if;
 -- Require rights in the requested course, not merely a different diagnosis grant.
 if not public.edu_diagnosis_has_access(p_actor,f.diagnosis_code,p_course) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 insert into public.edu_diagnosis_attempts(user_id,diagnosis_code,offer_id) values(p_actor,f.diagnosis_code,f.id)
 on conflict(user_id,diagnosis_code) do nothing;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code=f.diagnosis_code;
 insert into public.edu_diagnosis_outbox(attempt_id) values(a.id) on conflict(attempt_id) do nothing;
 return jsonb_build_object('id',a.id,'state',a.state,'createdAt',a.created_at);
end $$;

create or replace function public.edu_diagnosis_read(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts;
begin
 if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6';
 if not found then return jsonb_build_object('state','not_started'); end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 return jsonb_build_object('id',a.id,'state',case when a.state='preparing' and exists(select 1 from public.edu_diagnosis_outbox where attempt_id=a.id and state='needs_review') then 'needs_review' else a.state end,'createdAt',a.created_at,'updatedAt',a.updated_at);
end $$;

create or replace function public.edu_diagnosis_context(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts; f public.edu_diagnosis_offers;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6';
 if not found then return null; end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('attemptId',a.id,'subject',a.user_id,'releaseId',f.release_id,'packageVersion',f.package_version,
  'responseId',a.remote_response_id,'revision',a.remote_revision,'state',a.state);
end $$;

create or replace function public.edu_diagnosis_report_access(p_subject uuid,p_attempt uuid,p_session uuid,p_release uuid,p_package text,p_revision bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('grantId',g.id,'checkedAt',statement_timestamp(),'expiresAt',statement_timestamp()+interval '30 seconds')
 from public.edu_diagnosis_attempts a
 join public.edu_diagnosis_offers f on f.id=a.offer_id
 join public.edu_diagnosis_grants g on g.user_id=a.user_id and g.offer_id=a.offer_id
 join public.profiles p on p.id=a.user_id and p.status='active'
 left join public.order_items i on i.id=g.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.enrollments e on e.id=g.enrollment_id
 where public.edu_diagnosis_actor_allowed(p_subject)
 and a.id=p_attempt and a.user_id=p_subject and a.remote_response_id=p_session and a.diagnosis_code='myin-n6'
 and f.release_id=p_release and f.package_version=p_package
 and p_revision between 0 and 2147483647 and p_revision>=a.remote_revision
 and ((g.admin_trial and p.role='admin') or (g.order_item_id is not null and o.user_id=p_subject and o.status='paid' and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_subject and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 order by g.created_at,g.id limit 1
$$;

commit;
