begin;
-- Administrative lookup only. Orders remain linked by user_id, never by shared phone/email.
create function public.edu_member_payment_contacts(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'orderNumber',o.order_number,
 'name',o.customer_name,'email',o.customer_email,'phone',o.customer_phone,'status',o.status)
 order by o.created_at desc,o.id),'[]'::jsonb)
 from public.orders o where o.user_id=p_user and o.status in ('paid','refunded')
$$;
create function public.edu_member_directory_matches(p_user uuid,p_query text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and (
 btrim(p_query)='' or position(lower(btrim(p_query)) in lower(concat_ws(' ',p.full_name,p.email,p.phone,p.contact_email)))>0
 or (p_query ~ '^[+0-9 ()-]+$' and length(regexp_replace(p_query,'[^0-9]','','g'))>=4 and position(regexp_replace(p_query,'[^0-9]','','g') in regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'))>0)
 or exists(select 1 from public.orders o where o.user_id=p.id and o.status in ('paid','refunded') and (
 position(lower(btrim(p_query)) in lower(concat_ws(' ',o.order_number,o.customer_name,o.customer_email,o.customer_phone)))>0
 or (p_query ~ '^[+0-9 ()-]+$' and length(regexp_replace(p_query,'[^0-9]','','g'))>=4 and position(regexp_replace(p_query,'[^0-9]','','g') in regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g'))>0)))
 ))
$$;
create function public.edu_admin_member_directory(p_actor uuid,p_query text default '',p_status text default '',p_course uuid default null,p_member uuid default null,p_page integer default 1,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and
 (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and s.value->'members'='true'::jsonb)))) then raise exception 'MEMBER_DIRECTORY_FORBIDDEN';end if;
 if p_query is null or length(p_query)>100 or p_status is null or p_status not in ('','active','suspended') or p_page is null or p_page not between 1 and 100000 or p_limit is null or p_limit not between 1 and 100 then raise exception 'MEMBER_DIRECTORY_INVALID';end if;
 with matched as (
 select p.* from public.profiles p where p.status<>'withdrawn' and (p_member is null or p.id=p_member)
 and (p_status='' or p.status=p_status)
 and (p_course is null or exists(select 1 from public.enrollments e where e.user_id=p.id and e.course_id=p_course and e.status='active'))
 and (public.edu_member_directory_matches(p.id,p_query)
 or exists(select 1 from public.crm_member_tags mt join public.crm_tags t on t.id=mt.tag_id where mt.member_id=p.id and position(lower(btrim(p_query)) in lower(t.name))>0)
 or exists(select 1 from public.enrollments e join public.courses c on c.id=e.course_id where e.user_id=p.id and e.status='active' and position(lower(btrim(p_query)) in lower(c.title))>0))
 ), page as (select * from matched order by created_at desc,id limit p_limit offset (p_page-1)*p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('paymentContacts',public.edu_member_payment_contacts(p.id)) order by p.created_at desc,p.id) from page p),'[]'::jsonb),'total',(select count(*) from matched)) into result;
 return result;
end;$$;
revoke all on function public.edu_member_payment_contacts(uuid),public.edu_member_directory_matches(uuid,text),public.edu_admin_member_directory(uuid,text,text,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.edu_member_payment_contacts(uuid),public.edu_member_directory_matches(uuid,text),public.edu_admin_member_directory(uuid,text,text,uuid,uuid,integer,integer) to service_role;

create or replace function public.edu_diagnosis_admin_list(p_actor uuid,p_before uuid default null,p_query text default '',p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;rows jsonb;cursor uuid;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_limit is null or p_limit not between 1 and 100 or p_query is null or length(p_query)>100 then raise exception 'DIAGNOSIS_INVALID';end if;
 with eligible as(select p.* from public.profiles p where public.edu_diagnosis_student_eligible(p.id) and(p_before is null or p.id>p_before) and public.edu_member_directory_matches(p.id,p_query)),
 page as(select * from eligible order by id limit p_limit+1),visible as(select * from page order by id limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.full_name,'수강생'),'email',p.email,'phone',p.phone,'paymentContacts',public.edu_member_payment_contacts(p.id),'published',coalesce(o.enabled,c.learners_published),'override',o.enabled,
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

commit;
