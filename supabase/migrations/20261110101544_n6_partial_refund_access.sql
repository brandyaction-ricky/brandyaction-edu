begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Partial refunds retain N6 only while the same purchased enrollment is active.
-- Fully paid orders keep their existing lifetime N6 behavior. No grant, attempt,
-- frozen offer, answer, payment, enrollment or publication row is rewritten.
create or replace function public.edu_diagnosis_order_item_allowed(p_item uuid,p_user uuid,p_course uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.order_items i join public.orders o on o.id=i.order_id
  where i.id=p_item and i.course_id=p_course and o.user_id=p_user
  and (o.status='paid' or (o.status='partially_refunded' and exists(
   select 1 from public.enrollments e
   where e.order_item_id=i.id and e.user_id=p_user and e.course_id=p_course
    and e.cohort_id=i.cohort_id and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())
  )))
 )
$$;
revoke all on function public.edu_diagnosis_order_item_allowed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_order_item_allowed(uuid,uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_available(p_actor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('courseId',f.course_id,'title',c.title) order by c.title,f.id),'[]'::jsonb)
 from public.edu_diagnosis_offers f join public.courses c on c.id=f.course_id
 where f.enabled and exists(select 1 from public.edu_diagnosis_control where singleton and enabled)
 and public.edu_diagnosis_actor_allowed(p_actor) and (
  exists(select 1 from public.edu_diagnosis_control c join public.profiles p on p.id=p_actor where c.singleton and p.role='admin') or
  exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=p_actor and public.edu_diagnosis_order_item_allowed(i.id,p_actor,i.course_id) and i.course_id=f.course_id)
  or exists(select 1 from public.enrollments e where e.user_id=p_actor and e.course_id=f.course_id
    and e.order_item_id is null and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
 )
$function$;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_begin(p_actor uuid, p_course uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c public.edu_diagnosis_control;
  f public.edu_diagnosis_offers;
  a public.edu_diagnosis_attempts;
  o record;
begin
  -- Always lock control before actor (also in restart). An operator's pause
  -- waits for already-starting DB transactions before checking remote drain.
  select * into c from public.edu_diagnosis_control where singleton for share;
  if not found or not c.enabled then raise exception 'DIAGNOSIS_DISABLED'; end if;
  if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));

  select * into a from public.edu_diagnosis_attempts
    where user_id=p_actor and diagnosis_code='myin-n6' and is_current;
  if found then
    if not exists(select 1 from public.edu_diagnosis_offers where id=a.offer_id and course_id=p_course)
      or not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code)
    then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
    return jsonb_build_object('id',a.id,'state',a.state,'createdAt',a.created_at);
  end if;
  if not c.new_starts_enabled then raise exception 'DIAGNOSIS_STARTS_PAUSED'; end if;
  select * into f from public.edu_diagnosis_offers where course_id=p_course and enabled;
  if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;

  if exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then
    insert into public.edu_diagnosis_grants(user_id,offer_id,admin_trial) values(p_actor,f.id,true)
      on conflict(user_id,offer_id) where admin_trial do nothing;
  else
    for o in select distinct orders.id from public.orders join public.order_items i on i.order_id=orders.id
      where orders.user_id=p_actor and public.edu_diagnosis_order_item_allowed(i.id,p_actor,i.course_id) and i.course_id=p_course
    loop perform public.edu_diagnosis_fulfill_order(o.id); end loop;
    insert into public.edu_diagnosis_grants(user_id,offer_id,enrollment_id)
      select p_actor,f.id,e.id from public.enrollments e where e.user_id=p_actor and e.course_id=p_course
        and e.order_item_id is null and e.status='active' and e.revoked_at is null
        and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())
      on conflict(enrollment_id) do nothing;

    -- A source entitlement stays unique. Move only unused, still-valid grants;
    -- never relabel an attempt or the grant supporting an existing report.
    update public.edu_diagnosis_grants g set offer_id=f.id
      from public.edu_diagnosis_offers old_offer
      where g.user_id=p_actor and not g.admin_trial and g.offer_id=old_offer.id and g.offer_id<>f.id
        and old_offer.course_id=f.course_id and old_offer.diagnosis_code=f.diagnosis_code
        and not exists(select 1 from public.edu_diagnosis_attempts previous
          where previous.user_id=p_actor and previous.diagnosis_code=f.diagnosis_code)
        and (exists(select 1 from public.order_items i join public.orders paid on paid.id=i.order_id
          where i.id=g.order_item_id and paid.user_id=p_actor and public.edu_diagnosis_order_item_allowed(i.id,p_actor,i.course_id) and i.course_id=f.course_id)
          or exists(select 1 from public.enrollments e where e.id=g.enrollment_id and e.user_id=p_actor
            and e.course_id=f.course_id and e.order_item_id is null and e.status='active' and e.revoked_at is null
            and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())));
  end if;
  if not public.edu_diagnosis_has_access(p_actor,f.diagnosis_code,p_course) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
  insert into public.edu_diagnosis_attempts(user_id,diagnosis_code,offer_id,admin_test)
    values(p_actor,f.diagnosis_code,f.id,c.admin_retests_enabled and exists(
      select 1 from public.profiles where id=p_actor and role='admin' and status='active'))
    returning * into a;
  -- Require the exact new binding, not merely another grant in the same course.
  if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
  insert into public.edu_diagnosis_outbox(attempt_id) values(a.id);
  return jsonb_build_object('id',a.id,'state',a.state,'createdAt',a.created_at);
