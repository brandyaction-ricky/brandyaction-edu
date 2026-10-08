begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Pause only new identities during a coordinated release change. Existing
-- sessions, answers, submissions and reports continue using their frozen offer.
alter table public.edu_diagnosis_control
  add column if not exists new_starts_enabled boolean not null default true;

-- Serialize with existing starts; preserve the current pause/publication state.
select singleton from public.edu_diagnosis_control where singleton for update;

create or replace function public.edu_diagnosis_begin(p_actor uuid,p_course uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
      where orders.user_id=p_actor and orders.status='paid' and i.course_id=p_course
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
          where i.id=g.order_item_id and paid.user_id=p_actor and paid.status='paid' and i.course_id=f.course_id)
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
end $$;

create or replace function public.edu_diagnosis_restart(p_actor uuid,p_attempt uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  c public.edu_diagnosis_control;
  previous public.edu_diagnosis_attempts;
  current_attempt public.edu_diagnosis_attempts;
  f public.edu_diagnosis_offers;
  result jsonb;
begin
  select * into c from public.edu_diagnosis_control where singleton for share;
  if not found or not c.enabled or not c.admin_retests_enabled then raise exception 'DIAGNOSIS_DISABLED'; end if;
  if not public.edu_diagnosis_actor_allowed(p_actor) or not exists(
    select 1 from public.profiles where id=p_actor and role='admin' and status='active')
    then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));
  select * into previous from public.edu_diagnosis_attempts where id=p_attempt and user_id=p_actor;
  if not found then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
  select * into current_attempt from public.edu_diagnosis_attempts
    where user_id=p_actor and diagnosis_code=previous.diagnosis_code and is_current;
  if current_attempt.replaces_attempt_id=p_attempt then
    return jsonb_build_object('id',current_attempt.id,'state',current_attempt.state);
  end if;
  if current_attempt.id is distinct from p_attempt then raise exception 'DIAGNOSIS_CONFLICT'; end if;
  if not c.new_starts_enabled then raise exception 'DIAGNOSIS_STARTS_PAUSED'; end if;
  -- The predecessor may belong to a retired offer. begin selects the active
  -- offer for this same course and creates a separate admin grant/attempt.
  select * into f from public.edu_diagnosis_offers where id=previous.offer_id;
  if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;
  update public.edu_diagnosis_attempts set is_current=false where id=previous.id;
  result:=public.edu_diagnosis_begin(p_actor,f.course_id);
  update public.edu_diagnosis_attempts set replaces_attempt_id=p_attempt where id=(result->>'id')::uuid;
  return result;
end $$;

revoke all on function public.edu_diagnosis_begin(uuid,uuid),public.edu_diagnosis_restart(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_begin(uuid,uuid),public.edu_diagnosis_restart(uuid,uuid) to service_role;
commit;
