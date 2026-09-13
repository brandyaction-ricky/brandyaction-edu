-- Additive, nullable measurements: do not invent engagement for historical sessions.
alter table public.funnel_sessions
  add column if not exists page_dwell_ms integer check (page_dwell_ms between 0 and 86400000),
  add column if not exists max_scroll_depth numeric check (max_scroll_depth between 0 and 100);

-- Preserve the existing audited/deduplicated ingestion and all legacy reports.
create or replace function public.edu_ingest_landing_performance(p_packet jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  lid uuid := (p_packet->>'landing_id')::uuid;
  sid uuid := (p_packet->>'session_id')::uuid;
  vid uuid := (p_packet->>'visitor_id')::uuid;
  ver integer := (p_packet->>'layout_ver')::integer;
  dwell integer; depth numeric;
begin
  perform public.edu_ingest_landing(p_packet);
  if not exists (
    select 1 from public.landing_configs l join public.courses c on c.id = l.id
    where l.id = lid and l.enabled and c.status = 'published' and c.archived_at is null
  ) then return; end if;
  select max((value->'payload'->>'dwellMs')::integer), max((value->'payload'->>'scrollPct')::numeric)
    into dwell, depth from jsonb_array_elements(p_packet->'events')
    where value->>'event_type' = 'view_page' and value->'payload' ? 'dwellMs' and value->'payload' ? 'scrollPct';
  if dwell is null or depth is null then return; end if;
  update public.funnel_sessions
    set page_dwell_ms = greatest(page_dwell_ms, dwell), max_scroll_depth = greatest(max_scroll_depth, depth)
    where landing_id = lid and session_id = sid and visitor_id = vid and layout_ver = ver;
end $$;
revoke all on function public.edu_ingest_landing_performance(jsonb) from public, anon, authenticated;
grant execute on function public.edu_ingest_landing_performance(jsonb) to service_role;

-- The existing (landing_id, created_at, layout_ver) index bounds the session scan.
-- Identifiers are used only inside the aggregate; no raw session/event rows are returned.
create or replace function public.edu_landing_performance(p_landing uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '90 days' then
    raise exception 'INVALID_PERFORMANCE_RANGE';
  end if;
  return (
    with base as materialized (
      select session_id, visitor_id, created_at, last_seen_at, clicks, page_dwell_ms, max_scroll_depth,
        (created_at at time zone 'Asia/Seoul')::date as day,
        coalesce(nullif(attribution->>'utm_source', ''), nullif(regexp_replace(attribution->>'referrer', '^https?://', ''), ''), 'direct') source
      from public.funnel_sessions
      where landing_id = p_landing and created_at >= p_start and created_at < p_end
    ), visits as (
      select session_id, visitor_id, sum(page_dwell_ms) dwell_ms, max(max_scroll_depth) scroll_depth
      from base group by session_id, visitor_id
    ), totals as (
      select count(distinct visitor_id) visitors, coalesce(sum(clicks), 0) clicks,
        count(distinct visitor_id) filter (where clicks > 0) converted_visitors from base
    ), engagement as (
      select count(*) sessions, count(dwell_ms) measured_sessions,
        avg(dwell_ms) avg_dwell_ms, avg(scroll_depth) avg_scroll_depth from visits
    ), days as (
      select day_value::date as day from generate_series((p_start at time zone 'Asia/Seoul')::date,
        (p_end at time zone 'Asia/Seoul')::date - 1, interval '1 day') as series(day_value)
    ), daily as (
      select d.day, count(distinct b.visitor_id) visitors, coalesce(sum(b.clicks), 0) clicks
      from days d left join base b using(day) group by d.day
    ), sources as (
      select source, count(distinct visitor_id) visitors, coalesce(sum(clicks), 0) clicks
      from base group by source order by visitors desc, clicks desc, source limit 8
    )
    select jsonb_build_object(
      'summary', (select to_jsonb(totals) || to_jsonb(engagement) from totals cross join engagement),
      'daily', coalesce((select jsonb_agg(to_jsonb(daily) order by day) from daily), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(to_jsonb(sources) order by visitors desc, clicks desc, source) from sources), '[]'::jsonb),
      'last_event_at', (select max(last_seen_at) from base)
    )
  );
end $$;
revoke all on function public.edu_landing_performance(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.edu_landing_performance(uuid,timestamptz,timestamptz) to service_role;