end $function$;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_fulfill_order(p_order uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare affected integer;
begin
 if not exists(select 1 from public.orders o where o.id=p_order and public.edu_diagnosis_actor_allowed(o.user_id)) then return 0;end if;
 insert into public.edu_diagnosis_grants(user_id,offer_id,order_item_id)
 select o.user_id,f.id,i.id from public.orders o join public.order_items i on i.order_id=o.id join public.edu_diagnosis_offers f on f.course_id=i.course_id and f.enabled
 where o.id=p_order and public.edu_diagnosis_order_item_allowed(i.id,o.user_id,i.course_id) and o.user_id is not null on conflict(order_item_id) do nothing;
 get diagnostics affected=row_count;return affected;
end $function$;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_has_access(p_user uuid, p_code text, p_course uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
 and ((g.admin_trial and p.role='admin') or (g.order_item_id is not null and o.user_id=p_user and public.edu_diagnosis_order_item_allowed(i.id,p_user,i.course_id) and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_user and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 )
$function$;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_report_access(p_subject uuid, p_attempt uuid, p_session uuid, p_release uuid, p_package text, p_revision bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
 and ((g.admin_trial and p.role='admin') or (g.order_item_id is not null and o.user_id=p_subject and public.edu_diagnosis_order_item_allowed(i.id,p_subject,i.course_id) and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_subject and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())))
 order by g.created_at,g.id limit 1
$function$;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_student_cohorts(p_user uuid)
 RETURNS TABLE(cohort_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select i.cohort_id from public.orders o join public.order_items i on i.order_id=o.id
 join public.cohorts c on c.id=i.cohort_id and c.course_id=i.course_id
 where o.user_id=p_user and public.edu_diagnosis_order_item_allowed(i.id,p_user,i.course_id)
 and exists(select 1 from public.edu_diagnosis_offers f where f.course_id=i.course_id and f.enabled)
 union
 select e.cohort_id from public.enrollments e join public.cohorts c on c.id=e.cohort_id and c.course_id=e.course_id
 where e.user_id=p_user and e.order_item_id is null and e.status='active' and e.revoked_at is null
 and e.access_starts_at<=now() and(e.access_ends_at is null or e.access_ends_at>now())
 and exists(select 1 from public.edu_diagnosis_offers f where f.course_id=e.course_id and f.enabled)
$function$;

CREATE OR REPLACE FUNCTION public.edu_diagnosis_student_eligible(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.profiles p where p.id=p_user and p.status='active' and p.role<>'admin' and exists(
 select 1 from public.edu_diagnosis_offers f where f.enabled and (
 exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=p_user and public.edu_diagnosis_order_item_allowed(i.id,p_user,i.course_id) and i.course_id=f.course_id)
 or exists(select 1 from public.enrollments e where e.user_id=p_user and e.course_id=f.course_id and e.order_item_id is null and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and(e.access_ends_at is null or e.access_ends_at>now())))))
$function$;

commit;
