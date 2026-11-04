-- READ-ONLY METADATA PREFLIGHT. Prepared only; not executed against DEV by author.
-- Verify the connected DEV project before running. This file contains SELECTs only.
-- Never return member rows, email/phone values, message/template bodies, cron commands,
-- credentials or full function definitions. Do not invoke any function listed below.
-- This establishes enqueue eligibility and inventories possible workers. It does NOT
-- prove worker inactivity, recipient filtering, Auth-hook isolation, or safe creation.
-- Scope: signup only. Existing-account enrollment/revoke/profile-status changes need
-- the separate 04-enrollment-notification-preflight.sql; zero signed_up tags is not
-- evidence that those later operations are safe.

-- 1. Catalog-only shape confirmation. Every data column used below was observed
-- in the reviewed crm_enqueue_automation / crm_sync_automatic_tags definitions.
select table_schema,table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and (
 (table_name='crm_automations' and column_name in
   ('id','is_active','trigger_type','trigger_tag_id','trigger_course_id','delay_minutes'))
 or (table_name='crm_tags' and column_name in ('id','tag_kind','is_active','rule_key'))
 or table_name='crm_automation_runs'
)
order by table_name,ordinal_position;

-- 2. Rule metadata only. The two matches reproduce the current enqueue predicate:
-- member_joined passes NULL tag/course; tag_assigned passes its tag and NULL course.
-- A fresh profile receives each active automatic signed_up tag before its tag event.
with signup_tags as (
 select id,rule_key from public.crm_tags
 where tag_kind='automatic' and is_active and rule_key='signed_up'
), matching_member_rules as (
 select id,trigger_type,is_active,delay_minutes from public.crm_automations
 where is_active and trigger_type='member_joined'
   and trigger_tag_id is null and trigger_course_id is null
), matching_tag_rules as (
 select a.id,a.trigger_type,a.is_active,a.delay_minutes,t.id as tag_id,t.rule_key
 from public.crm_automations a join signup_tags t
   on a.trigger_tag_id is null or a.trigger_tag_id=t.id
 where a.is_active and a.trigger_type='tag_assigned' and a.trigger_course_id is null
)
select jsonb_build_object(
 'scope','enqueue predicates only; not a permission to create QA accounts',
 'candidate_rules',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'trigger_type',trigger_type,'is_active',is_active,
   'has_tag_filter',trigger_tag_id is not null,
   'has_course_filter',trigger_course_id is not null,
   'delay_minutes',delay_minutes) order by trigger_type,id)
   from public.crm_automations where trigger_type in ('member_joined','tag_assigned','marketing_consent')),'[]'::jsonb),
 'active_signup_tags',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rule_key',rule_key) order by id) from signup_tags),'[]'::jsonb),
 'member_joined_eligible_rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from matching_member_rules r),'[]'::jsonb),
 'signed_up_tag_eligible_rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id,r.tag_id) from matching_tag_rules r),'[]'::jsonb),
 'eligible_member_rule_count',(select count(*) from matching_member_rules),
 'eligible_signup_tag_rule_pair_count',(select count(*) from matching_tag_rules)
) as notification_enqueue_metadata;

-- 3. Function existence/signature/hash only. Body token checks are hints for the
-- reviewer, never proof of a correctly enforced exclusion. Helpers or app workers
-- can implement the checks elsewhere, and a matching token may be ineffective.
with candidates as (
 select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
   p.prosecdef,pg_get_functiondef(p.oid) as definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and (
   (n.nspname='public' and p.proname like 'crm_%')
   or (n.nspname='edu_tips_private' and p.proname ~
     '(claim|queue|enqueue|capture|subject_allowed|cohort_synthetic_allowed|deliver|dispatch|process|send|retire)')
 )
)
select nspname as schema_name,proname as function_name,arguments,prosecdef as security_definer,
 md5(definition) as definition_md5,
 proname ~ '(claim|dequeue|process|send|dispatch|deliver|eligib)' as worker_name_candidate,
 position('@example.invalid' in definition)>0 as contains_invalid_email_literal,
 position('qa_only' in definition)>0 as contains_qa_only_literal,
 position('is_internal' in definition)>0 as contains_internal_flag,
 definition ~* '(net[.]http|http_post|http_get|pg_notify)' as contains_external_or_notify_token
from candidates order by nspname,proname,arguments;

-- 4. Queue-side trigger metadata; an INSERT into a run/tag table can have further
-- effects. Definitions stay on the database side. No queue member/status rows read.
select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,
 t.tgenabled as enabled_state,pn.nspname as function_schema,p.proname as function_name,
 md5(pg_get_triggerdef(t.oid)) as trigger_md5,
 md5(pg_get_functiondef(t.tgfoid)) as function_md5
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal and (
 (n.nspname='public' and c.relname in ('crm_automation_runs','crm_member_tags'))
 or (n.nspname='edu_tips_private' and c.relname in
   ('identity_jobs','hmac_intents','hmac_subjects','cohort_refresh_events','erasure_outbox'))
)
order by n.nspname,c.relname,t.tgname;

-- 5. Presence only. Scheduler schemas do not establish that a worker is running;
-- do not select cron.job.command or an HTTP queue payload because they can hold secrets.
select to_regclass('cron.job') is not null as cron_job_catalog_present,
 to_regclass('net.http_request_queue') is not null as pg_net_queue_present,
 to_regclass('public.crm_automation_runs') is not null as crm_run_queue_present,
 to_regclass('edu_tips_private.cohort_refresh_events') is not null as tips_refresh_queue_present;
