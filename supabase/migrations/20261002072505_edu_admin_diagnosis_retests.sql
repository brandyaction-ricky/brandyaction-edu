begin;
alter table public.edu_diagnosis_control add column admin_retests_enabled boolean not null default false;
-- Preserve every old attempt; only the active pointer moves on an explicit admin restart.
-- Existing submissions are not re-scored or relabeled by this migration.
alter table public.edu_diagnosis_attempts
 add column is_current boolean not null default true,
 add column admin_test boolean not null default false,
 add column replaces_attempt_id uuid unique references public.edu_diagnosis_attempts(id);
alter table public.edu_diagnosis_attempts drop constraint edu_diagnosis_attempts_user_id_diagnosis_code_key;
create unique index edu_diagnosis_current_attempt on public.edu_diagnosis_attempts(user_id,diagnosis_code) where is_current;
create unique index edu_diagnosis_student_once on public.edu_diagnosis_attempts(user_id,diagnosis_code) where not admin_test;
create or replace function public.edu_diagnosis_has_access(p_user uuid,p_code text,p_course uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.edu_diagnosis_grants g
 join public.edu_diagnosis_offers f on f.id=g.offer_id
 join public.profiles p on p.id=g.user_id and p.status='active'
 left join public.order_items i on i.id=g.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.enrollments e on e.id=g.enrollment_id
 where public.edu_diagnosis_actor_allowed(p_user) and g.user_id=p_user and f.diagnosis_code=p_code and (p_course is null or f.course_id=p_course)
 and (p_course is not null or not exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code and a.is_current)
   or g.offer_id=(select a.offer_id from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code and a.is_current))
 and (p.role='admin' or not exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code and a.is_current and a.admin_test))
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
  exists(select 1 from public.edu_diagnosis_control c join public.profiles p on p.id=p_actor where c.singleton and p.role='admin') or
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
 if exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then
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
 insert into public.edu_diagnosis_attempts(user_id,diagnosis_code,offer_id,admin_test) values(p_actor,f.diagnosis_code,f.id,exists(select 1 from public.profiles p cross join public.edu_diagnosis_control c where p.id=p_actor and p.role='admin' and p.status='active' and c.singleton and c.admin_retests_enabled))
 on conflict(user_id,diagnosis_code) where is_current do nothing;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code=f.diagnosis_code and is_current;
 insert into public.edu_diagnosis_outbox(attempt_id) values(a.id) on conflict(attempt_id) do nothing;
 return jsonb_build_object('id',a.id,'state',a.state,'createdAt',a.created_at);
end $$;

