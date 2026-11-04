begin;
-- Compact telemetry; never stores message content, URLs, bot credentials or profile names.
create table public.edu_campus_activity_batches (
 id uuid primary key, session_id uuid not null, scope text not null check(scope ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 user_id uuid references public.profiles(id) on delete set null,
 events jsonb not null check(jsonb_typeof(events)='array' and jsonb_array_length(events)<=32),
 dwell jsonb not null check(jsonb_typeof(dwell)='object'), occurred_at timestamptz not null default now()
);
create index edu_campus_activity_period_idx on public.edu_campus_activity_batches(occurred_at,scope);
create index edu_campus_activity_session_idx on public.edu_campus_activity_batches(session_id,occurred_at desc);
alter table public.edu_campus_activity_batches enable row level security;
revoke all on public.edu_campus_activity_batches from anon,authenticated;
grant select,insert,delete on public.edu_campus_activity_batches to service_role;
create function public.edu_campus_record_activity(p_id uuid,p_session uuid,p_scope text,p_user uuid,p_events jsonb,p_dwell jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_total numeric;
begin
 if not exists(select 1 from public.site_settings where key='edu_operations' and value->>'trackingEnabled'='true') then return false; end if;
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
create function public.edu_campus_activity_report(p_from timestamptz,p_to timestamptz,p_scope text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with batches as materialized(select * from public.edu_campus_activity_batches where occurred_at>=p_from and occurred_at<p_to and (p_scope is null or scope=p_scope) and p_to>p_from and p_to-p_from<=interval '93 days'),
 actions as(select session_id,scope,occurred_at,e->>'room' room,e->>'action' action,e->>'target' target from batches cross join lateral jsonb_array_elements(events) e),
 dwell_minutes as(select session_id,d.key room,date_trunc('minute',occurred_at) minute_bucket,least(60,sum(d.value::numeric)) seconds from batches cross join lateral jsonb_each_text(dwell) d group by session_id,d.key,date_trunc('minute',occurred_at)),
 room_visitors as(select room,count(distinct session_id) visitors from (select room,session_id from actions union select room,session_id from dwell_minutes) x group by room),
 room_actions as(select room,count(*) filter(where action='room_enter') entries,count(*) filter(where action not in ('room_enter')) clicks,count(distinct session_id) filter(where action in ('detail','consult','checkout')) intent_sessions from actions group by room),
 room_time as(select room,sum(seconds) active_seconds from dwell_minutes group by room),
 per_room as(select v.room,v.visitors,coalesce(a.entries,0) entries,coalesce(a.clicks,0) clicks,coalesce(t.active_seconds,0) active_seconds,round(coalesce(t.active_seconds,0)/greatest(v.visitors,1),1) avg_active_seconds,coalesce(a.intent_sessions,0) intent_sessions from room_visitors v left join room_actions a using(room) left join room_time t using(room)),
 action_totals as(select action,count(*) count,count(distinct session_id) sessions from actions group by action),
 resources as(select room,action,target,count(*) count,count(distinct session_id) sessions from actions where action in ('video_open','resource_open','resource_download') group by room,action,target),
 targets as(select room,action,target,count(*) count,count(distinct session_id) sessions from actions where target is not null group by room,action,target),
 per_scope as(select scope,count(distinct session_id) sessions from batches group by scope)
 select jsonb_build_object('sessions',(select count(distinct session_id) from batches),'batches',(select count(*) from batches),'activeSeconds',coalesce((select sum(seconds) from dwell_minutes),0),'rooms',coalesce((select jsonb_agg(to_jsonb(r)) from per_room r),'[]'::jsonb),'actions',coalesce((select jsonb_agg(to_jsonb(a)) from action_totals a),'[]'::jsonb),'resources',coalesce((select jsonb_agg(to_jsonb(r)) from resources r),'[]'::jsonb),'targets',coalesce((select jsonb_agg(to_jsonb(t)) from targets t),'[]'::jsonb),'scopes',coalesce((select jsonb_agg(to_jsonb(s)) from per_scope s),'[]'::jsonb));
$$;
revoke all on function public.edu_campus_record_activity(uuid,uuid,text,uuid,jsonb,jsonb), public.edu_campus_activity_report(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.edu_campus_record_activity(uuid,uuid,text,uuid,jsonb,jsonb), public.edu_campus_activity_report(timestamptz,timestamptz,text) to service_role;
create function public.edu_campus_activity_retention() returns bigint language sql security invoker set search_path='' as $$
 with expired as(select id from public.edu_campus_activity_batches where occurred_at<now()-interval '90 days' order by occurred_at limit 10000), removed as(delete from public.edu_campus_activity_batches where id in(select id from expired) returning id) select count(*) from removed;
$$;
revoke all on function public.edu_campus_activity_retention() from public,anon,authenticated;
grant execute on function public.edu_campus_activity_retention() to service_role;
commit;
