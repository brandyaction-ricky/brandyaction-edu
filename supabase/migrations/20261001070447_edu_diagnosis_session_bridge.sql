begin;
create function public.edu_diagnosis_available(p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('courseId',f.course_id,'title',c.title) order by c.title,f.id),'[]'::jsonb)
 from public.edu_diagnosis_offers f join public.courses c on c.id=f.course_id
 where f.enabled and exists(select 1 from public.edu_diagnosis_control where singleton and enabled)
 and exists(select 1 from public.profiles where id=p_actor and status='active') and (
  exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=p_actor and o.status='paid' and i.course_id=f.course_id)
  or exists(select 1 from public.enrollments e where e.user_id=p_actor and e.course_id=f.course_id
    and e.order_item_id is null and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
 )
$$;
create function public.edu_diagnosis_context(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts; f public.edu_diagnosis_offers;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6';
 if not found then return null; end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('attemptId',a.id,'subject',a.user_id,'releaseId',f.release_id,'packageVersion',f.package_version,
  'responseId',a.remote_response_id,'state',a.state);
end $$;
create function public.edu_diagnosis_sync_session(p_actor uuid,p_attempt uuid,p_response uuid,p_revision bigint,p_state text) returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts;
begin
 if p_response is null or p_revision is null or p_revision<0 or p_state is null or p_state not in ('in_progress','submitted') then raise exception 'DIAGNOSIS_INVALID'; end if;
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 select * into a from public.edu_diagnosis_attempts where id=p_attempt and user_id=p_actor for update;
 if not found or not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 if a.remote_response_id is not null and a.remote_response_id<>p_response then raise exception 'DIAGNOSIS_BINDING_MISMATCH'; end if;
 if p_revision<a.remote_revision or (a.state in ('submitted','processing','ready') and p_state='in_progress') then return false; end if;
 update public.edu_diagnosis_attempts set remote_response_id=p_response,remote_revision=p_revision,
  state=case when state in ('processing','ready') then state else p_state end,updated_at=now() where id=a.id;
 update public.edu_diagnosis_outbox set state='done',lease=null,lease_until=null,last_code=null where attempt_id=a.id;
 return true;
end $$;
revoke all on function public.edu_diagnosis_available(uuid),public.edu_diagnosis_context(uuid),public.edu_diagnosis_sync_session(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_available(uuid),public.edu_diagnosis_context(uuid),public.edu_diagnosis_sync_session(uuid,uuid,uuid,bigint,text) to service_role;
commit;
