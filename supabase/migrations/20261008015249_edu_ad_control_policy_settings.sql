begin;
set local lock_timeout='5s';
alter table public.edu_ad_control_policies
 add column cpr_limit_krw integer not null default 4500 check(cpr_limit_krw between 1 and 1000000),
 add column roas_floor numeric not null default 5 check(roas_floor between 0.1 and 100),
 add column refund_request_limit integer not null default 5 check(refund_request_limit between 1 and 10000);
-- Replace only the old override check, regardless of its generated name.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.edu_ad_control_policies'::regclass
  and contype='c' and pg_get_constraintdef(oid) like '%override_until%'
 loop execute format('alter table public.edu_ad_control_policies drop constraint %I',c.conname); end loop;
end $$;
alter table public.edu_ad_control_policies add constraint edu_ad_control_override_valid check(
 (mode='auto' and override_until is null) or (mode='freeze' and override_until is null) or
 (mode in ('freeze','release') and override_until is not null and override_until>updated_at and override_until<=updated_at+interval '72 hours'));

create or replace function public.edu_ad_control_save(p_actor uuid,p_policy jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid=(p_policy->>'cohort_id')::uuid; old_revision integer; stamp timestamptz=clock_timestamp();
 v public.edu_ad_control_policies; hours integer=(p_policy->>'hours')::integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'AD_CONTROL_DENIED'; end if;
 if p_policy is null or p_policy->>'mode' is null or p_policy->>'mode' not in ('auto','freeze','release')
  or jsonb_typeof(p_policy->'enabled') is distinct from 'boolean'
  or not (coalesce(hours between 1 and 72,false) or
          (p_policy->>'mode'='freeze' and coalesce(p_policy->'hours'='null'::jsonb,false)))
 then raise exception 'AD_CONTROL_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select * into v from public.edu_ad_control_policies where cohort_id=c for update;
 old_revision=v.revision;
 if coalesce(old_revision,0) is distinct from (p_policy->>'revision')::integer then raise exception 'AD_CONTROL_CHANGED'; end if;
 insert into public.edu_ad_control_policies(cohort_id,enabled,budget_krw,ads_start,ads_end,sales_end,mode,reason,override_until,revision,updated_at,
  cpr_limit_krw,roas_floor,refund_request_limit)
 values(c,(p_policy->>'enabled')::boolean,(p_policy->>'budget_krw')::bigint,
  (p_policy->>'ads_start')::date,(p_policy->>'ads_end')::date,(p_policy->>'sales_end')::date,p_policy->>'mode',btrim(p_policy->>'reason'),
  case when p_policy->>'mode'='auto' or hours is null then null else stamp+make_interval(hours=>hours) end,coalesce(old_revision,0)+1,stamp,
  coalesce((p_policy->>'cpr_limit_krw')::integer,v.cpr_limit_krw,4500),
  coalesce((p_policy->>'roas_floor')::numeric,v.roas_floor,5),
  coalesce((p_policy->>'refund_request_limit')::integer,v.refund_request_limit,5))
 on conflict(cohort_id) do update set enabled=excluded.enabled,budget_krw=excluded.budget_krw,
  ads_start=excluded.ads_start,ads_end=excluded.ads_end,sales_end=excluded.sales_end,mode=excluded.mode,reason=excluded.reason,
  override_until=excluded.override_until,revision=excluded.revision,updated_at=excluded.updated_at,
  cpr_limit_krw=excluded.cpr_limit_krw,roas_floor=excluded.roas_floor,refund_request_limit=excluded.refund_request_limit returning * into v;
 insert into public.edu_ad_control_history(cohort_id,actor_id,occurred_at,revision,policy) values(c,p_actor,stamp,v.revision,to_jsonb(v));
 return to_jsonb(v);
end $$;
revoke all on function public.edu_ad_control_save(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.edu_ad_control_save(uuid,jsonb) to service_role;
commit;
