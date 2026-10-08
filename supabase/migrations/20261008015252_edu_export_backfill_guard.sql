begin;
set local lock_timeout='5s';

-- Gate and snapshot run in one transaction. No session lock may survive a pooled connection.
-- Daily D-8 refresh and unsettled cohort sales dates remain available at 07:00.
create function public.edu_export_v1_guarded_source(p_dataset text,p_from date,p_to date,p_asof timestamptz,p_controls boolean)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='4s' as $$
declare today date=(p_asof at time zone 'Asia/Seoul')::date;
 hour_kst integer=extract(hour from p_asof at time zone 'Asia/Seoul');
 backfill boolean; source jsonb;
begin
 if p_asof is null or p_asof>statement_timestamp() or p_from is null or p_to is null or p_to<p_from
  or p_to>today or p_to-p_from>30 or today-p_from>180 or p_controls is null
  or p_dataset is null or p_dataset not in ('daily_totals','daily_campaign_perf','ops_daily')
 then return jsonb_build_object('status','invalid_range'); end if;
 select exists(
  select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
  where d::date<today-8 and (p_dataset='ops_daily' or not exists(
   select 1 from public.edu_analytics_orders o
   join public.order_items i on i.order_id=o.id join public.cohorts c on c.id=i.cohort_id
   where o.status in ('paid','partially_refunded','refunded')
    and o.paid_at >= (d::date::timestamp at time zone 'Asia/Seoul')
    and o.paid_at < ((d::date+1)::timestamp at time zone 'Asia/Seoul') and o.paid_at<=p_asof
    and (c.operation_end_at is null or c.operation_end_at+interval '7 days'>p_asof)
  ))
 ) into backfill;
 if backfill then
  if hour_kst<2 or hour_kst>=6 then return jsonb_build_object('status','backfill_window'); end if;
  if not pg_try_advisory_xact_lock(hashtextextended('edu_export_v1_backfill',0)) then
   return jsonb_build_object('status','backfill_busy');
  end if;
 end if;
 if p_controls then source=public.edu_export_v1_source_e5(p_from,p_to,p_asof);
 else source=public.edu_export_v1_source(p_from,p_to,p_asof); end if;
 return jsonb_build_object('status','ok','source',source);
end $$;
revoke all on function public.edu_export_v1_guarded_source(text,date,date,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.edu_export_v1_guarded_source(text,date,date,timestamptz,boolean) to service_role;
commit;
