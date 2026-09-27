begin;
alter table public.crm_campaigns add column recruitment_id uuid references public.edu_webinar_campaigns(id);
alter table public.crm_campaigns add column recruitment_purpose text check(recruitment_purpose in ('offer','encore'));
create table public.edu_recruitment_deliveries (
 campaign_id uuid primary key references public.crm_campaigns(id),
 recruitment_id uuid not null references public.edu_webinar_campaigns(id),
 period_id text not null, purpose text not null, cohort_id uuid not null,
 recruitment_revision integer not null, template_snapshot jsonb not null,
 recipient_ids uuid[] not null, actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
-- Claims are durable even when the provider outcome is unknown. Never auto-release or retry them.
create table public.edu_recruitment_delivery_claims (
 period_id text not null,purpose text not null,member_id uuid not null,
 phone text not null,campaign_id uuid not null references public.crm_campaigns(id),
 created_at timestamptz not null default now(),
 primary key(period_id,purpose,member_id),unique(period_id,purpose,phone)
);
alter table public.edu_recruitment_deliveries enable row level security;
alter table public.edu_recruitment_delivery_claims enable row level security;
revoke all on public.edu_recruitment_deliveries,public.edu_recruitment_delivery_claims from public,anon,authenticated,service_role;

create function public.edu_recruitment_recipient_check(p_code uuid,p_purpose text)
returns table(member_id uuid,phone text,reason text) language sql security definer set search_path='' as $$
 with members as (
  select r.user_id, p.status, p.marketing_consent,p.marketing_consent_at,p.marketing_opt_out_at,
   regexp_replace(coalesce(p.phone,''),'[^0-9]','','g') phone,c.period_id,c.paid_cohort_id
  from public.edu_webinar_campaigns c join public.edu_webinar_registrations r on r.period_id=c.period_id
  left join public.profiles p on p.id=r.user_id where c.id=p_code
 ), classified as (
  select m.*,case
   when status is distinct from 'active' then 'inactive'
   when exists(select 1 from public.orders o where o.user_id=m.user_id
    and exists(select 1 from public.order_items oi where oi.order_id=o.id and oi.cohort_id=m.paid_cohort_id)
    and (o.status not in ('payment_failed','cancelled') or exists(select 1 from public.payments pay where pay.order_id=o.id and (pay.approved_amount>0 or pay.status in ('in_progress','done','partial_cancelled'))))) then 'order_hold'
   when marketing_consent is distinct from true or marketing_consent_at is null or marketing_consent_at>now()
    or marketing_opt_out_at>=marketing_consent_at then 'no_consent'
   when phone !~ '^01[016789][0-9]{7,8}$' then 'no_phone'
   when exists(select 1 from members other where other.phone=m.phone and other.user_id<>m.user_id) then 'shared_phone'
   when exists(select 1 from public.edu_recruitment_delivery_claims d where d.period_id=m.period_id and d.purpose=p_purpose and (d.member_id=m.user_id or d.phone=m.phone)) then 'duplicate'
   else 'candidate' end reason from members m
 ) select user_id,phone,reason from classified;
$$;
revoke all on function public.edu_recruitment_recipient_check(uuid,text) from public,anon,authenticated,service_role;

create function public.edu_prepare_recruitment_delivery(p_actor uuid,p_code uuid,p_template uuid default null,p_purpose text default 'encore',p_schedule jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; c public.edu_webinar_campaigns%rowtype;
 t public.crm_templates%rowtype; report jsonb; ids uuid[]; fingerprint text; state text; new_id uuid; schedule_at timestamptz; templates jsonb;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if not coalesce(permissions @> '{"marketing":true,"products":true,"members":true,"orders":true}'::jsonb,false) then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 if p_purpose is null or p_purpose not in ('offer','encore') then raise exception 'CONVERSION_INVALID'; end if;
 select * into c from public.edu_webinar_campaigns where id=p_code for share;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 state:=case when not c.enabled then 'paused' when c.paid_cohort_id is null then 'unmapped'
  when not exists(select 1 from public.cohorts h join public.courses s on s.id=h.course_id where h.id=c.paid_cohort_id and s.status='published' and s.category='paid_class') then 'unavailable' else 'ready' end;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'channel',channel) order by name),'[]') into templates
 from public.crm_templates where is_active and purpose='marketing';
 if p_schedule ? 'cancel' then
  if p_schedule-array['cancel']<>'{}'::jsonb then raise exception 'CONVERSION_INVALID'; end if;
  update public.crm_campaigns set status='cancelled' where id=(p_schedule->>'cancel')::uuid and recruitment_id=p_code and status='scheduled';
  if not found then raise exception 'CONVERSION_STALE'; end if;
  p_schedule:=null;
 end if;
 if p_template is null then
  if p_schedule is not null then raise exception 'CONVERSION_INVALID'; end if;
  return jsonb_build_object('period',c.period_id,'state',state,'templates',templates,'reservations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'scheduledAt',scheduled_at,'error',error_message) order by created_at desc),'[]') from public.crm_campaigns where recruitment_id=p_code));
 end if;
 select * into t from public.crm_templates where id=p_template and is_active and purpose='marketing' for share;
 if not found then raise exception 'CONVERSION_INVALID'; end if;
 if state<>'ready' then raise exception 'CONVERSION_UNAVAILABLE'; end if;
 with checked as (select * from public.edu_recruitment_recipient_check(p_code,p_purpose))
 select jsonb_build_object('total',count(*),'candidate',count(*) filter(where reason='candidate'),
  'order_hold',count(*) filter(where reason='order_hold'),'no_consent',count(*) filter(where reason='no_consent'),
  'inactive',count(*) filter(where reason='inactive'),'no_phone',count(*) filter(where reason='no_phone'),
  'shared_phone',count(*) filter(where reason='shared_phone'),'duplicate',count(*) filter(where reason='duplicate')),
  coalesce(array_agg(member_id order by member_id) filter(where reason='candidate'),'{}'::uuid[]),
  md5(coalesce(string_agg(member_id::text||phone||reason,',' order by member_id),'')||to_jsonb(t)::text||to_jsonb(c)::text||p_purpose)
 into report,ids,fingerprint from checked;
 if p_schedule is not null then
  if jsonb_typeof(p_schedule)<>'object' or not (p_schedule ?& array['token','name','at'])
   or p_schedule-array['token','name','at']<>'{}'::jsonb
   or char_length(btrim(p_schedule->>'name')) not between 1 and 100 then raise exception 'CONVERSION_INVALID'; end if;
  if p_schedule->>'token' is distinct from fingerprint then raise exception 'CONVERSION_STALE'; end if;
  if cardinality(ids) not between 1 and 500 then raise exception 'CONVERSION_INVALID'; end if;
  schedule_at:=(p_schedule->>'at')::timestamptz;
  if schedule_at is null or schedule_at<now()+interval '1 minute' or schedule_at>now()+interval '365 days' then raise exception 'CONVERSION_INVALID'; end if;
  -- Serialize repeated submissions. A second reservation for the same purpose is held.
  perform pg_advisory_xact_lock(hashtextextended(c.period_id||':'||p_purpose,0));
  if exists(select 1 from public.edu_recruitment_deliveries d join public.crm_campaigns cc on cc.id=d.campaign_id
    where d.period_id=c.period_id and d.purpose=p_purpose and cc.status in ('scheduled','sending')) then raise exception 'CONVERSION_STALE'; end if;
  insert into public.crm_campaigns(name,template_id,status,scheduled_at,created_by,recruitment_id,recruitment_purpose,recipient_count)
  values(btrim(p_schedule->>'name'),p_template,'scheduled',schedule_at,p_actor,p_code,p_purpose,cardinality(ids)) returning id into new_id;
  insert into public.edu_recruitment_deliveries values(new_id,p_code,c.period_id,p_purpose,c.paid_cohort_id,c.revision,to_jsonb(t),ids,p_actor,now());
 end if;
 return jsonb_build_object('state',state,'period',c.period_id,'counts',report,'token',fingerprint,'asOf',now(),
  'template',jsonb_build_object('name',t.name,'content',t.content,'channel',t.channel),'campaignId',new_id);
end;
$$;
revoke all on function public.edu_prepare_recruitment_delivery(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_prepare_recruitment_delivery(uuid,uuid,uuid,text,jsonb) to service_role;

create function public.edu_claim_recruitment_delivery(p_campaign uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.edu_recruitment_deliveries%rowtype; c public.edu_webinar_campaigns%rowtype;
 cc public.crm_campaigns%rowtype;t public.crm_templates%rowtype; actor public.profiles%rowtype;permissions jsonb;
 recipients jsonb; claimed uuid[];
begin
 select * into cc from public.crm_campaigns where id=p_campaign for update;
 if not found or cc.status<>'sending' or cc.scheduled_at>now() then raise exception 'CONVERSION_INVALID'; end if;
 select * into d from public.edu_recruitment_deliveries where campaign_id=p_campaign;
 if not found or cc.recruitment_id is distinct from d.recruitment_id or cc.recruitment_purpose is distinct from d.purpose then raise exception 'CONVERSION_INVALID'; end if;
 -- Revalidate author authority, campaign mapping and template before claiming recipients.
 select * into actor from public.profiles where id=d.actor_id and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||d.actor_id::text for share;
  if not coalesce(permissions @> '{"marketing":true,"products":true,"members":true,"orders":true}'::jsonb,false) then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 select * into c from public.edu_webinar_campaigns where id=d.recruitment_id for share;
 select * into t from public.crm_templates where id=cc.template_id for share;
 if not c.enabled or c.revision<>d.recruitment_revision or c.paid_cohort_id is distinct from d.cohort_id
  or to_jsonb(t) is distinct from d.template_snapshot
  or not exists(select 1 from public.cohorts h join public.courses s on s.id=h.course_id where h.id=d.cohort_id and s.status='published' and s.category='paid_class')
 then raise exception 'CONVERSION_STALE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.period_id||':'||d.purpose,0));
 -- Lock existing profiles against concurrent opt-out updates during the claim transaction.
 perform 1 from public.profiles where id=any(d.recipient_ids) order by id for share;
 with eligible as (select * from public.edu_recruitment_recipient_check(d.recruitment_id,d.purpose) where member_id=any(d.recipient_ids) and reason='candidate'),
 inserted as (insert into public.edu_recruitment_delivery_claims(period_id,purpose,member_id,phone,campaign_id)
 select d.period_id,d.purpose,member_id,phone,p_campaign from eligible order by member_id on conflict do nothing returning member_id)
 select coalesce(array_agg(member_id),'{}'::uuid[]) into claimed from inserted;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'phone',phone,'full_name',full_name,'email',email,'status',status,'marketing_consent',marketing_consent)),'[]')
 into recipients from public.profiles where id=any(claimed);
 return jsonb_build_object('template',d.template_snapshot,'members',recipients,'reviewed',cardinality(d.recipient_ids),'excluded',cardinality(d.recipient_ids)-cardinality(claimed));
end;
$$;
revoke all on function public.edu_claim_recruitment_delivery(uuid) from public,anon,authenticated;
grant execute on function public.edu_claim_recruitment_delivery(uuid) to service_role;

-- Generic CRM editors must never turn a recruitment reservation into an all-members campaign.
create function public.edu_guard_recruitment_campaign() returns trigger language plpgsql set search_path='' as $$
begin
 if old.recruitment_id is not null and (
  new.recruitment_id is distinct from old.recruitment_id or new.recruitment_purpose is distinct from old.recruitment_purpose
  or new.template_id is distinct from old.template_id or new.target_tag_id is distinct from old.target_tag_id
  or new.scheduled_at is distinct from old.scheduled_at or (new.status='scheduled' and old.status<>'scheduled')) then raise exception 'CONVERSION_INVALID'; end if;
 return new;
end;$$;
create trigger edu_guard_recruitment_campaign before update on public.crm_campaigns for each row execute function public.edu_guard_recruitment_campaign();
commit;
