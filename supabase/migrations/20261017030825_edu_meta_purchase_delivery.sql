begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- New Meta consent is independent of marketing, TIPS and coupon eligibility.
-- No terms, customer opt-ins or transmission jobs are seeded by this migration.
-- An approved, exact disclosure must be published separately before opt-in opens.
create table public.edu_meta_purchase_terms (
 version text primary key check (length(version) between 1 and 100),
 recipient text not null check (length(btrim(recipient)) > 0),
 country text not null check (length(btrim(country)) > 0),
 items text not null check (length(btrim(items)) > 0),
 purpose text not null check (length(btrim(purpose)) > 0),
 transfer text not null check (length(btrim(transfer)) > 0),
 retention text not null check (length(btrim(retention)) > 0),
 refusal text not null check (length(btrim(refusal)) > 0),
 contact text not null check (length(btrim(contact)) > 0),
 approved_at timestamptz not null,
 effective_at timestamptz not null,
 is_current boolean not null default false
);
create unique index edu_meta_purchase_one_current on public.edu_meta_purchase_terms(is_current) where is_current;
create function public.edu_meta_purchase_terms_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
 if (new.version,new.recipient,new.country,new.items,new.purpose,new.transfer,new.retention,new.refusal,new.contact,new.approved_at,new.effective_at)
    is distinct from (old.version,old.recipient,old.country,old.items,old.purpose,old.transfer,old.retention,old.refusal,old.contact,old.approved_at,old.effective_at)
 then raise exception 'META_CONSENT_TERMS_IMMUTABLE'; end if;
 return new;
end$$;
create trigger edu_meta_purchase_terms_immutable before update on public.edu_meta_purchase_terms for each row execute function public.edu_meta_purchase_terms_immutable();
create table public.edu_meta_purchase_preferences (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 consented boolean not null default false,
 wording_version text references public.edu_meta_purchase_terms(version),
 revision uuid not null,
 updated_at timestamptz not null default now(),
 check (not consented or wording_version is not null)
);
create table public.edu_meta_purchase_receipts (
 member_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 expected_revision uuid,
 wording_version text,
 consented boolean not null,
 previous_consented boolean not null,
 surface text not null check (surface in ('signup','profile')),
 result jsonb not null,
 occurred_at timestamptz not null default now(),
 primary key (member_id,request_id)
);
alter table public.edu_meta_purchase_terms enable row level security;
alter table public.edu_meta_purchase_preferences enable row level security;
alter table public.edu_meta_purchase_receipts enable row level security;
revoke all on public.edu_meta_purchase_terms,public.edu_meta_purchase_preferences,public.edu_meta_purchase_receipts from public,anon,authenticated,service_role;
grant select on public.edu_meta_purchase_terms to service_role;
grant select,insert,update on public.edu_meta_purchase_preferences to service_role;
grant select,insert on public.edu_meta_purchase_receipts to service_role;

