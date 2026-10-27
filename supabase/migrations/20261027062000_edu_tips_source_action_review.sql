begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Candidate only. No consumer, key, feature setting, customer or sender is installed.
create table edu_tips_private.action_review_keys (
 key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 scope text not null check(scope='edu.action.review'),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index edu_tips_action_review_key_consumer on edu_tips_private.action_review_keys(consumer_id);
create table edu_tips_private.action_review_rates (
 consumer_id uuid primary key references edu_tips_private.erasure_consumers(id),
 window_at timestamptz not null,
 used integer not null check(used between 1 and 120)
);
alter table edu_tips_private.action_review_keys enable row level security;
alter table edu_tips_private.action_review_rates enable row level security;
revoke all on edu_tips_private.action_review_keys,edu_tips_private.action_review_rates from public,anon,authenticated,service_role;
grant select on edu_tips_private.action_review_keys to service_role;
grant select,insert,update on edu_tips_private.action_review_rates to service_role;

-- STABLE: all source facts, including consent and pre-consent purchases, use the
-- calling statement's MVCC snapshot. No per-table HTTP reads or fake admin actor.
-- Internal context is service-role-only and is NEVER returned over the TIPS HTTP API.
create function edu_tips_private.action_review_snapshot(p_command jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare subject edu_tips_private.subjects; member uuid; course uuid; cohort uuid; enrollment uuid; lesson uuid;
 profile jsonb; co jsonb; cr jsonb; ens jsonb; os jsonb; ps jsonb; rs jsonb; care jsonb;
 at text:=to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
 select s.* into subject from edu_tips_private.subjects s
 join public.profiles p on p.id=s.member_id
 join public.edu_personalization_preferences pref on pref.member_id=s.member_id
 join public.edu_personalization_terms terms on terms.version=s.wording_version
 where s.customer_id=p_command->>'customer_id' and s.consent_epoch=p_command->>'consent_epoch'
 and s.retired_at is null and p.status='active' and p.role not in ('admin','staff') and not p.is_internal and p.deleted_at is null
 and pref.analysis and pref.overseas and pref.wording_version=s.wording_version
 and terms.is_current and terms.approved_at<=statement_timestamp() and terms.effective_at<=statement_timestamp()
 and not exists(select 1 from edu_tips_private.subjects prior join edu_tips_private.erasure_outbox q on q.subject_id=prior.id
  where prior.member_id=s.member_id and q.completed_at is null);
 if not found then return jsonb_build_object('excluded','analysis_not_current','checked_at',at);end if;
 member:=subject.member_id;
 select c.id,h.id,jsonb_build_object('id',c.id,'archived_at',c.archived_at),
  jsonb_build_object('id',h.id,'course_id',c.id,'status',h.status,'operation_start_at',h.operation_start_at,'operation_end_at',h.operation_end_at)
 into course,cohort,cr,co from public.courses c join public.cohorts h on h.course_id=c.id
 where c.course_code=p_command->>'product_id' and c.course_code||':'||h.cohort_code=p_command->>'cohort_code';
 if not found then return jsonb_build_object('excluded','unavailable_course','checked_at',at);end if;
 select jsonb_build_object('id',p.id,'status',p.status,'role',p.role,'marketing_use_consent_at',p.marketing_use_consent_at,
  'ad_email_consent_at',p.ad_email_consent_at,'ad_kakao_consent_at',p.ad_kakao_consent_at) into profile from public.profiles p where p.id=member;
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') into ens from (
  select id,status,revoked_at,access_starts_at,access_ends_at,order_item_id,source from public.enrollments
  where user_id=member and course_id=course and cohort_id=cohort order by id limit 3
 ) e;
 -- Caps retain one overflow row so incomplete history always fails closed.
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into os from (
  select o.id,o.status,o.paid_at,(select jsonb_agg(jsonb_build_object('id',i.id,'course_id',i.course_id,'cohort_id',i.cohort_id) order by i.id)
   from public.order_items i where i.order_id=o.id) as order_items
  from public.orders o where o.user_id=member and exists(select 1 from public.order_items i
   where i.order_id=o.id and i.course_id=course and i.cohort_id=cohort) order by o.id limit 101
 ) o;
 select coalesce(jsonb_agg(to_jsonb(p)),'[]') into ps from (
  select p.id,p.order_id,p.status,p.approved_at,p.approved_amount,p.cancelled_amount from public.payments p
  where p.order_id in(select (o->>'id')::uuid from jsonb_array_elements(os) o) order by p.id limit 101
 ) p;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rs from (
  select r.payment_id,r.amount,r.status from public.refunds r
  where r.status='done' and r.payment_id in(select (p->>'id')::uuid from jsonb_array_elements(ps) p) order by r.id limit 1000
 ) r;
 enrollment:=(ens->0->>'id')::uuid;
 select jsonb_build_object('cohorts','[]'::jsonb,'cohortId',cohort,'asOf',at,'rows',coalesce(jsonb_agg(jsonb_build_object(
  'memberId',member,'enrollmentId',e.id,'name',null,'email',null,'cells',edu_private.edu_learning_care_cells(e.id),
  'contactEligible',e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=statement_timestamp())
    and (e.access_ends_at is null or e.access_ends_at>statement_timestamp()),
  'lastVisitAt',(select max(v.last_seen_at) from public.edu_member_visits v where v.user_id=member),
  'lastContactAt',(select max(m.created_at) from public.edu_member_messages m join public.profiles sender on sender.id=m.sender_id
   where m.recipient_id=member and sender.role in ('admin','staff') and not m.is_notice),'openQuestions',0)),'[]')) into care
 from public.enrollments e where e.id=enrollment;
 select (cell->>'lessonId')::uuid into lesson from jsonb_array_elements(coalesce(care->'rows'->0->'cells','[]')) with ordinality cells(cell,n)
 where cell->>'track'<>'daily' and cell->>'published'='true' and cell->>'state' in ('not_submitted','changes_requested')
 order by case cell->>'state' when 'changes_requested' then 0 else 1 end,n limit 1;
 return jsonb_build_object('checked_at',at,'command',jsonb_build_object('memberId',member,'courseId',course,'cohortId',cohort,
  'intent',p_command->>'intent','channel',p_command->>'channel','enrollmentId',enrollment,'lessonId',lesson),
 'snapshot',jsonb_build_object('care',care,'profile',profile,'cohort',co,'course',cr,'analysisEligible',true,
  'orders',os,'orderCount',jsonb_array_length(os),'enrollments',ens,'enrollmentCount',jsonb_array_length(ens),
  'payments',ps,'paymentCount',jsonb_array_length(ps),'refunds',rs,'refundCount',jsonb_array_length(rs)));
