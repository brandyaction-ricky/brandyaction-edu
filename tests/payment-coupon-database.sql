-- DEV-only integration and rollback smoke test for BA-PAYMENT-COUPON-P0-001.
-- The final ROLLBACK is mandatory: no fixture survives a successful or failed run.

begin;

create temporary table qa_payment_coupon_context(
  actor uuid not null,
  paid_course uuid not null,
  paid_cohort uuid not null,
  payment_cohort uuid not null,
  free_course uuid not null,
  free_cohort uuid not null,
  paid_tag uuid not null,
  target_tag uuid not null
) on commit drop;

create or replace function pg_temp.qa_make_order(
  p_user uuid,
  p_course uuid,
  p_cohort uuid,
  p_amount integer,
  p_subtotal integer default null
)
returns uuid
language plpgsql
as $$
declare
  v_order uuid:=gen_random_uuid();
begin
  insert into public.orders(
    id,order_number,user_id,status,subtotal,discount_amount,total_amount,
    customer_name,customer_email,expires_at,terms_version,privacy_version,refund_policy_version
  ) values(
    v_order,'QA-P0-'||replace(v_order::text,'-',''),p_user,'pending',coalesce(p_subtotal,p_amount),
    greatest(coalesce(p_subtotal,p_amount)-p_amount,0),p_amount,
    'QA Rollback','qa-payment-coupon@example.invalid',now()+interval '30 minutes','qa','qa','qa'
  );
  insert into public.order_items(order_id,course_id,cohort_id,item_name,unit_price)
  values(v_order,p_course,p_cohort,'QA rollback item',p_amount);
  return v_order;
end;
$$;

do $$
declare
  v_actor uuid;
  v_paid_course uuid:=gen_random_uuid();
  v_paid_cohort uuid:=gen_random_uuid();
  v_payment_cohort uuid:=gen_random_uuid();
  v_free_course uuid:=gen_random_uuid();
  v_free_cohort uuid:=gen_random_uuid();
  v_paid_tag uuid;
  v_target_tag uuid:=gen_random_uuid();
begin
  select id into v_actor from public.profiles where status='active' order by created_at limit 1;
  if v_actor is null then raise exception 'QA_ACTIVE_PROFILE_REQUIRED'; end if;
  select id into v_paid_tag from public.crm_tags where rule_key='paid_customer';
  if v_paid_tag is null then raise exception 'QA_PAID_CUSTOMER_TAG_REQUIRED'; end if;

  insert into public.crm_tags(id,name,color,tag_kind,is_active)
  values(v_target_tag,'QA target '||v_target_tag::text,'#667CA0','manual',true);
  insert into public.crm_member_tags(member_id,tag_id,assignment_source)
  values(v_actor,v_target_tag,'manual');

  insert into public.courses(id,course_code,slug,title,category,list_price,status,metadata)
  values
    (v_paid_course,'QA-P0-PAID-'||substr(v_paid_course::text,1,8),'qa-p0-paid-'||substr(v_paid_course::text,1,8),'QA paid rollback','paid_class',100000,'published','{"programType":"paid"}'),
    (v_free_course,'QA-P0-FREE-'||substr(v_free_course::text,1,8),'qa-p0-free-'||substr(v_free_course::text,1,8),'QA free rollback','free',0,'published','{"programType":"free"}');
  insert into public.cohorts(id,course_id,cohort_code,name,price,status,recruitment_start_at,recruitment_end_at)
  values
    (v_paid_cohort,v_paid_course,'QA-PAID','QA paid',100000,'recruiting',now()-interval '1 day',now()+interval '1 day'),
    (v_payment_cohort,v_paid_course,'QA-PAYMENT','QA payment',100000,'recruiting',now()-interval '1 day',now()+interval '1 day'),
    (v_free_cohort,v_free_course,'QA-FREE','QA free',0,'recruiting',now()-interval '1 day',now()+interval '1 day');

  insert into qa_payment_coupon_context
  values(v_actor,v_paid_course,v_paid_cohort,v_payment_cohort,v_free_course,v_free_cohort,v_paid_tag,v_target_tag);
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_order uuid;
  v_coupon uuid:=gen_random_uuid();
  v_fixed uuid:=gen_random_uuid();
  v_before record;
  v_result jsonb;
  v_failed boolean;