create function public.edu_meta_purchase_consent(
 p_member uuid,p_request uuid default null,p_expected uuid default null,
 p_consented boolean default null,p_version text default null,p_surface text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 pref public.edu_meta_purchase_preferences; terms public.edu_meta_purchase_terms;
 receipt public.edu_meta_purchase_receipts; previous boolean; result jsonb;
begin
 -- Serialize all preference/reward changes for the same active account.
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'META_CONSENT_FORBIDDEN'; end if;
 select * into terms from public.edu_meta_purchase_terms where is_current and approved_at<=now() and effective_at<=now();
 select * into pref from public.edu_meta_purchase_preferences where member_id=p_member;
 previous := coalesce(pref.consented,false);
 if p_consented is not null then
  if p_request is null or p_surface is null or p_surface not in ('signup','profile') then raise exception 'META_CONSENT_INVALID'; end if;
  select * into receipt from public.edu_meta_purchase_receipts where member_id=p_member and request_id=p_request;
  if found then
   if (receipt.expected_revision,receipt.wording_version,receipt.consented,receipt.surface) is distinct from (p_expected,p_version,p_consented,p_surface)
      or pref.revision is distinct from p_request then raise exception 'META_CONSENT_CONFLICT'; end if;
  else
   if pref.revision is distinct from p_expected then raise exception 'META_CONSENT_CONFLICT'; end if;
   if p_consented and (terms.version is null or p_version is distinct from terms.version) then raise exception 'META_CONSENT_TERMS'; end if;
   insert into public.edu_meta_purchase_preferences(member_id,consented,wording_version,revision)
    values(p_member,p_consented,case when p_consented then terms.version else null end,p_request)
    on conflict(member_id) do update set consented=excluded.consented,wording_version=excluded.wording_version,revision=excluded.revision,updated_at=now()
    returning * into pref;
  end if;
 end if;
 result := jsonb_build_object(
  'consented',coalesce(pref.consented,false),'active',coalesce(pref.consented and pref.wording_version=terms.version,false),
  'needsRenewal',coalesce(pref.consented,false) and pref.wording_version is distinct from terms.version,
  'revision',pref.revision,'updatedAt',pref.updated_at,
  'terms',case when terms.version is null then null else jsonb_build_object('version',terms.version,
   'recipient',terms.recipient,'country',terms.country,'items',terms.items,'purpose',terms.purpose,
   'transfer',terms.transfer,'retention',terms.retention,'refusal',terms.refusal,'contact',terms.contact) end);
 if p_consented is not null and receipt.request_id is null then
  insert into public.edu_meta_purchase_receipts(member_id,request_id,expected_revision,wording_version,consented,previous_consented,surface,result)
   values(p_member,p_request,p_expected,p_version,p_consented,previous,p_surface,result);
 end if;
 return result;
end$$;
revoke all on function public.edu_meta_purchase_consent(uuid,uuid,uuid,boolean,text,text),public.edu_meta_purchase_terms_immutable() from public,anon,authenticated;
grant execute on function public.edu_meta_purchase_consent(uuid,uuid,uuid,boolean,text,text) to service_role;
-- Purchase delivery. No activation, disclosure, course allowlist or jobs are seeded.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table public.edu_meta_purchase_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 dataset text not null check(dataset='5567287373411934'),
 starts_at timestamptz not null,
 course_ids uuid[] not null check(cardinality(course_ids)>0)
);
create table public.edu_meta_purchase_contexts (
 order_id uuid primary key references public.orders(id) on delete cascade,
 member_id uuid not null references public.profiles(id) on delete cascade,
 revision uuid not null,
 version text not null references public.edu_meta_purchase_terms(version),
 email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'),
 user_agent text not null check(length(user_agent) between 1 and 512),
 source_url text not null check(source_url='https://brandyaction-edu.com/checkout'),
 fbp text check(length(fbp)<=430 and fbp ~ '^fb\.[0-9]+\.[0-9]{10,16}\.[A-Za-z0-9_-]+$'),
 fbc text check(length(fbc)<=430 and fbc ~ '^fb\.[0-9]+\.[0-9]{10,16}\.[A-Za-z0-9_-]+$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create table public.edu_meta_purchase_outbox (
 order_id uuid primary key references public.orders(id) on delete cascade,
 member_id uuid not null references public.profiles(id) on delete cascade,
 event_id uuid not null unique default gen_random_uuid(),
 dataset text not null check(dataset='5567287373411934'),
 event_time timestamptz not null,
 amount integer not null check(amount>0),
 course_ids uuid[] not null check(cardinality(course_ids)>0),
 status text not null default 'pending' check(status in ('pending','processing','sent','cancelled','blocked')),
 attempts integer not null default 0 check(attempts between 0 and 12),
 lease uuid,
 lease_until timestamptz,
 next_at timestamptz not null default now(),
 trace text check(trace ~ '^[A-Za-z0-9_-]{1,128}$'),
 finished_at timestamptz,
 created_at timestamptz not null default now()
);
create index edu_meta_purchase_due on public.edu_meta_purchase_outbox(next_at,order_id) where status in ('pending','processing');
create index edu_meta_purchase_context_expiry on public.edu_meta_purchase_contexts(expires_at);
create index edu_meta_purchase_member_context on public.edu_meta_purchase_contexts(member_id);
create index edu_meta_purchase_member_outbox on public.edu_meta_purchase_outbox(member_id) where status in ('pending','processing');
create index edu_meta_purchase_finished on public.edu_meta_purchase_outbox(finished_at) where finished_at is not null;
alter table public.edu_meta_purchase_config enable row level security;
alter table public.edu_meta_purchase_contexts enable row level security;
alter table public.edu_meta_purchase_outbox enable row level security;
revoke all on public.edu_meta_purchase_config,public.edu_meta_purchase_contexts,public.edu_meta_purchase_outbox from public,anon,authenticated,service_role;
grant select,update on public.edu_meta_purchase_config to service_role;
grant select,insert,update,delete on public.edu_meta_purchase_contexts,public.edu_meta_purchase_outbox to service_role;
-- Only the server can read verified Auth email, and only its hash is retained in the queue context.
grant usage on schema auth to service_role;
grant select(id,email,email_confirmed_at) on auth.users to service_role;

create function public.edu_capture_meta_purchase(p_member uuid,p_order uuid,p_context jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.orders; pref public.edu_meta_purchase_preferences; cfg public.edu_meta_purchase_config; email_hash text;
begin
 select * into o from public.orders where id=p_order and user_id=p_member for update;
 if not found or o.status<>'pending' or o.total_amount<=0 then return false; end if;
 select * into cfg from public.edu_meta_purchase_config where enabled;
 if cfg.singleton is null or o.created_at<cfg.starts_at then return false; end if;
 select * into pref from public.edu_meta_purchase_preferences where member_id=p_member and consented;
 if pref.member_id is null or not exists(select 1 from public.profiles where id=p_member and status='active')
 or not exists(select 1 from public.edu_meta_purchase_terms where version=pref.wording_version and is_current and approved_at<=now() and effective_at<=now()) then return false; end if;
 if not exists(select 1 from public.order_items where order_id=o.id) or exists(
  select 1 from public.order_items i join public.courses c on c.id=i.course_id
  where i.order_id=o.id and (c.category is distinct from 'paid_class' or not(i.course_id=any(cfg.course_ids)))) then return false; end if;
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(lower(btrim(u.email)),'UTF8')),'hex') into email_hash
 from auth.users u where u.id=p_member and u.email_confirmed_at is not null
 and u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 and lower(u.email) !~ '(@.*\.invalid$|@.*\.local$|@.*\.test$|@example\.(com|org|net)$)';
 if email_hash is null or jsonb_typeof(p_context)<>'object' or length(coalesce(p_context->>'userAgent','')) not between 1 and 512
 or p_context->>'userAgent' ~ '[[:cntrl:]]' or p_context->>'sourceUrl' is distinct from 'https://brandyaction-edu.com/checkout' then return false; end if;
 insert into public.edu_meta_purchase_contexts(order_id,member_id,revision,version,email_hash,user_agent,source_url,fbp,fbc,expires_at)
 values(o.id,p_member,pref.revision,pref.wording_version,email_hash,p_context->>'userAgent',p_context->>'sourceUrl',p_context->>'fbp',p_context->>'fbc',least(coalesce(o.expires_at,now()+interval '24 hours'),o.created_at+interval '7 days'))
 on conflict(order_id) do nothing;
 return found;
