-- Read-only verification for BA-PAYMENT-COUPON-P0-001.
-- Expected result: every row has status=OK.

with expected_columns(table_name,column_name,data_type,is_nullable,column_default) as (values
  ('crm_tags','is_active','boolean','NO','true'),
  ('coupons','max_discount_amount','integer','YES',null),
  ('coupons','minimum_order_amount','integer','NO','0'),
  ('coupons','per_user_limit','integer','NO','1'),
  ('coupons','issue_target','text','NO','''all''::text'),
  ('coupons','target_tag_id','uuid','YES',null),
  ('coupons','exclude_free','boolean','NO','true')
)
select
  'column' as object_type,
  expected.table_name||'.'||expected.column_name as object_name,
  case
    when actual.column_name is null then 'MISSING'
    when actual.data_type<>expected.data_type
      or actual.is_nullable<>expected.is_nullable
      or coalesce(actual.column_default,'')<>coalesce(expected.column_default,'') then 'MISMATCH'
    else 'OK'
  end as status,
  concat_ws('|',actual.data_type,actual.is_nullable,actual.column_default) as actual_definition
from expected_columns expected
left join information_schema.columns actual
  on actual.table_schema='public'
 and actual.table_name=expected.table_name
 and actual.column_name=expected.column_name

union all

select
  'function',
  expected.name,
  case
    when function_object.oid is null then 'MISSING'
    when not function_object.prosecdef then 'NOT_SECURITY_DEFINER'
    when has_function_privilege('anon',function_object.oid,'EXECUTE')
      or has_function_privilege('authenticated',function_object.oid,'EXECUTE')
      or has_function_privilege('public',function_object.oid,'EXECUTE') then 'OVEREXPOSED'
    when not has_function_privilege('service_role',function_object.oid,'EXECUTE') then 'SERVICE_ROLE_MISSING'
    else 'OK'
  end,
  coalesce(pg_get_function_identity_arguments(function_object.oid),'')
from (values
  ('create_checkout_order'),
  ('apply_coupon_to_order'),
  ('finalize_zero_total_order'),
  ('finalize_zero_total_coupon_order'),
  ('finalize_toss_payment')
) expected(name)
left join pg_proc function_object
  on function_object.pronamespace='public'::regnamespace
 and function_object.proname=expected.name

union all

select
  'trigger',
  'orders.orders_sync_coupon_redemption',
  case when exists(
    select 1
    from pg_trigger trigger_object
    where trigger_object.tgrelid='public.orders'::regclass
      and trigger_object.tgname='orders_sync_coupon_redemption'
      and trigger_object.tgenabled<>'D'
  ) then 'OK' else 'MISSING' end,
  coalesce((
    select pg_get_triggerdef(trigger_object.oid,true)
    from pg_trigger trigger_object
    where trigger_object.tgrelid='public.orders'::regclass
      and trigger_object.tgname='orders_sync_coupon_redemption'
  ),'')

union all

select
  'index',
  'coupons.coupons_target_tag_id_idx',
  case when to_regclass('public.coupons_target_tag_id_idx') is not null then 'OK' else 'MISSING' end,
  coalesce((select indexdef from pg_indexes where schemaname='public' and indexname='coupons_target_tag_id_idx'),'')
order by 1,2;
