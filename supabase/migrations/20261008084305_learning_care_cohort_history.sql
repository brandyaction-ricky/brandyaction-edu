begin;

-- Cohort completion is not enrollment revocation. Keep past cohorts and their
-- retained progress visible to operators, including an empty upcoming cohort.
-- Only this administrative read changes; learner access and send RPCs do not.
create or replace function public.edu_admin_learning_care(p_actor uuid,p_cohort uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare options jsonb; result jsonb; selected uuid;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 with roster as (
  select e.cohort_id,count(*) as members
  from public.enrollments e join public.profiles p on p.id=e.user_id
  where e.status in ('active','expired') and e.revoked_at is null
   and p.status='active' and p.role not in ('admin','staff')
  group by e.cohort_id
 ), choices as (
  select co.id,co.name,c.title,co.operation_start_at,co.operation_end_at,coalesce(r.members,0) as members,
   case when co.status='completed' or co.operation_end_at<=now() then 'completed'
    when co.status='in_progress' or co.operation_start_at<=now() then 'in_progress'
    else 'upcoming' end as lifecycle
  from public.cohorts co join public.courses c on c.id=co.course_id
  left join roster r on r.cohort_id=co.id
  where c.archived_at is null and co.status<>'cancelled'
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'courseTitle',title,
  'status',lifecycle,'startsAt',operation_start_at,'endsAt',operation_end_at,'memberCount',members)
  order by case lifecycle when 'in_progress' then 0 when 'upcoming' then 1 else 2 end,
   operation_start_at desc nulls last,name,id),'[]') into options from choices;
 selected:=coalesce(p_cohort,(options->0->>'id')::uuid);
 -- A stale/removed cohort must not silently display another cohort's members.
 if selected is not null and not exists(select 1 from jsonb_array_elements(options) c where c->>'id'=selected::text) then
  return jsonb_build_object('cohorts',options,'cohortId',selected,'rows','[]'::jsonb,'asOf',now());
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('enrollmentId',e.id,'memberId',p.id,'name',p.full_name,'email',p.email,
  'cells',edu_private.edu_learning_care_cells(e.id),
  'contactEligible',e.status='active' and (e.access_starts_at is null or e.access_starts_at<=now())
    and (e.access_ends_at is null or e.access_ends_at>now()),
  'lastVisitAt',(select max(last_seen_at) from public.edu_member_visits where user_id=p.id),
  'lastContactAt',(select max(m.created_at) from public.edu_member_messages m join public.profiles sender on sender.id=m.sender_id
    where m.recipient_id=p.id and sender.role in ('admin','staff') and not m.is_notice),
  'openQuestions',(select count(*) from public.edu_questions q where q.user_id=p.id and q.course_id=e.course_id and q.status='open' and not q.is_archived)
 ) order by p.full_name nulls last,p.id,e.id),'[]') into result
 from public.enrollments e join public.profiles p on p.id=e.user_id
 where e.cohort_id=selected and p.status='active' and p.role not in ('admin','staff')
  and e.status in ('active','expired') and e.revoked_at is null;
 return jsonb_build_object('cohorts',options,'cohortId',selected,'rows',result,'asOf',now());
end; $$;
revoke all on function public.edu_admin_learning_care(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_admin_learning_care(uuid,uuid) to service_role;

commit;
