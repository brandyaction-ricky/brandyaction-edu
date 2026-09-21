begin;
-- Preparation only: these drafts never enter crm_campaigns or an automation queue.
create table public.edu_webinar_followups (
 campaign_id uuid not null references public.edu_webinar_campaigns(id),
 channel text not null check(channel in ('room','direct')),
 purpose text not null check(purpose in ('offer','encore')),
 body text not null check(char_length(body) between 1 and 2000),
 revision integer not null check(revision>0),
 actor_id uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),primary key(campaign_id,channel)
);
create table public.edu_webinar_followup_history (
 campaign_id uuid not null,channel text not null,purpose text not null,body text not null,
 revision integer not null,actor_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),primary key(campaign_id,channel,revision)
);
alter table public.edu_webinar_followups enable row level security;
alter table public.edu_webinar_followup_history enable row level security;
revoke all on public.edu_webinar_followups,public.edu_webinar_followup_history from public,anon,authenticated,service_role;
create function public.edu_manage_webinar_followup(p_actor uuid,p_code uuid,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; campaign public.edu_webinar_campaigns%rowtype;
 item public.edu_webinar_followups%rowtype; v_channel text; v_purpose text; v_body text;
 can_audience boolean; audience_state text; counts jsonb:=null; drafts jsonb;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if permissions->'marketing' is distinct from 'true'::jsonb or permissions->'products' is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 can_audience:=actor.role='admin' or (permissions->'members'='true'::jsonb and permissions->'orders'='true'::jsonb);
 select * into campaign from public.edu_webinar_campaigns where id=p_code for update;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 if p_settings is not null then
  if jsonb_typeof(p_settings)<>'object' or not(p_settings ?& array['channel','purpose','body','expected'])
   or p_settings-array['channel','purpose','body','expected']<>'{}'::jsonb
   or jsonb_typeof(p_settings->'body')<>'string' or jsonb_typeof(p_settings->'expected')<>'number' then raise exception 'CONVERSION_INVALID'; end if;
  v_channel:=p_settings->>'channel';v_purpose:=p_settings->>'purpose';v_body:=btrim(p_settings->>'body');
  if v_channel is null or v_channel not in ('room','direct') or v_purpose is null or v_purpose not in ('offer','encore') or char_length(v_body) not between 1 and 2000 then raise exception 'CONVERSION_INVALID'; end if;
  if v_channel='direct' and not coalesce(can_audience,false) then raise exception 'CONVERSION_FORBIDDEN'; end if;
  select * into item from public.edu_webinar_followups where campaign_id=p_code and channel=v_channel;
  if (p_settings->>'expected')::integer is distinct from coalesce(item.revision,0) then raise exception 'CONVERSION_STALE'; end if;
  insert into public.edu_webinar_followups(campaign_id,channel,purpose,body,revision,actor_id)
  values(p_code,v_channel,v_purpose,v_body,1,p_actor)
  on conflict(campaign_id,channel) do update set purpose=excluded.purpose,body=excluded.body,revision=edu_webinar_followups.revision+1,actor_id=p_actor,updated_at=now() returning * into item;
  insert into public.edu_webinar_followup_history values(p_code,v_channel,v_purpose,v_body,item.revision,p_actor,now());
 end if;
 audience_state:=case when not coalesce(can_audience,false) then 'forbidden' when campaign.paid_cohort_id is null then 'unmapped' when not campaign.enabled then 'paused'
  when not exists(select 1 from public.cohorts c join public.courses s on s.id=c.course_id where c.id=campaign.paid_cohort_id and s.category='paid_class' and s.status='published') then 'unavailable' else 'ready' end;
 if audience_state='ready' then
  -- All target-cohort orders, including orders before registration, matter for suppression.
  -- Pending, refunded and inconsistent payment evidence is held for review, never assumed non-buyer.
  with classified as (
   select case
    when p.id is null or p.status is distinct from 'active' then 'inactive'
    when exists(select 1 from public.orders o where o.user_id=p.id
      and exists(select 1 from public.order_items oi where oi.order_id=o.id and oi.cohort_id=campaign.paid_cohort_id)
      and (o.status not in ('payment_failed','cancelled') or exists(select 1 from public.payments pay where pay.order_id=o.id and (pay.approved_amount>0 or pay.status in ('in_progress','done','partial_cancelled'))))) then 'order_hold'
    when p.marketing_consent is distinct from true or p.marketing_consent_at is null or p.marketing_consent_at>now()
      or (p.marketing_opt_out_at is not null and p.marketing_opt_out_at>=p.marketing_consent_at) then 'no_consent'
    when regexp_replace(coalesce(p.phone,''),'[^0-9]','','g') !~ '^01[016789][0-9]{7,8}$' then 'no_phone'
    else 'candidate' end as reason
   from public.edu_webinar_registrations r left join public.profiles p on p.id=r.user_id where r.period_id=campaign.period_id
  ) select jsonb_build_object('total',count(*),'candidate',count(*) filter(where reason='candidate'),'inactive',count(*) filter(where reason='inactive'),
   'order_hold',count(*) filter(where reason='order_hold'),'no_consent',count(*) filter(where reason='no_consent'),'no_phone',count(*) filter(where reason='no_phone')) into counts from classified;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('channel',channel,'purpose',purpose,'body',body,'revision',revision,'updatedAt',updated_at) order by channel),'[]'::jsonb)
 into drafts from public.edu_webinar_followups where campaign_id=p_code and (channel='room' or coalesce(can_audience,false));
 return jsonb_build_object('drafts',drafts,'audienceState',audience_state,'counts',counts,'asOf',now());
end;
$$;
revoke all on function public.edu_manage_webinar_followup(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_manage_webinar_followup(uuid,uuid,jsonb) to service_role;
commit;
