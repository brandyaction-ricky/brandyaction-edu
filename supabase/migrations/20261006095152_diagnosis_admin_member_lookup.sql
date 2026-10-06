begin;
-- Exact member lookup for authenticated administrators; leaves the existing list/search function unchanged.
create function public.edu_diagnosis_admin_member(p_actor uuid,p_member uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;rows jsonb;cursor uuid; p_limit constant integer := 1;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_member is null then raise exception 'DIAGNOSIS_INVALID';end if;
 with eligible as(select p.* from public.profiles p where p.id=p_member and public.edu_diagnosis_student_eligible(p.id)),
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
revoke all on function public.edu_diagnosis_admin_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_admin_member(uuid,uuid) to service_role;
commit;
