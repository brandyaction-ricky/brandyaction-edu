-- Additive campaign operations fields. Existing telemetry and manual actuals remain intact.
alter table public.landing_actuals
  add column if not exists room_members integer check (room_members >= 0),
  add column if not exists payments_new integer check (payments_new >= 0),
  add column if not exists payments_existing integer check (payments_existing >= 0);

create or replace function public.edu_landing_performance_filtered(
  p_landing uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_campaign text default '',
  p_adset text default '',
  p_creative text default '',
  p_device text default ''
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '90 days' then
    raise exception 'INVALID_PERFORMANCE_RANGE';
  end if;
  return (
    with base as materialized (
      select session_id, visitor_id, created_at, last_seen_at, clicks, page_dwell_ms, max_scroll_depth,
        (created_at at time zone 'Asia/Seoul')::date as day,
        coalesce(attribution->>'utm_campaign', '') as campaign,
        coalesce(attribution->>'utm_term', '') as adset,
        coalesce(attribution->>'utm_content', '') as creative,
        coalesce(attribution->>'device', 'unknown') as device,
        case when lower(coalesce(attribution->>'utm_source', '')) = 'meta' then 'meta'
          when coalesce(attribution->>'utm_source', '') <> '' then 'other'
          when coalesce(attribution->>'referrer', '') = '' then 'direct' else 'other' end traffic
      from public.funnel_sessions
      where landing_id = p_landing and created_at >= p_start and created_at < p_end
    ), filtered as materialized (
      select * from base where
        (p_campaign = '' or campaign = p_campaign) and
        (p_adset = '' or adset = p_adset) and
        (p_creative = '' or creative = p_creative) and
        (p_device = '' or device = p_device)
    ), totals as (
      select count(distinct visitor_id) visitors, coalesce(sum(clicks), 0) clicks,
        count(distinct visitor_id) filter (where clicks > 0) converted_visitors,
        count(*) sessions, count(*) filter (where clicks > 0) converted_sessions,
        count(page_dwell_ms) measured_sessions, avg(page_dwell_ms) avg_dwell_ms,
        avg(max_scroll_depth) avg_scroll_depth from filtered
    ), days as (
      select day_value::date as day from generate_series((p_start at time zone 'Asia/Seoul')::date,
        (p_end at time zone 'Asia/Seoul')::date - 1, interval '1 day') as series(day_value)
    ), daily as (
      select d.day, count(distinct f.visitor_id) visitors, count(f.session_id) sessions,
        coalesce(sum(f.clicks), 0) clicks, count(f.session_id) filter (where f.clicks > 0) converted_sessions
      from days d left join filtered f using(day) group by d.day
    ), sources as (
      select campaign, adset, creative, traffic, device, count(distinct visitor_id) visitors,
        count(*) sessions, coalesce(sum(clicks), 0) clicks, count(*) filter (where clicks > 0) converted_sessions,
        avg(page_dwell_ms) avg_dwell_ms, avg(max_scroll_depth) avg_scroll_depth
      from filtered group by campaign, adset, creative, traffic, device
      order by sessions desc, clicks desc, campaign, adset, creative, device
    ), export_rows as (
      select day, campaign, adset, creative, traffic, device, count(distinct visitor_id) visitors,
        count(*) sessions, coalesce(sum(clicks), 0) clicks, count(*) filter (where clicks > 0) converted_sessions,
        avg(page_dwell_ms) avg_dwell_ms, avg(max_scroll_depth) avg_scroll_depth
      from filtered group by day, campaign, adset, creative, traffic, device
      order by day, campaign, adset, creative, device
    ), choices as (
      select jsonb_build_object(
        'campaigns', coalesce(jsonb_agg(distinct campaign) filter (where campaign <> ''), '[]'::jsonb),
        'adsets', coalesce(jsonb_agg(distinct adset) filter (where adset <> ''), '[]'::jsonb),
        'creatives', coalesce(jsonb_agg(distinct creative) filter (where creative <> ''), '[]'::jsonb),
        'devices', coalesce(jsonb_agg(distinct device), '[]'::jsonb)
      ) value from base
    )
    select jsonb_build_object(
      'summary', (select to_jsonb(totals) from totals),
      'daily', coalesce((select jsonb_agg(to_jsonb(daily) order by day) from daily), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
      'export_rows', coalesce((select jsonb_agg(to_jsonb(export_rows)) from export_rows), '[]'::jsonb),
      'options', (select value from choices),
      'last_event_at', (select max(last_seen_at) from filtered)
    )
  );
end $$;

revoke all on function public.edu_landing_performance_filtered(uuid,timestamptz,timestamptz,text,text,text,text) from public, anon, authenticated;
grant execute on function public.edu_landing_performance_filtered(uuid,timestamptz,timestamptz,text,text,text,text) to service_role;
