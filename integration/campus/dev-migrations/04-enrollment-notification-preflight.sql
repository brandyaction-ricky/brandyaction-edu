-- ADDITIONAL READ-ONLY METADATA PREFLIGHT for existing synthetic QA account reuse.
-- Prepared only; not executed against DEV by author. SELECT statements only.
-- The earlier 04-notification-preflight.sql computes signup eligibility only.
-- This file covers potential tag automations on enrollment/profile-status changes
-- and inventories other rule/caller types. It does NOT evaluate any person's orders,
-- enrollment history, submissions, progress, tags, queued messages or recipient fields.
-- In particular, zero signed_up tags does not establish safe enrollment or cleanup.

-- 1. Observed schema fields only. threshold_percent occurs in the reviewed
-- crm_sync_automatic_tags definition; no unverified run-state columns are assumed.
select table_schema,table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and (
 (table_name='crm_tags' and column_name in ('id','tag_kind','is_active','rule_key','threshold_percent'))
 or (table_name='crm_automations' and column_name in
   ('id','is_active','trigger_type','trigger_tag_id','trigger_course_id','delay_minutes'))
)
order by table_name,ordinal_position;

-- 2. Conservative metadata pairing for every active automatic-tag rule currently
-- recognized by crm_sync_automatic_tags. The function recomputes the whole member,
-- not just the enrollment being inserted/revoked. No target member eligibility is
-- inferred from these pairs; false-positive candidates must be resolved by a separately
-- authorized synthetic-identity-only check or by an established worker exclusion.
with automatic_tags as (
 select id,rule_key,threshold_percent,
   case when rule_key='signed_up' then 'profile_exists_not_withdrawn'
        when rule_key='paid_customer' then 'existing_paid_order_evidence_required'
        when rule_key='mission_completed' then 'existing_submitted_or_approved_mission_required'
        when rule_key like 'free_lesson_%' then 'active_free_enrollment_and_progress_required'
        else 'not_recognized_by_reviewed_sync_definition' end as eligibility_class
 from public.crm_tags where tag_kind='automatic' and is_active
), candidate_pairs as (
 select a.id as automation_id,a.trigger_type,a.is_active,a.delay_minutes,
   t.id as tag_id,t.rule_key,t.threshold_percent,t.eligibility_class
 from public.crm_automations a join automatic_tags t
   on a.trigger_tag_id is null or a.trigger_tag_id=t.id
 where a.is_active and a.trigger_type='tag_assigned' and a.trigger_course_id is null
   and t.eligibility_class<>'not_recognized_by_reviewed_sync_definition'
)
select jsonb_build_object(
 'scope','potential rules only; actual QA member eligibility and worker exclusion not evaluated',
 'active_automatic_tags',coalesce((select jsonb_agg(to_jsonb(t) order by t.rule_key,t.id) from automatic_tags t),'[]'::jsonb),
 'candidate_tag_rule_pairs',coalesce((select jsonb_agg(to_jsonb(p) order by p.automation_id,p.tag_id) from candidate_pairs p),'[]'::jsonb),
 'candidate_pair_count',(select count(*) from candidate_pairs),
 'zero_delay_candidate_pair_count',(select count(*) from candidate_pairs where delay_minutes=0),
 'all_active_rule_metadata',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'trigger_type',trigger_type,'is_active',is_active,'delay_minutes',delay_minutes,
   'has_tag_filter',trigger_tag_id is not null,'has_course_filter',trigger_course_id is not null
 ) order by trigger_type,id) from public.crm_automations where is_active),'[]'::jsonb)
) as enrollment_automation_metadata;

-- 3. Table trigger inventory. A new INSERT/DELETE/UPDATE trigger can extend effects
-- beyond the reviewed tag recomputation. enabled_state is reported, never changed.
select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,
 t.tgenabled as enabled_state,pn.nspname as function_schema,p.proname as function_name,
 md5(pg_get_triggerdef(t.oid)) as trigger_md5,
 md5(pg_get_functiondef(t.tgfoid)) as function_md5
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal and n.nspname='public'
 and c.relname in ('profiles','enrollments','courses','cohorts','crm_member_tags','crm_automation_runs')
order by n.nspname,c.relname,t.tgname;

-- 4. Static enqueue caller inventory, not function execution. Output only names,
-- signatures, hashes and literal trigger names. Dynamic dispatch / app-side calls
-- remain unknown. An unseen enrollment/course/status trigger must be traced before
-- reuse or cleanup is approved, even if signup-rule metadata looked harmless.
with callers as (
 select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
   pg_get_functiondef(p.oid) as definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and n.nspname in ('public','private','edu_tips_private')
), matched as (
 select * from callers where position('crm_enqueue_automation' in definition)>0
)
select nspname as schema_name,proname as function_name,arguments,
 md5(definition) as definition_md5,
 coalesce((select jsonb_agg(distinct hit[1]) from regexp_matches(definition,
   $pattern$crm_enqueue_automation\s*\(\s*'([^']+)'$pattern$,'g') as hit),'[]'::jsonb) as literal_trigger_types
from matched order by nspname,proname,arguments;

-- No profile role/status changes, tag assignments, queue deletion, worker calls,
-- Auth operations, actual data reads, Storage writes or shared trigger changes here.