begin
  select * into c from qa_payment_coupon_context;
  insert into public.coupons(
    id,name,code,discount_type,discount_value,max_discount_amount,minimum_order_amount,
    per_user_limit,product_scope,issue_target,exclude_free,is_active
  ) values
    (v_coupon,'QA percent','QA_PERCENT_10','percentage',10,5000,50000,2,'paid','all',true,true),
    (v_fixed,'QA fixed','QA_FIXED_7000','fixed',7000,null,0,2,'all','all',true,true);

  v_failed:=false;
  begin
    insert into public.coupons(name,code,discount_type,discount_value,per_user_limit,product_scope,issue_target,exclude_free)
    values('QA duplicate','QA_PERCENT_10','fixed',1000,1,'all','all',true);
  exception when unique_violation then v_failed:=true; end;
  if not v_failed then raise exception 'QA_DUPLICATE_CODE_NOT_REJECTED'; end if;

  v_failed:=false;
  begin
    insert into public.coupons(name,code,discount_type,discount_value,per_user_limit,product_scope,issue_target,exclude_free)
    values('QA invalid rate','QA_INVALID_RATE','percentage',101,1,'all','all',true);
  exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception 'QA_INVALID_PERCENTAGE_NOT_REJECTED'; end if;

  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  v_result:=public.apply_coupon_to_order(v_order,c.actor,'qa_percent_10');
  if (v_result->>'couponDiscount')::integer<>5000 or (v_result->>'totalAmount')::integer<>95000 then
    raise exception 'QA_PERCENTAGE_CAP_FAILED';
  end if;

  v_result:=public.apply_coupon_to_order(v_order,c.actor,'QA_FIXED_7000');
  if (v_result->>'couponDiscount')::integer<>7000 or (v_result->>'totalAmount')::integer<>93000 then
    raise exception 'QA_FIXED_DISCOUNT_FAILED';
  end if;
  v_result:=public.apply_coupon_to_order(v_order,c.actor,'QA_FIXED_7000');
  if (select count(*) from public.coupon_redemptions where order_id=v_order)<>1 then
    raise exception 'QA_COUPON_REAPPLY_DUPLICATED_REDEMPTION';
  end if;

  select coupon_id,coupon_code,discount_amount,total_amount into v_before
  from public.orders where id=v_order;
  v_failed:=false;
  begin
    perform public.apply_coupon_to_order(v_order,c.actor,'NOT_A_COUPON');
  exception when others then
    v_failed:=sqlerrm='COUPON_NOT_FOUND';
  end;
  if not v_failed then raise exception 'QA_INVALID_COUPON_NOT_REJECTED'; end if;
  if exists(
    select 1 from public.orders
    where id=v_order and (
      coupon_id is distinct from v_before.coupon_id
      or coupon_code is distinct from v_before.coupon_code
      or discount_amount is distinct from v_before.discount_amount
      or total_amount is distinct from v_before.total_amount
    )
  ) then raise exception 'QA_FAILED_COUPON_CHANGED_ORDER'; end if;
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_order uuid;
  v_other_order uuid;
  v_coupon uuid;
  v_failed boolean;
  v_case record;
