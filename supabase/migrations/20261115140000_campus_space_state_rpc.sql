-- One database call for the study-room state and one for a heartbeat.
-- A heartbeat used to pass the API gateway about 13 times (membership, controls, presence write, seat refresh, then
-- seven reads for the state). With 120 learners on DEV the gateway stalled (p95 2 s per call) while the database sat
-- idle, so a heartbeat took 4 s. These functions run the same statements in one call. They are SECURITY INVOKER, so the
-- learner's own row-level policies and triggers apply exactly as before.
begin;
create function public.edu_campus_space_state(p_cohort uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare viewer uuid:=(select auth.uid());
begin
 if viewer is null or not public.edu_campus_space_member(p_cohort) then raise exception 'Membership required' using errcode='42501'; end if;
 return jsonb_build_object(
  'profile',(select to_jsonb(p) from (select nickname,gender,coat,status,low_motion,photo_opt_in,note,desk,accessory,desk_theme,avatar_model,hair_color,skin_color,pants_color,held_item from public.edu_campus_space_profiles where user_id=viewer) p),
  'own',(select to_jsonb(x) from (select user_id,session_id,nickname,gender,coat,status,photo_opt_in,focus_until,focus_mode,expires_at,accessory,avatar_model,hair_color,skin_color,pants_color,held_item from public.edu_campus_space_presence where cohort_id=p_cohort and user_id=viewer and expires_at>now()) x),
  'peers',coalesce((select jsonb_agg(to_jsonb(x) order by x.user_id) from (select user_id,session_id,nickname,gender,coat,status,photo_opt_in,focus_until,focus_mode,expires_at,accessory,avatar_model,hair_color,skin_color,pants_color,held_item from public.edu_campus_space_presence where cohort_id=p_cohort and expires_at>now() and user_id<>viewer order by user_id limit 23) x),'[]'::jsonb),
  'count',(select count(*) from public.edu_campus_space_presence where cohort_id=p_cohort and expires_at>now()),
  'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from (select id,user_id,nickname,body,created_at from public.edu_campus_space_chat where cohort_id=p_cohort order by created_at desc limit 60) m),'[]'::jsonb),
  'controls',(select to_jsonb(c) from (select announcement,paused,closed_zones,revision,updated_at from public.edu_campus_space_controls where cohort_id=p_cohort) c),
  'seats',coalesce((select jsonb_agg(to_jsonb(s)) from (select seat_id,user_id,session_id,expires_at from public.edu_campus_space_seats where cohort_id=p_cohort and expires_at>now()) s),'[]'::jsonb),
  'serverNow',now());
end;$$;
revoke all on function public.edu_campus_space_state(uuid) from public,anon;
grant execute on function public.edu_campus_space_state(uuid) to authenticated;
create function public.edu_campus_space_beat(p_cohort uuid,p_session uuid,p_row jsonb) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare viewer uuid:=(select auth.uid()); paused boolean; n integer;
begin
 if viewer is null or not public.edu_campus_space_member(p_cohort) then raise exception 'Membership required' using errcode='42501'; end if;
 select c.paused into paused from public.edu_campus_space_controls c where c.cohort_id=p_cohort;
 if coalesce(paused,false) then return public.edu_campus_space_state(p_cohort); end if;
 update public.edu_campus_space_presence set nickname=p_row->>'nickname',gender=p_row->>'gender',coat=p_row->>'coat',status=p_row->>'status',
  photo_opt_in=coalesce((p_row->>'photo_opt_in')::boolean,false),accessory=coalesce(p_row->>'accessory','none'),
  focus_until=(p_row->>'focus_until')::timestamptz,focus_mode=coalesce((p_row->>'focus_mode')::integer,0),
  avatar_model=(p_row->>'avatar_model')::smallint,hair_color=coalesce(p_row->>'hair_color','#302825'),skin_color=coalesce(p_row->>'skin_color','#e8b68b'),
  pants_color=coalesce(p_row->>'pants_color','#36485d'),held_item=coalesce(p_row->>'held_item','none')
 where cohort_id=p_cohort and user_id=viewer and session_id=p_session;
 get diagnostics n=row_count;
 if n=0 then raise exception 'Presence session ended' using errcode='P0002'; end if;
 update public.edu_campus_space_seats set session_id=p_session where cohort_id=p_cohort and user_id=viewer and session_id=p_session;
 return public.edu_campus_space_state(p_cohort);
end;$$;
revoke all on function public.edu_campus_space_beat(uuid,uuid,jsonb) from public,anon;
grant execute on function public.edu_campus_space_beat(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