create or replace function public.edu_diagnosis_read(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts;
begin
 if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6' and is_current;
 if not found then return jsonb_build_object('state','not_started'); end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 return jsonb_build_object('id',a.id,'state',case when a.state='preparing' and exists(select 1 from public.edu_diagnosis_outbox where attempt_id=a.id and state='needs_review') then 'needs_review' else a.state end,'createdAt',a.created_at,'updatedAt',a.updated_at);
end $$;

create or replace function public.edu_diagnosis_context(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts; f public.edu_diagnosis_offers;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6' and is_current;
 if not found then return null; end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('attemptId',a.id,'subject',a.user_id,'releaseId',f.release_id,'packageVersion',f.package_version,
  'responseId',a.remote_response_id,'revision',a.remote_revision,'state',a.state,'adminTest',a.admin_test,'canRestart',exists(select 1 from public.profiles p cross join public.edu_diagnosis_control c where p.id=p_actor and p.role='admin' and c.singleton and c.admin_retests_enabled));
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
 and (not a.admin_test or p.role='admin')
 and a.id=p_attempt and a.user_id=p_subject and a.remote_response_id=p_session and a.diagnosis_code='myin-n6'
 and f.release_id=p_release and f.package_version=p_package
 and p_revision between 0 and 2147483647 and p_revision>=a.remote_revision
 and ((g.admin_trial and p.role='admin') or (g.order_item_id is not null and o.user_id=p_subject and o.status='paid' and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_subject and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 order by g.created_at,g.id limit 1
$$;

create or replace function public.edu_diagnosis_sync_session(p_actor uuid,p_attempt uuid,p_response uuid,p_revision bigint,p_state text) returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts;
begin
 if p_response is null or p_revision is null or p_revision<0 or p_state is null or p_state not in ('in_progress','submitted') then raise exception 'DIAGNOSIS_INVALID'; end if;
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 select * into a from public.edu_diagnosis_attempts where id=p_attempt and user_id=p_actor for update;
 if not found or not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 if not a.is_current then return false; end if;
 if a.remote_response_id is not null and a.remote_response_id<>p_response then raise exception 'DIAGNOSIS_BINDING_MISMATCH'; end if;
 if p_revision<a.remote_revision or (a.state in ('submitted','processing','ready') and p_state='in_progress') then return false; end if;
 update public.edu_diagnosis_attempts set remote_response_id=p_response,remote_revision=p_revision,
  state=case when state in ('processing','ready') then state else p_state end,updated_at=now() where id=a.id;
 update public.edu_diagnosis_outbox set state='done',lease=null,lease_until=null,last_code=null where attempt_id=a.id;
 return true;
end $$;

create or replace function public.edu_diagnosis_dispatch(p_job uuid,p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.edu_diagnosis_outbox; a public.edu_diagnosis_attempts; f public.edu_diagnosis_offers;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then return null; end if;
 select * into j from public.edu_diagnosis_outbox where id=p_job and state='working' and lease=p_lease and lease_until>now() for update;
 if not found then return null; end if;
 select * into a from public.edu_diagnosis_attempts where id=j.attempt_id;
 if not a.is_current or not public.edu_diagnosis_has_access(a.user_id,a.diagnosis_code) then
  update public.edu_diagnosis_outbox set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null where id=j.id;
  return null;
 end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('version',1,'kind','ensure_session','attemptId',a.id,'subject',a.user_id,'diagnosis',a.diagnosis_code,'releaseId',f.release_id,'packageVersion',f.package_version,'adminTest',a.admin_test);
end $$;

create or replace function public.edu_diagnosis_ack(p_job uuid,p_lease uuid,p_response uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.edu_diagnosis_outbox; a public.edu_diagnosis_attempts;
begin
 if p_response is null then raise exception 'DIAGNOSIS_INVALID'; end if;
 select * into j from public.edu_diagnosis_outbox where id=p_job and state='working' and lease=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 select * into a from public.edu_diagnosis_attempts where id=j.attempt_id for update;
 if not a.is_current or not public.edu_diagnosis_has_access(a.user_id,a.diagnosis_code) then
  update public.edu_diagnosis_outbox set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null where id=j.id;
  return false;
 end if;
 if a.remote_response_id is not null and a.remote_response_id<>p_response then raise exception 'DIAGNOSIS_BINDING_MISMATCH'; end if;
 update public.edu_diagnosis_attempts set remote_response_id=p_response,state=case when state='preparing' then 'in_progress' else state end,updated_at=now() where id=a.id;
 update public.edu_diagnosis_outbox set state='done',lease=null,lease_until=null,last_code=null where id=j.id;
 return true;
end $$;

create function public.edu_diagnosis_restart(p_actor uuid,p_attempt uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.edu_diagnosis_attempts; current_attempt public.edu_diagnosis_attempts; f public.edu_diagnosis_offers; result jsonb;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled and admin_retests_enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not public.edu_diagnosis_actor_allowed(p_actor) or not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));
 select * into previous from public.edu_diagnosis_attempts where id=p_attempt and user_id=p_actor;
 if not found then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into current_attempt from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code=previous.diagnosis_code and is_current;
 -- A lost HTTP reply retries the same predecessor, never another new attempt.
 if current_attempt.replaces_attempt_id=p_attempt then return jsonb_build_object('id',current_attempt.id,'state',current_attempt.state); end if;
 if current_attempt.id is distinct from p_attempt then raise exception 'DIAGNOSIS_CONFLICT'; end if;
 select * into f from public.edu_diagnosis_offers where id=previous.offer_id and enabled;
 if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;
 update public.edu_diagnosis_attempts set is_current=false where id=previous.id;
 result:=public.edu_diagnosis_begin(p_actor,f.course_id);
 update public.edu_diagnosis_attempts set replaces_attempt_id=p_attempt where id=(result->>'id')::uuid;
 return result;
end $$;
revoke all on function public.edu_diagnosis_restart(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_restart(uuid,uuid) to service_role;
commit;