begin
  select * into c from qa_payment_coupon_context;
  for v_case in select * from (values
    ('QA_INACTIVE','inactive',false,now()-interval '1 day',now()+interval '1 day',0,'COUPON_INACTIVE'),
    ('QA_FUTURE','future',true,now()+interval '1 day',now()+interval '2 days',0,'COUPON_NOT_STARTED'),
    ('QA_EXPIRED','expired',true,now()-interval '2 days',now()-interval '1 day',0,'COUPON_EXPIRED'),
    ('QA_MINIMUM','minimum',true,now()-interval '1 day',now()+interval '1 day',200000,'COUPON_MINIMUM_NOT_MET')
  ) as cases(code,name,active,starts_at,ends_at,minimum_amount,error_message)
  loop
    v_coupon:=gen_random_uuid();
    insert into public.coupons(id,name,code,discount_type,discount_value,minimum_order_amount,per_user_limit,product_scope,issue_target,exclude_free,is_active,starts_at,ends_at)
    values(v_coupon,'QA '||v_case.name,v_case.code,'percentage',10,v_case.minimum_amount,1,'all','all',true,v_case.active,v_case.starts_at,v_case.ends_at);
    v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
    v_failed:=false;
    begin
      perform public.apply_coupon_to_order(v_order,c.actor,v_case.code);
    exception when others then
      v_failed:=sqlerrm=v_case.error_message;
    end;
    if not v_failed then raise exception 'QA_COUPON_GUARD_FAILED: %',v_case.code; end if;
  end loop;

  v_coupon:=gen_random_uuid();
  insert into public.coupons(id,name,code,discount_type,discount_value,usage_limit,per_user_limit,product_scope,issue_target,exclude_free)
  values(v_coupon,'QA sold out','QA_SOLD_OUT','fixed',1000,1,2,'all','all',true);
  v_other_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  insert into public.coupon_redemptions(coupon_id,order_id,user_id,discount_amount,status,used_at)
  values(v_coupon,v_other_order,c.actor,1000,'used',now());
  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  v_failed:=false;
  begin perform public.apply_coupon_to_order(v_order,c.actor,'QA_SOLD_OUT');
  exception when others then v_failed:=sqlerrm='COUPON_SOLD_OUT'; end;
  if not v_failed then raise exception 'QA_TOTAL_LIMIT_FAILED'; end if;

  v_coupon:=gen_random_uuid();
  insert into public.coupons(id,name,code,discount_type,discount_value,per_user_limit,product_scope,issue_target,exclude_free)
  values(v_coupon,'QA user limit','QA_USER_LIMIT','fixed',1000,1,'all','all',true);
  v_other_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  insert into public.coupon_redemptions(coupon_id,order_id,user_id,discount_amount,status,used_at)
  values(v_coupon,v_other_order,c.actor,1000,'used',now());
  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  v_failed:=false;
  begin perform public.apply_coupon_to_order(v_order,c.actor,'QA_USER_LIMIT');
  exception when others then v_failed:=sqlerrm='COUPON_USER_LIMIT'; end;
  if not v_failed then raise exception 'QA_USER_LIMIT_FAILED'; end if;
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_specific uuid:=gen_random_uuid();
  v_tag uuid:=gen_random_uuid();
  v_free uuid:=gen_random_uuid();
  v_unowned_tag uuid:=gen_random_uuid();
  v_order uuid;
  v_failed boolean;
begin
  select * into c from qa_payment_coupon_context;
  insert into public.crm_tags(id,name,color,tag_kind,is_active)
  values(v_unowned_tag,'QA unowned '||v_unowned_tag::text,'#667CA0','manual',true);
  insert into public.coupons(id,name,code,discount_type,discount_value,per_user_limit,product_scope,issue_target,target_tag_id,exclude_free)
  values
    (v_specific,'QA specific','QA_SPECIFIC','fixed',1000,1,'specific','all',null,true),
    (v_tag,'QA tag','QA_TAG_ONLY','fixed',1000,1,'all','tag',v_unowned_tag,true),
    (v_free,'QA no free','QA_NO_FREE','fixed',1000,1,'all','all',null,true);

  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  v_failed:=false;
  begin perform public.apply_coupon_to_order(v_order,c.actor,'QA_SPECIFIC');
  exception when others then v_failed:=sqlerrm='COUPON_PRODUCT_MISMATCH'; end;
  if not v_failed then raise exception 'QA_SPECIFIC_SCOPE_FAILED'; end if;
  insert into public.coupon_products(coupon_id,course_id) values(v_specific,c.paid_course);
  perform public.apply_coupon_to_order(v_order,c.actor,'QA_SPECIFIC');

  v_failed:=false;
  begin perform public.apply_coupon_to_order(v_order,c.actor,'QA_TAG_ONLY');
  exception when others then v_failed:=sqlerrm='COUPON_MEMBER_NOT_ELIGIBLE'; end;
  if not v_failed then raise exception 'QA_TAG_SCOPE_FAILED'; end if;
  update public.coupons set target_tag_id=c.target_tag where id=v_tag;
  perform public.apply_coupon_to_order(v_order,c.actor,'QA_TAG_ONLY');

  v_order:=pg_temp.qa_make_order(c.actor,c.free_course,c.free_cohort,0);
  v_failed:=false;
  begin perform public.apply_coupon_to_order(v_order,c.actor,'QA_NO_FREE');
  exception when others then v_failed:=sqlerrm='COUPON_FREE_PRODUCT_EXCLUDED'; end;
  if not v_failed then raise exception 'QA_FREE_EXCLUSION_FAILED'; end if;
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_coupon uuid:=gen_random_uuid();
  v_order uuid;
  v_order_number text;