end$$;

create function public.edu_meta_purchase_eligible(p_order uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.orders o
 join public.payments pay on pay.order_id=o.id
 join public.edu_meta_purchase_contexts ctx on ctx.order_id=o.id and ctx.member_id=o.user_id
 join public.edu_meta_purchase_preferences pref on pref.member_id=ctx.member_id and pref.consented and pref.revision=ctx.revision and pref.wording_version=ctx.version
 join public.edu_meta_purchase_terms terms on terms.version=ctx.version and terms.is_current and terms.approved_at<=now() and terms.effective_at<=now()
 join public.profiles member on member.id=ctx.member_id and member.status='active'
 join public.edu_meta_purchase_config cfg on cfg.enabled
 where o.id=p_order and o.status='paid' and o.currency='KRW' and o.total_amount>0
 and o.created_at>=cfg.starts_at and pay.provider='toss' and pay.status='done' and pay.cancelled_amount=0
 and pay.approved_amount=o.total_amount and pay.approved_at=o.paid_at and pay.approved_at>=ctx.created_at and pay.approved_at<=now()+interval '1 minute'
 and pay.approved_at>now()-interval '24 hours' and ctx.expires_at>now()
 and coalesce(pay.provider_payload->>'status','')='DONE' and coalesce(pay.provider_payload->>'currency','')='KRW'
 and pay.provider_payload->>'orderId'=o.order_number and pay.provider_payload->>'paymentKey'=pay.provider_payment_key
 and pay.provider_payload->>'totalAmount'=o.total_amount::text
 and not exists(select 1 from public.refunds r where r.payment_id=pay.id and r.status in ('requested','done'))
 and exists(select 1 from public.order_items where order_id=o.id)
 and not exists(select 1 from public.order_items i join public.courses c on c.id=i.course_id where i.order_id=o.id and (c.category is distinct from 'paid_class' or not(i.course_id=any(cfg.course_ids)))))