end$$;

create function public.edu_tips_action_review_context(p_key_hash text,p_environment text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare consumer uuid; n integer; w timestamptz:=date_trunc('minute',statement_timestamp());
begin
 select k.consumer_id into consumer from edu_tips_private.action_review_keys k
 join edu_tips_private.erasure_consumers c on c.id=k.consumer_id
 where k.key_hash=p_key_hash and k.scope='edu.action.review' and k.revoked_at is null and k.expires_at>statement_timestamp()
 and c.environment=p_environment and c.tenant_id='brandyaction' and c.brand_id='brandyaction_edu';
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('error','invalid_request');end if;
 if not(p_command ?& array['customer_id','consent_epoch','product_id','cohort_code','intent','channel'])
 or p_command-'customer_id'-'consent_epoch'-'product_id'-'cohort_code'-'intent'-'channel'<>'{}'::jsonb
 or exists(select 1 from jsonb_each(p_command) v where jsonb_typeof(v.value)<>'string')
 or p_command->>'customer_id' !~ '^k[1-9][0-9]*:[A-Za-z0-9_-]{43}$'
 or p_command->>'consent_epoch' !~ '^ce_[A-Za-z0-9_-]{32}$'
 or p_command->>'product_id' !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'
 or p_command->>'cohort_code' !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'
 or p_command->>'intent' not in ('learning_support','course_offer') or p_command->>'channel' not in ('email','kakao')
 then return jsonb_build_object('error','invalid_request');end if;
 insert into edu_tips_private.action_review_rates as r(consumer_id,window_at,used) values(consumer,w,1)
 on conflict(consumer_id) do update set window_at=w,used=case when r.window_at<>w then 1 else r.used+1 end
 where r.window_at<>w or r.used<120 returning r.used into n;
 if n is null then return jsonb_build_object('error','rate_limited');end if;
 return edu_tips_private.action_review_snapshot(p_command);
end$$;
revoke all on function edu_tips_private.action_review_snapshot(jsonb),public.edu_tips_action_review_context(text,text,jsonb) from public,anon,authenticated;
grant execute on function edu_tips_private.action_review_snapshot(jsonb),public.edu_tips_action_review_context(text,text,jsonb) to service_role;
commit;
