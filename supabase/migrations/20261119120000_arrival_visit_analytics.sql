-- 문샷 AI 직원 체험(/experience/moonshot) 방문 분석 (CEO 11-19).
-- 세션 단위 기록: 입장·단계 도달·버튼 클릭·이탈(머문 시간). 이름·연락처 등 개인정보는 받지 않는다.
-- 캠퍼스 「공간별 데이터 분석」과 같은 수집 스위치(edu_campus_analytics_settings.enabled)를 따른다.
begin;
set local lock_timeout='3s';

create table public.edu_arrival_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  kind text not null check (kind in ('enter','step','click','exit')),
  station smallint not null check (station between 0 and 9),
  target text check (target is null or char_length(target) between 1 and 60),
  seconds integer check (seconds is null or seconds between 0 and 86400),
  source text check (source is null or char_length(source) <= 60),
  medium text check (medium is null or char_length(medium) <= 60),
  campaign text check (campaign is null or char_length(campaign) <= 60),
  occurred_at timestamptz not null default now()
);
create index edu_arrival_events_occurred_idx on public.edu_arrival_events (occurred_at);
create index edu_arrival_events_session_idx on public.edu_arrival_events (session_id, occurred_at);
alter table public.edu_arrival_events enable row level security;
revoke all on public.edu_arrival_events from public, anon, authenticated;
-- Prod does not grant service_role by default on new tables (11-18 finding): grant explicitly.
grant select, insert on public.edu_arrival_events to service_role;
grant usage on sequence public.edu_arrival_events_id_seq to service_role;

create function public.edu_arrival_record(p_session uuid, p_events jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  if not exists(select 1 from public.edu_campus_analytics_settings where id=true and enabled) then return 0; end if;
  if p_session is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 40 then raise exception 'invalid arrival events' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session::text, 1119));
  if (select count(*) from public.edu_arrival_events where session_id=p_session and occurred_at > now() - interval '1 minute') >= 200 then return 0; end if;
  insert into public.edu_arrival_events(session_id, kind, station, target, seconds, source, medium, campaign)
  select p_session, e.kind, e.station, nullif(e.target, ''), e.seconds, nullif(e.source, ''), nullif(e.medium, ''), nullif(e.campaign, '')
  from jsonb_to_recordset(p_events) as e(kind text, station smallint, target text, seconds integer, source text, medium text, campaign text);
  get diagnostics inserted = row_count;
  return inserted;
end;$$;
revoke all on function public.edu_arrival_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.edu_arrival_record(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
