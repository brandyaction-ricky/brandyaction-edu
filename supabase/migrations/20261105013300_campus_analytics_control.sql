begin;
-- Campus collection has its own switch; existing whole-site tracking is unchanged.
create table public.edu_campus_analytics_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null
);
insert into public.edu_campus_analytics_settings(id) values(true);
alter table public.edu_campus_analytics_settings enable row level security;
revoke all on public.edu_campus_analytics_settings from public,anon,authenticated;
grant select,update on public.edu_campus_analytics_settings to service_role;
create or replace function public.edu_campus_record_activity(p_id uuid,p_session uuid,p_scope text,p_user uuid,p_events jsonb,p_dwell jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_total numeric;
begin
 if not exists(select 1 from public.edu_campus_analytics_settings where id=true and enabled) then return false; end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>32 or jsonb_typeof(p_dwell)<>'object' then raise exception 'invalid activity'; end if;
 if exists(select 1 from jsonb_array_elements(p_events) e where e->>'room' not in ('live','welcome','study','office','library') or e->>'action' not in ('room_enter','room_gate','tool_open','map_open','camera_switch','lesson_open','avatar_save','reaction','quiz_answer','video_open','resource_open','resource_download','detail','consult','checkout','bot_save')) then raise exception 'invalid action'; end if;
 select coalesce(sum(value::numeric),0) into v_total from jsonb_each_text(p_dwell);
 if v_total<0 or v_total>35 or exists(select 1 from jsonb_each_text(p_dwell) where key not in ('live','welcome','study','office','library') or value::numeric<0 or value::numeric<>floor(value::numeric)) then raise exception 'invalid dwell'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,531));
 if exists(select 1 from public.edu_campus_activity_batches where id=p_id) then return true; end if;
 if (select count(*) from public.edu_campus_activity_batches where session_id=p_session and occurred_at>now()-interval '1 minute')>=6 then return false; end if;
 insert into public.edu_campus_activity_batches(id,session_id,scope,user_id,events,dwell) values(p_id,p_session,p_scope,p_user,p_events,p_dwell);
 return true;
end;$$;
commit;
