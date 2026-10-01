begin;
-- Existing attempts retain their purchased package. An unrelated active N6
-- purchase must not revive a refunded attempt or change its pinned release.
create or replace function public.edu_diagnosis_has_access(p_user uuid,p_code text,p_course uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.edu_diagnosis_grants g
 join public.edu_diagnosis_offers f on f.id=g.offer_id
 join public.profiles p on p.id=g.user_id and p.status='active'
 left join public.order_items i on i.id=g.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.enrollments e on e.id=g.enrollment_id
 where g.user_id=p_user and f.diagnosis_code=p_code and (p_course is null or f.course_id=p_course)
 and (p_course is not null or not exists(select 1 from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code)
   or g.offer_id=(select a.offer_id from public.edu_diagnosis_attempts a where a.user_id=p_user and a.diagnosis_code=p_code))
 and ((g.order_item_id is not null and o.user_id=p_user and o.status='paid' and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_user and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 )
$$;

create or replace function public.edu_diagnosis_context(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts; f public.edu_diagnosis_offers;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6';
 if not found then return null; end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('attemptId',a.id,'subject',a.user_id,'releaseId',f.release_id,'packageVersion',f.package_version,
  'responseId',a.remote_response_id,'revision',a.remote_revision,'state',a.state);
end $$;

-- MYIN owns the frozen answer revision. A lost submission acknowledgement can
-- leave EDU's display state/revision behind; do not create another attempt or
-- accept another remote session to repair that. This function never mutates it.
create function public.edu_diagnosis_report_access(p_subject uuid,p_attempt uuid,p_session uuid,p_release uuid,p_package text,p_revision bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('grantId',g.id,'checkedAt',statement_timestamp(),'expiresAt',statement_timestamp()+interval '30 seconds')
 from public.edu_diagnosis_attempts a
 join public.edu_diagnosis_offers f on f.id=a.offer_id
 join public.edu_diagnosis_grants g on g.user_id=a.user_id and g.offer_id=a.offer_id
 join public.profiles p on p.id=a.user_id and p.status='active'
 left join public.order_items i on i.id=g.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.enrollments e on e.id=g.enrollment_id
 where exists(select 1 from public.edu_diagnosis_control where singleton and enabled)
 and a.id=p_attempt and a.user_id=p_subject and a.remote_response_id=p_session and a.diagnosis_code='myin-n6'
 and f.release_id=p_release and f.package_version=p_package
 and p_revision between 0 and 2147483647 and p_revision>=a.remote_revision
 and ((g.order_item_id is not null and o.user_id=p_subject and o.status='paid' and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_subject and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 order by g.created_at,g.id limit 1
$$;
revoke all on function public.edu_diagnosis_has_access(uuid,text,uuid),public.edu_diagnosis_context(uuid),public.edu_diagnosis_report_access(uuid,uuid,uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_has_access(uuid,text,uuid),public.edu_diagnosis_context(uuid),public.edu_diagnosis_report_access(uuid,uuid,uuid,uuid,text,bigint) to service_role;
commit;
