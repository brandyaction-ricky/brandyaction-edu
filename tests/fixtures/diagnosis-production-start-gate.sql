-- Read-only production function snapshot for transition regression tests.
alter table public.edu_diagnosis_control add column new_starts_enabled boolean not null default true;
CREATE OR REPLACE FUNCTION public.edu_diagnosis_begin(p_actor uuid, p_course uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f public.edu_diagnosis_offers; a public.edu_diagnosis_attempts; o record;
begin
 -- Pause serializes with starts without changing the existing release selection.
 perform 1 from public.edu_diagnosis_control where singleton for share;
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not public.edu_diagnosis_actor_allowed(p_actor) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where course_id=p_course and enabled;
 if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));
 -- Existing current attempts may continue while new starts are paused.
 if not (select new_starts_enabled from public.edu_diagnosis_control where singleton)
   and not exists(select 1 from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6' and is_current)
 then raise exception 'DIAGNOSIS_STARTS_PAUSED'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.edu_diagnosis_restart(p_actor uuid, p_attempt uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare previous public.edu_diagnosis_attempts; current_attempt public.edu_diagnosis_attempts; f public.edu_diagnosis_offers; result jsonb;
begin
 -- Pause serializes with starts without changing the existing release selection.
 perform 1 from public.edu_diagnosis_control where singleton for share;
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled and admin_retests_enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not public.edu_diagnosis_actor_allowed(p_actor) or not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));
 select * into previous from public.edu_diagnosis_attempts where id=p_attempt and user_id=p_actor;
 if not found then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into current_attempt from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code=previous.diagnosis_code and is_current;
 -- A lost HTTP reply retries the same predecessor, never another new attempt.
 if current_attempt.replaces_attempt_id=p_attempt then return jsonb_build_object('id',current_attempt.id,'state',current_attempt.state); end if;
 if current_attempt.id is distinct from p_attempt then raise exception 'DIAGNOSIS_CONFLICT'; end if;
 -- Keep the existing replay path above; pause only creation of a new attempt.
 if not (select new_starts_enabled from public.edu_diagnosis_control where singleton)
 then raise exception 'DIAGNOSIS_STARTS_PAUSED'; end if;
 select * into f from public.edu_diagnosis_offers where id=previous.offer_id and enabled;
 if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;
 update public.edu_diagnosis_attempts set is_current=false where id=previous.id;
 result:=public.edu_diagnosis_begin(p_actor,f.course_id);
 update public.edu_diagnosis_attempts set replaces_attempt_id=p_attempt where id=(result->>'id')::uuid;
 return result;
end $function$
;