begin
  select * into c from qa_payment_coupon_context;
  insert into public.coupons(id,name,code,discount_type,discount_value,per_user_limit,product_scope,issue_target,exclude_free)
  values(v_coupon,'QA 100 percent','QA_FREE_100','percentage',100,1,'paid','all',true);
  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  perform public.apply_coupon_to_order(v_order,c.actor,'QA_FREE_100');
  v_order_number:=public.finalize_zero_total_order(v_order,c.actor);
  if not exists(select 1 from public.orders where id=v_order and status='paid' and total_amount=0) then raise exception 'QA_ZERO_TOTAL_ORDER_NOT_PAID'; end if;
  if not exists(select 1 from public.coupon_redemptions where order_id=v_order and status='used') then raise exception 'QA_ZERO_TOTAL_REDEMPTION_NOT_USED'; end if;
  if not exists(select 1 from public.enrollments where user_id=c.actor and cohort_id=c.paid_cohort and status='active') then raise exception 'QA_ZERO_TOTAL_ENROLLMENT_MISSING'; end if;
  if exists(select 1 from public.payments where order_id=v_order) then raise exception 'QA_ZERO_TOTAL_CREATED_PAYMENT'; end if;
  if not exists(select 1 from public.crm_member_tags where member_id=c.actor and tag_id=c.paid_tag and assignment_source='automatic') then raise exception 'QA_ZERO_TOTAL_PAID_TAG_MISSING'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=v_order::text and action='coupon.zero_total_order_completed') then raise exception 'QA_ZERO_TOTAL_AUDIT_MISSING'; end if;

  if public.finalize_zero_total_order(v_order,c.actor)<>v_order_number then raise exception 'QA_ZERO_TOTAL_RETRY_RESULT_CHANGED'; end if;
  if (select count(*) from public.enrollments where user_id=c.actor and cohort_id=c.paid_cohort)<>1 then raise exception 'QA_ZERO_TOTAL_DUPLICATE_ENROLLMENT'; end if;
  if (select count(*) from public.audit_logs where entity_id=v_order::text and action='coupon.zero_total_order_completed')<>1 then raise exception 'QA_ZERO_TOTAL_DUPLICATE_AUDIT'; end if;
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_order uuid;
  v_key text:='qa-payment-'||replace(gen_random_uuid()::text,'-','');
  v_payload jsonb;
  v_enrollment uuid;
  v_failed boolean:=false;