$$;

create function public.edu_meta_purchase_order_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='pending' and new.expires_at is distinct from old.expires_at then
  update public.edu_meta_purchase_contexts set expires_at=least(coalesce(new.expires_at,now()+interval '24 hours'),new.created_at+interval '7 days') where order_id=new.id;
 elsif new.status='paid' and old.status is distinct from 'paid' then
  if public.edu_meta_purchase_eligible(new.id) then
   insert into public.edu_meta_purchase_outbox(order_id,member_id,dataset,event_time,amount,course_ids)
   select new.id,new.user_id,cfg.dataset,new.paid_at,new.total_amount,array(select distinct course_id from public.order_items where order_id=new.id order by course_id)
   from public.edu_meta_purchase_config cfg where cfg.enabled on conflict(order_id) do nothing;
   update public.edu_meta_purchase_contexts set expires_at=new.paid_at+interval '24 hours' where order_id=new.id;
  else delete from public.edu_meta_purchase_contexts where order_id=new.id; end if;
 elsif new.status in ('cancelled','payment_failed','partially_refunded','refunded') then
  update public.edu_meta_purchase_outbox set status='cancelled',lease=null,lease_until=null,finished_at=now() where order_id=new.id and status in ('pending','processing');
  delete from public.edu_meta_purchase_contexts where order_id=new.id;
 end if;
 return new;
end$$;
create trigger edu_meta_purchase_order_changed after update of status,expires_at on public.orders for each row execute function public.edu_meta_purchase_order_changed();

create function public.edu_meta_purchase_preference_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.edu_meta_purchase_outbox set status='cancelled',lease=null,lease_until=null,finished_at=now() where member_id=new.member_id and status in ('pending','processing');
 delete from public.edu_meta_purchase_contexts where member_id=new.member_id;
 return new;
end$$;
create trigger edu_meta_purchase_preference_changed after update on public.edu_meta_purchase_preferences for each row execute function public.edu_meta_purchase_preference_changed();
create function public.edu_meta_purchase_config_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.edu_meta_purchase_outbox set status='cancelled',lease=null,lease_until=null,finished_at=now() where status in ('pending','processing');
 delete from public.edu_meta_purchase_contexts;
 return new;
end$$;
create trigger edu_meta_purchase_config_changed after update or delete on public.edu_meta_purchase_config for each row execute function public.edu_meta_purchase_config_changed();

create function public.edu_meta_purchase_cleanup() returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.edu_meta_purchase_outbox q set status='cancelled',lease=null,lease_until=null,finished_at=now()
 where status in ('pending','processing') and (q.event_time<=now()-interval '24 hours' or (q.attempts>=12 and q.lease_until<=now()) or not public.edu_meta_purchase_eligible(q.order_id));
 delete from public.edu_meta_purchase_contexts ctx where expires_at<=now()
 or not exists(select 1 from public.profiles p join public.edu_meta_purchase_preferences pref on pref.member_id=p.id and pref.consented
 join public.edu_meta_purchase_terms terms on terms.version=pref.wording_version and terms.is_current and terms.approved_at<=now() and terms.effective_at<=now()
 join public.edu_meta_purchase_config cfg on cfg.enabled
 where p.id=ctx.member_id and p.status='active' and pref.revision=ctx.revision and pref.wording_version=ctx.version)
 or exists(select 1 from public.edu_meta_purchase_outbox q where q.order_id=ctx.order_id and q.status in ('sent','cancelled','blocked'));
 delete from public.edu_meta_purchase_outbox where finished_at<now()-interval '90 days';
