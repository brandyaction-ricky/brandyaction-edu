begin;
-- Explicit admin designation; no coupon-name, price or customer-identity heuristic.
alter table public.coupons add column is_alumni boolean not null default false;
create or replace function public.edu_save_coupon(p_actor uuid,p_id uuid,p_values jsonb,p_products uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; existing public.coupons%rowtype;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ADMIN_REQUIRED'; end if;
  if p_id is null then raise exception 'COUPON_INVALID'; end if;
  select * into existing from public.coupons where id=p_id for update;
  c:=jsonb_populate_record(null::public.coupons,p_values);
  c.id:=p_id; c.code:=upper(trim(c.code)); c.name:=trim(c.name);
  c.minimum_order_amount:=coalesce(c.minimum_order_amount,0);
  c.is_alumni:=coalesce(c.is_alumni,existing.is_alumni,false);
  c.exclude_free:=coalesce(c.exclude_free,true); c.is_active:=coalesce(c.is_active,true); c.is_draft:=coalesce(c.is_draft,false);
  c.product_scope:=coalesce(c.product_scope,'paid'); c.issue_target:=coalesce(c.issue_target,'all');
  if c.issue_target<>'tag' then c.target_tag_id:=null; end if;
  if c.discount_type='ADMIN_FREE' then c.discount_value:=100; c.max_discount_amount:=null; c.exclude_free:=true; end if;
  if c.name is null or length(c.name) not between 1 and 100 or c.code is null or c.code !~ '^[A-Z0-9_-]{3,30}$'
    or c.discount_type is null or c.discount_value is null or length(coalesce(c.description,''))>2000
    or (c.product_scope='specific' and coalesce(cardinality(p_products),0)=0)
    or exists(select 1 from unnest(p_products) requested(product_id) where not exists(select 1 from public.courses course where course.id=requested.product_id and course.status<>'archived' and to_jsonb(course)->>'archived_at' is null))
  then raise exception 'COUPON_INVALID'; end if;
  insert into public.coupons(id,name,description,code,discount_type,discount_value,max_discount_amount,minimum_order_amount,usage_limit,per_user_limit,product_scope,issue_target,target_tag_id,exclude_free,starts_at,ends_at,issue_start_at,issue_end_at,is_active,is_draft,is_alumni,created_by)
  values(c.id,c.name,c.description,c.code,c.discount_type,c.discount_value,c.max_discount_amount,c.minimum_order_amount,c.usage_limit,c.per_user_limit,c.product_scope,c.issue_target,c.target_tag_id,c.exclude_free,c.starts_at,c.ends_at,c.issue_start_at,c.issue_end_at,c.is_active,c.is_draft,c.is_alumni,p_actor)
  on conflict(id) do update set name=excluded.name,description=excluded.description,code=excluded.code,discount_type=excluded.discount_type,discount_value=excluded.discount_value,max_discount_amount=excluded.max_discount_amount,minimum_order_amount=excluded.minimum_order_amount,usage_limit=excluded.usage_limit,per_user_limit=excluded.per_user_limit,product_scope=excluded.product_scope,issue_target=excluded.issue_target,target_tag_id=excluded.target_tag_id,exclude_free=excluded.exclude_free,starts_at=excluded.starts_at,ends_at=excluded.ends_at,issue_start_at=excluded.issue_start_at,issue_end_at=excluded.issue_end_at,is_active=excluded.is_active,is_draft=excluded.is_draft,is_alumni=excluded.is_alumni,updated_at=now()
  returning * into c;
  delete from public.coupon_products where coupon_id=c.id;
  if c.product_scope='specific' then
    insert into public.coupon_products(coupon_id,course_id) select c.id,id from (select distinct unnest(p_products) id) ids;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'coupon.saved','coupon',c.id::text,to_jsonb(existing),to_jsonb(c));
  return to_jsonb(c);
end; $$;