begin
  select * into c from qa_payment_coupon_context;
  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.payment_cohort,100000);
  v_payload:=jsonb_build_object(
    'paymentKey',v_key,
    'orderId',(select order_number from public.orders where id=v_order),
    'totalAmount',100000,
    'status','DONE',
    'currency','KRW'
  );

  begin
    perform public.finalize_toss_payment(
      v_payload->>'orderId',v_key,'CARD',99999,null,v_payload,now()
    );
  exception when others then
    v_failed:=sqlerrm='PAYMENT_PROVIDER_DATA_MISMATCH' or sqlerrm='PAYMENT_AMOUNT_MISMATCH';
  end;
  if not v_failed then raise exception 'QA_PAYMENT_AMOUNT_TAMPER_NOT_REJECTED'; end if;
  if exists(select 1 from public.payments where order_id=v_order) then raise exception 'QA_FAILED_PAYMENT_LEFT_ROW'; end if;

  v_enrollment:=public.finalize_toss_payment(
    v_payload->>'orderId',v_key,'CARD',100000,'https://example.invalid/receipt',v_payload,now()
  );
  if not exists(select 1 from public.orders where id=v_order and status='paid') then raise exception 'QA_PAYMENT_ORDER_NOT_PAID'; end if;
  if not exists(select 1 from public.payments where order_id=v_order and status='done' and approved_amount=100000) then raise exception 'QA_PAYMENT_ROW_MISSING'; end if;
  if not exists(select 1 from public.enrollments where id=v_enrollment and status='active') then raise exception 'QA_PAYMENT_ENROLLMENT_MISSING'; end if;

  perform public.finalize_toss_payment(
    v_payload->>'orderId',v_key,'CARD',100000,'https://example.invalid/receipt',v_payload,now()
  );
  if (select count(*) from public.payments where order_id=v_order)<>1 then raise exception 'QA_PAYMENT_RETRY_DUPLICATED_PAYMENT'; end if;
  if (select count(*) from public.enrollments where user_id=c.actor and cohort_id=c.payment_cohort)<>1 then raise exception 'QA_PAYMENT_RETRY_DUPLICATED_ENROLLMENT'; end if;
  if (select count(*) from public.audit_logs where entity_id=v_order::text and action='payment.approved')<>1 then raise exception 'QA_PAYMENT_RETRY_DUPLICATED_AUDIT'; end if;
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_coupon uuid:=gen_random_uuid();
  v_order uuid;
begin
  select * into c from qa_payment_coupon_context;
  insert into public.coupons(id,name,code,discount_type,discount_value,per_user_limit,product_scope,issue_target,exclude_free)
  values(v_coupon,'QA release','QA_RELEASE','fixed',1000,1,'all','all',true);
  v_order:=pg_temp.qa_make_order(c.actor,c.paid_course,c.paid_cohort,100000);
  perform public.apply_coupon_to_order(v_order,c.actor,'QA_RELEASE');
  update public.orders set status='payment_failed' where id=v_order;
  if not exists(select 1 from public.coupon_redemptions where order_id=v_order and status='released') then
    raise exception 'QA_FAILED_ORDER_COUPON_NOT_RELEASED';
  end if;
end;
$$;

do $$
declare
  c qa_payment_coupon_context%rowtype;
  v_order uuid;
  v_zero_paid_order uuid;
  v_zero_paid_cohort uuid:=gen_random_uuid();
  v_checkout jsonb;
begin
  select * into c from qa_payment_coupon_context;
  v_checkout:=public.create_checkout_order(
    c.actor,c.free_cohort,'QA Rollback','qa-payment-coupon@example.invalid','010-0000-0000','qa','qa','qa'
  );
  v_order:=(v_checkout->>'orderId')::uuid;
  if (v_checkout->>'totalAmount')::integer<>0 then raise exception 'QA_FREE_CHECKOUT_TOTAL_NOT_ZERO'; end if;
  perform public.finalize_zero_total_order(v_order,c.actor);
  if not exists(select 1 from public.orders where id=v_order and status='paid') then raise exception 'QA_FREE_ORDER_NOT_PAID'; end if;
  if not exists(select 1 from public.enrollments where user_id=c.actor and cohort_id=c.free_cohort and status='active') then raise exception 'QA_FREE_ENROLLMENT_MISSING'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=v_order::text and action='free_order.completed') then raise exception 'QA_FREE_AUDIT_MISSING'; end if;

  insert into public.cohorts(id,course_id,cohort_code,name,price,status,recruitment_start_at,recruitment_end_at)
  values(v_zero_paid_cohort,c.paid_course,'QA-ZERO-'||substr(v_zero_paid_cohort::text,1,8),'QA zero-price paid',0,'recruiting',now()-interval '1 day',now()+interval '1 day');
  v_checkout:=public.create_checkout_order(
    c.actor,v_zero_paid_cohort,'QA Rollback','qa-payment-coupon@example.invalid','010-0000-0000','qa','qa','qa'
  );
  v_zero_paid_order:=(v_checkout->>'orderId')::uuid;
  perform public.finalize_zero_total_order(v_zero_paid_order,c.actor);
  if not exists(select 1 from public.audit_logs where entity_id=v_zero_paid_order::text and action='zero_price_order.completed') then
    raise exception 'QA_ZERO_PRICE_PAID_AUDIT_MISSING';
  end if;
end;
$$;

rollback;
