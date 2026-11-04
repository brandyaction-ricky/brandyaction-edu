begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Separate control credentials: data collection and deletion keys grant no eligibility access.
-- No credentials, consumers, subjects or feature flags are seeded.
create table edu_tips_private.eligibility_keys (
 key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 scope text not null check(scope='edu.eligibility.check'),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index edu_tips_eligibility_keys_consumer on edu_tips_private.eligibility_keys(consumer_id);
create table edu_tips_private.eligibility_rate_limits (
 consumer_id uuid primary key references edu_tips_private.erasure_consumers(id),
 window_at timestamptz not null,
 used integer not null check(used between 1 and 120)
);
alter table edu_tips_private.eligibility_keys enable row level security;
alter table edu_tips_private.eligibility_rate_limits enable row level security;
revoke all on edu_tips_private.eligibility_keys,edu_tips_private.eligibility_rate_limits from public,anon,authenticated,service_role;
grant select on edu_tips_private.eligibility_keys to service_role;
grant select,insert,update on edu_tips_private.eligibility_rate_limits to service_role;

-- A subject epoch never reactivates. Generation increases when its identity is retired.
alter table edu_tips_private.subjects add column control_generation integer not null default 1 check(control_generation>=1);
update edu_tips_private.subjects set control_generation=2 where retired_at is not null;
create function edu_tips_private.guard_subject_generation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.member_id is distinct from old.member_id and new.member_id is not null
  or new.customer_id is distinct from old.customer_id or new.consent_epoch is distinct from old.consent_epoch
  or new.wording_version is distinct from old.wording_version then raise exception 'TIPS_IDENTITY_CONFLICT';end if;
 if old.retired_at is not null and new.retired_at is distinct from old.retired_at then raise exception 'TIPS_IDENTITY_CONFLICT';end if;
 if new.control_generation is distinct from old.control_generation then raise exception 'TIPS_IDENTITY_CONFLICT';end if;
 if old.retired_at is null and new.retired_at is not null then new.control_generation:=old.control_generation+1;end if;
 return new;
end$$;
create trigger edu_tips_subject_generation before update on edu_tips_private.subjects for each row execute function edu_tips_private.guard_subject_generation();

-- Authorization, shared rate limit and current state use one RPC/statement snapshot.
create function public.edu_tips_check_eligibility(p_key_hash text,p_environment text,p_subjects jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid; n integer; results jsonb; w timestamptz:=date_trunc('minute',statement_timestamp());
begin
 select k.consumer_id into c from edu_tips_private.eligibility_keys k
 join edu_tips_private.erasure_consumers ec on ec.id=k.consumer_id
 where k.key_hash=p_key_hash and k.revoked_at is null and k.expires_at>statement_timestamp()
 and k.scope='edu.eligibility.check' and ec.environment=p_environment
 and ec.tenant_id='brandyaction' and ec.brand_id='brandyaction_edu';
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if jsonb_typeof(p_subjects) is distinct from 'array' then return jsonb_build_object('error','invalid_request');end if;
 if jsonb_array_length(p_subjects) not between 1 and 100 then return jsonb_build_object('error','invalid_request');end if;
 if exists(select 1 from jsonb_array_elements(p_subjects) x where jsonb_typeof(x) is distinct from 'object')
 then return jsonb_build_object('error','invalid_request');end if;
 if exists(select 1 from jsonb_array_elements(p_subjects) x
  where not(x ? 'customer_id' and x ? 'consent_epoch')
  or jsonb_typeof(x->'customer_id') is distinct from 'string' or jsonb_typeof(x->'consent_epoch') is distinct from 'string'
  or (x->>'customer_id') !~ '^k[1-9][0-9]*:[A-Za-z0-9_-]{43}$'
  or (x->>'consent_epoch') !~ '^ce_[A-Za-z0-9_-]{32}$'
  or x-'customer_id'-'consent_epoch'<>'{}'::jsonb)
 then return jsonb_build_object('error','invalid_request');end if;
 insert into edu_tips_private.eligibility_rate_limits as r(consumer_id,window_at,used) values(c,w,1)
 on conflict(consumer_id) do update set window_at=w,used=case when r.window_at<>w then 1 else r.used+1 end
 where r.window_at<>w or r.used<120 returning used into n;
 if n is null then return jsonb_build_object('error','rate_limited');end if;
 select jsonb_agg(jsonb_build_object('customer_id',customer,'consent_epoch',epoch,'eligible',allowed,
  'reason',case when allowed then 'allowed' else 'not_eligible' end,'generation',generation) order by ordinal)
 into results from (
  select x->>'customer_id' customer,x->>'consent_epoch' epoch,ordinal,coalesce(s.control_generation,1) generation,
   coalesce(s.retired_at is null and s.member_id is not null
    and p.status='active' and p.role not in ('admin','staff') and p.is_internal=false and p.deleted_at is null
    and pref.analysis and pref.overseas and pref.wording_version=s.wording_version
    and terms.is_current and terms.approved_at<=statement_timestamp() and terms.effective_at<=statement_timestamp()
    and not exists(select 1 from edu_tips_private.subjects previous
      join edu_tips_private.erasure_outbox q on q.subject_id=previous.id
      where previous.member_id=s.member_id and q.completed_at is null),false) allowed
  from jsonb_array_elements(p_subjects) with ordinality input(x,ordinal)
  left join edu_tips_private.subjects s on s.customer_id=x->>'customer_id' and s.consent_epoch=x->>'consent_epoch'
  left join public.profiles p on p.id=s.member_id
  left join public.edu_personalization_preferences pref on pref.member_id=s.member_id
  left join public.edu_personalization_terms terms on terms.version=s.wording_version
 ) checked;
 return jsonb_build_object('source','brandyaction_edu','tenant_id','brandyaction','brand_id','brandyaction_edu',
  'contract_version','2.0.0-rc.2','checked_at',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'results',results);
end$$;
revoke all on function edu_tips_private.guard_subject_generation(),public.edu_tips_check_eligibility(text,text,jsonb) from public,anon,authenticated;
grant execute on function edu_tips_private.guard_subject_generation(),public.edu_tips_check_eligibility(text,text,jsonb) to service_role;
commit;