revoke all on function public.edu_save_coupon(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.edu_save_coupon(uuid,uuid,jsonb,uuid[]) to service_role;

-- Keep coupon application, entitlement creation and attribution in one transaction.
create function public.edu_checkout_with_source(p_user_id uuid,p_cohort_id uuid,p_customer_name text,p_customer_email text,p_customer_phone text,p_terms_version text,p_privacy_version text,p_refund_policy_version text,p_code text,p_entry_src text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; source text;
begin
 if p_entry_src is not null and p_entry_src not in ('paid','organic','alumni','youtube') then raise exception 'ENTRY_SOURCE_INVALID'; end if;
 result:=public.edu_checkout_with_coupon(p_user_id,p_cohort_id,p_customer_name,p_customer_email,p_customer_phone,p_terms_version,p_privacy_version,p_refund_policy_version,p_code);
 select case when c.is_alumni then 'alumni' else p_entry_src end into source
 from public.orders o left join public.coupons c on c.id=o.coupon_id
 where o.id=(result->>'orderId')::uuid and o.user_id=p_user_id for update of o;
 if not found then raise exception 'ENTRY_SOURCE_ORDER_MISSING'; end if;
 update public.orders set entry_src=source where id=(result->>'orderId')::uuid and user_id=p_user_id;
 return result||jsonb_build_object('entrySource',source,'entrySourceRecorded',true);
end; $$;
revoke all on function public.edu_checkout_with_source(uuid,uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.edu_checkout_with_source(uuid,uuid,text,text,text,text,text,text,text,text) to service_role;

create or replace function public.edu_claim_recruitment_delivery(p_campaign uuid)
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
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'phone',phone,'full_name',full_name,'email',email,'status',status,'marketing_consent',marketing_consent,'entry_channel',(select r.channel from public.edu_webinar_registrations r where r.period_id=d.period_id and r.user_id=profiles.id))),'[]')
 into recipients from public.profiles where id=any(claimed);
 return jsonb_build_object('template',d.template_snapshot,'members',recipients,'reviewed',cardinality(d.recipient_ids),'excluded',cardinality(d.recipient_ids)-cardinality(claimed));
end;
$$;
revoke all on function public.edu_claim_recruitment_delivery(uuid) from public,anon,authenticated;
grant execute on function public.edu_claim_recruitment_delivery(uuid) to service_role;


-- All eligible paid orders for this cohort during its configured recruitment window.
-- This is distinct from webinar-registration conversion and never guesses historical src.
create function public.edu_entry_source_coverage(p_actor uuid,p_period text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; h public.cohorts%rowtype; result jsonb;
begin
 select * into actor from public.profiles where id=p_actor and status='active';
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text;
  if not coalesce(permissions @> '{"marketing":true,"products":true,"orders":true}'::jsonb,false) then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 select cohort.* into h from public.edu_webinar_campaigns c join public.cohorts cohort on cohort.id=c.paid_cohort_id where c.period_id=p_period;
 if not found or h.recruitment_start_at is null or h.recruitment_end_at is null then return jsonb_build_object('state','unconfigured'); end if;
 with eligible as (
  select o.id,o.entry_src from public.edu_analytics_orders o
  where o.status in ('paid','partially_refunded','refunded') and o.paid_at>=h.recruitment_start_at and o.paid_at<h.recruitment_end_at
   and exists(select 1 from public.order_items oi where oi.order_id=o.id and oi.cohort_id=h.id)
   and exists(select 1 from public.payments p where p.order_id=o.id and p.status in ('done','partial_cancelled','cancelled') and p.approved_amount>0)
 ), counts as (select count(*) as total,count(*) filter(where entry_src is null) as unknown,
  count(*) filter(where entry_src='paid') as paid,count(*) filter(where entry_src='organic') as organic,
  count(*) filter(where entry_src='alumni') as alumni,count(*) filter(where entry_src='youtube') as youtube from eligible)
 select jsonb_build_object('state','ready','from',h.recruitment_start_at,'to',h.recruitment_end_at,'total',total,'unknown',unknown,
  'rate',case when total=0 then null else round(100.0*unknown/total,1) end,
  'overTarget',case when total=0 then null else unknown*10>total end,
  'sources',jsonb_build_object('paid',paid,'organic',organic,'alumni',alumni,'youtube',youtube)) into result from counts;
 return result;
end; $$;
revoke all on function public.edu_entry_source_coverage(uuid,text) from public,anon,authenticated;
grant execute on function public.edu_entry_source_coverage(uuid,text) to service_role;
commit;