end$$;
create function public.edu_authorize_meta_purchase(p_order uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare authorized boolean;
begin
 authorized:=exists(select 1 from public.edu_meta_purchase_outbox q join public.edu_meta_purchase_config cfg on cfg.enabled and cfg.dataset=q.dataset
 join public.orders o on o.id=q.order_id and o.total_amount=q.amount and o.paid_at=q.event_time
 where q.order_id=p_order and q.lease=p_lease and q.status='processing' and q.lease_until>now()
 and q.course_ids=array(select distinct course_id from public.order_items where order_id=q.order_id order by course_id)
 and public.edu_meta_purchase_eligible(q.order_id));
 if not authorized then
  update public.edu_meta_purchase_outbox set status='cancelled',lease=null,lease_until=null,finished_at=now() where order_id=p_order and lease=p_lease and status='processing';
  if found then delete from public.edu_meta_purchase_contexts where order_id=p_order; end if;
 end if;
 return authorized;
end$$;
create function public.edu_claim_meta_purchase() returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.edu_meta_purchase_outbox; ctx public.edu_meta_purchase_contexts;
begin
 select * into job from public.edu_meta_purchase_outbox q where status in ('pending','processing') and next_at<=now()
 and (lease_until is null or lease_until<=now()) and attempts<12 and public.edu_meta_purchase_eligible(q.order_id)
 order by next_at,order_id limit 1 for update skip locked;
 if job.order_id is null then return null; end if;
 update public.edu_meta_purchase_outbox set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',next_at=now()+interval '2 minutes',attempts=attempts+1 where order_id=job.order_id returning * into job;
 select * into ctx from public.edu_meta_purchase_contexts where order_id=job.order_id;
 return jsonb_build_object('orderId',job.order_id,'eventId',job.event_id,'lease',job.lease,'dataset',job.dataset,
  'eventTime',floor(extract(epoch from job.event_time)),'amount',job.amount,'courseIds',to_jsonb(job.course_ids),
  'emailHash',ctx.email_hash,'userAgent',ctx.user_agent,'sourceUrl',ctx.source_url,'fbp',ctx.fbp,'fbc',ctx.fbc);
end$$;
create function public.edu_finish_meta_purchase(p_order uuid,p_lease uuid,p_outcome text,p_trace text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare job public.edu_meta_purchase_outbox; terminal boolean;
begin
 if p_outcome not in ('sent','retry','blocked') or (p_trace is not null and p_trace !~ '^[A-Za-z0-9_-]{1,128}$') then raise exception 'META_PURCHASE_RESULT'; end if;
 select * into job from public.edu_meta_purchase_outbox where order_id=p_order and status='processing' and lease=p_lease and lease_until>now() for update;
 if job.order_id is null then return false; end if;
 terminal:=p_outcome<>'retry' or job.attempts>=12 or job.event_time<=now()-interval '24 hours';
 update public.edu_meta_purchase_outbox set status=case when p_outcome='retry' then case when terminal then 'blocked' else 'pending' end else p_outcome end,
 trace=p_trace,lease=null,lease_until=null,finished_at=case when terminal then now() else null end,
 next_at=now()+case when job.attempts=1 then interval '1 minute' when job.attempts=2 then interval '5 minutes' when job.attempts=3 then interval '15 minutes' when job.attempts=4 then interval '1 hour' else interval '6 hours' end where order_id=p_order;
 if terminal then delete from public.edu_meta_purchase_contexts where order_id=p_order; end if;
 if p_outcome='blocked' then update public.edu_meta_purchase_config set enabled=false where enabled; end if;
 return true;
end$$;
create function public.edu_reject_meta_purchase(p_member uuid,p_request uuid) returns void language plpgsql security invoker set search_path='' as $$
declare revision uuid;
begin
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'META_CONSENT_FORBIDDEN'; end if;
 select p.revision into revision from public.edu_meta_purchase_preferences p where p.member_id=p_member;
 perform public.edu_meta_purchase_consent(p_member,p_request,revision,false,null,'profile');
end$$;
create function public.edu_pause_meta_purchase() returns void language sql security invoker set search_path='' as $$
 update public.edu_meta_purchase_config set enabled=false where enabled
$$;
do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('edu_capture_meta_purchase','edu_meta_purchase_eligible','edu_meta_purchase_order_changed','edu_meta_purchase_preference_changed','edu_meta_purchase_config_changed','edu_meta_purchase_cleanup','edu_authorize_meta_purchase','edu_claim_meta_purchase','edu_finish_meta_purchase','edu_reject_meta_purchase','edu_pause_meta_purchase') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn);
 execute format('grant execute on function %s to service_role',fn);
 end loop;
end$$;
commit;
