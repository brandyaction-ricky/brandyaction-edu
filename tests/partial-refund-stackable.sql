begin;
do $$
declare admin uuid:='00000000-0000-4000-8000-000000000001'; member uuid:=gen_random_uuid();
 course uuid:=gen_random_uuid(); cohort uuid:=gen_random_uuid(); base_id uuid:=gen_random_uuid(); extra uuid:=gen_random_uuid(); rate uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 q jsonb; reversed jsonb; free_id uuid:=gen_random_uuid(); o jsonb; v_order_id uuid; v_payment_id uuid; v_enrollment_id uuid; req uuid; claim jsonb; payload jsonb; cancellation jsonb; cumulative integer:=0; amount integer; saved jsonb;
begin
 update public.profiles set role='admin',status='active' where id=admin;
 insert into auth.users(id,email,raw_user_meta_data) values(member,'refund-stack@example.invalid','{}');
 insert into public.courses(id,course_code,title,slug,category,status,list_price) values(course,'STACK-QA','Stack QA','stack-qa','paid_class','published',1000000);
 insert into public.cohorts(id,cohort_code,course_id,name,status,price,recruitment_start_at,recruitment_end_at) values(cohort,'STACK-QA',course,'Stack QA','recruiting',1000000,now()-interval '1 day',now()+interval '7 days');
 insert into public.coupons(id,name,code,discount_type,discount_value,product_scope,per_user_limit) values(base_id,'일반','BASE_QA','fixed',300000,'all',1),(other,'다른 일반','OTHER_QA','fixed',100000,'all',1);
 saved:=jsonb_build_object('name','중복 정액','code','EXTRA_QA','discount_type','fixed','discount_value',100000,'product_scope','all','per_user_limit',1,'is_stackable',true,'is_alumni',true);
 perform public.edu_save_coupon(admin,extra,saved,'{}');
 if not (select is_stackable and is_alumni from public.coupons where id=extra) then raise exception 'QA_SAVE_FLAGS';end if;
 perform public.edu_save_coupon(admin,extra,saved-'is_stackable','{}');
 if not (select is_stackable from public.coupons where id=extra) then raise exception 'QA_OLD_CLIENT_PRESERVE';end if;
 perform public.edu_save_coupon(admin,extra,saved||'{"is_stackable":false}','{}');
 begin perform public.edu_event_quote(member,cohort,'BASE_QA+EXTRA_QA');raise exception 'QA_DISABLED_STACK';exception when raise_exception then if sqlerrm<>'COUPON_STACK_NOT_ALLOWED' then raise;end if;end;
 perform public.edu_save_coupon(admin,extra,saved,'{}');
 begin perform public.edu_save_coupon(member,extra,saved,'{}');raise exception 'QA_STUDENT_WRITE';exception when raise_exception then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
 insert into public.coupons(id,name,code,discount_type,discount_value,product_scope,per_user_limit,is_stackable) values(rate,'중복 정률','RATE_QA','percentage',10,'all',1,true);
 q:=public.edu_event_quote(member,cohort,'BASE_QA+EXTRA_QA+RATE_QA');
 reversed:=public.edu_event_quote(member,cohort,'RATE_QA+EXTRA_QA+BASE_QA');
 if q<>reversed or (q->>'totalAmount')::integer<>500000 or jsonb_array_length(q->'coupons')<>3 then raise exception 'QA_STACK_TOTAL %',q;end if;
 if (public.edu_event_quote(member,cohort,'RATE_QA+EXTRA_QA')->>'totalAmount')::integer<>800000 then raise exception 'QA_ALL_STACKABLE';end if;
 begin perform public.edu_event_quote(member,cohort,'BASE_QA+OTHER_QA+EXTRA_QA');raise exception 'QA_TWO_BASE';exception when raise_exception then if sqlerrm<>'COUPON_STACK_NOT_ALLOWED' then raise;end if;end;
 begin perform public.edu_event_quote(member,cohort,'EXTRA_QA+EXTRA_QA');raise exception 'QA_DUPLICATE';exception when raise_exception then if sqlerrm<>'COUPON_INVALID' then raise;end if;end;
 begin perform public.edu_event_quote(member,cohort,array_to_string(array(select 'CODE_'||i from generate_series(1,11)i),'+'));raise exception 'QA_MAX10';exception when raise_exception then if sqlerrm<>'COUPON_INVALID' then raise;end if;end;
 update public.coupons set ends_at=now()-interval '1 second' where id=extra;
 begin perform public.edu_event_quote(member,cohort,'BASE_QA+EXTRA_QA');raise exception 'QA_EXPIRY';exception when raise_exception then if sqlerrm<>'COUPON_EXPIRED' then raise;end if;end;
 update public.coupons set ends_at=null where id=extra;
 o:=public.edu_checkout_with_coupon(member,cohort,'QA','refund-stack@example.invalid','01000000000','qa','qa','qa','BASE_QA+EXTRA_QA+RATE_QA');
 v_order_id:=(o->>'orderId')::uuid;
 if (select count(*) from public.coupon_redemptions where coupon_redemptions.order_id=v_order_id and status='reserved')<>3 then raise exception 'QA_RESERVE3';end if;
 -- An admin revocation before order application is rechecked and leaves reservations intact.
 update public.coupons set is_stackable=false where id=extra;
 begin perform public.apply_coupon_to_order(v_order_id,member,'BASE_QA+EXTRA_QA+RATE_QA');raise exception 'QA_POLICY_CHANGED';exception when raise_exception then if sqlerrm<>'COUPON_STACK_NOT_ALLOWED' then raise;end if;end;
 update public.coupons set is_stackable=true where id=extra;
 payload:=jsonb_build_object('paymentKey','synthetic-refund-stack','orderId',o->>'orderNumber','totalAmount',500000,'status','DONE','currency','KRW');
 v_enrollment_id:=public.finalize_toss_payment(o->>'orderNumber','synthetic-refund-stack','CARD',500000,null,payload,now());
 select id into v_payment_id from public.payments where payments.order_id=v_order_id;
 if (select count(*) from public.customer_coupons where user_id=member and status='used')<>3 then raise exception 'QA_USE3';end if;
 begin perform public.edu_event_quote(member,cohort,'EXTRA_QA');raise exception 'QA_QUOTA';exception when raise_exception then if sqlerrm<>'COUPON_USER_LIMIT' then raise;end if;end;
 foreach amount in array array[100000,100000,300000] loop
  req:=gen_random_uuid();
  begin perform public.edu_claim_refund(member,req,v_payment_id,amount,'QA 환불');raise exception 'QA_REFUND_ADMIN';exception when raise_exception then if sqlerrm<>'관리자 권한이 필요합니다.' then raise;end if;end;
  begin perform public.edu_claim_refund(admin,req,v_payment_id,500001-cumulative,'QA 초과');raise exception 'QA_REFUND_OVER';exception when raise_exception then if sqlerrm<>'환불 가능 금액을 확인해 주세요.' then raise;end if;end;
  claim:=public.edu_claim_refund(admin,req,v_payment_id,amount,'QA 환불');
  if (claim->>'baseline_cancelled')::integer<>cumulative then raise exception 'QA_BASELINE';end if;
  if (public.edu_claim_refund(admin,req,v_payment_id,amount,'QA 환불')->>'isNew')::boolean then raise exception 'QA_REQUEST_IDEMPOTENCY';end if;
  begin perform public.edu_claim_refund(admin,gen_random_uuid(),v_payment_id,amount,'QA 동시 요청');raise exception 'QA_PENDING_LOCK';exception when raise_exception then if sqlerrm<>'확인 중인 환불이 있습니다. 해당 요청의 결과를 먼저 확인해 주세요.' then raise;end if;end;
  cancellation:=jsonb_build_object('cancelAmount',amount,'cancelStatus','DONE','transactionKey',req::text,'cancelReason','[EDU:'||req||'] QA 환불');
  payload:=payload||jsonb_build_object('balanceAmount',500000-cumulative-amount,'cancels',jsonb_build_array(cancellation));
  begin perform public.edu_complete_refund(req,payload||'{"balanceAmount":-1}',cancellation);raise exception 'QA_PAYLOAD_GUARD';exception when raise_exception then if sqlerrm<>'결제사 결과와 내부 내역을 대조해야 합니다.' then raise;end if;end;
  perform public.edu_complete_refund(req,payload,cancellation);
  perform public.edu_complete_refund(req,payload,cancellation);
  cumulative:=cumulative+amount;
  if (select cancelled_amount from public.payments where id=v_payment_id)<>cumulative then raise exception 'QA_REFUND_BALANCE';end if;
  if cumulative<500000 then
   if not exists(select 1 from public.enrollments where id=v_enrollment_id and status='active') then raise exception 'QA_PARTIAL_ACCESS';end if;
   if (select count(*) from public.customer_coupons where user_id=member and status='used')<>3 then raise exception 'QA_PARTIAL_QUOTA';end if;
  else
   if not exists(select 1 from public.enrollments where id=v_enrollment_id and status='refunded') then raise exception 'QA_FULL_REVOKE';end if;
   if (select count(*) from public.customer_coupons where user_id=member and status='available')<>3 then raise exception 'QA_FULL_RESTORE';end if;
  end if;
 end loop;
 if (select count(*) from public.refunds where refunds.payment_id=v_payment_id)<>3 then raise exception 'QA_REFUND_IDEMPOTENCY';end if;
 -- Ten genuinely distinct additional coupons pass; admin-only grants can never stack.
 insert into public.coupons(name,code,discount_type,discount_value,product_scope,is_stackable)
 select 'QA ten '||i,'TEN_'||i,'fixed',1,'all',true from generate_series(1,10)i;
 q:=public.edu_event_quote(member,cohort,array_to_string(array(select 'TEN_'||i from generate_series(1,10)i),'+'));
 if jsonb_array_length(q->'coupons')<>10 or (q->>'couponDiscount')::integer<>10 then raise exception 'QA_TEN_CODES';end if;
 perform public.edu_save_coupon(admin,free_id,jsonb_build_object('name','QA admin free','code','FREE_QA','discount_type','ADMIN_FREE','discount_value',100,'is_stackable',true),'{}');
 if (select is_stackable from public.coupons where id=free_id) then raise exception 'QA_ADMIN_FREE_FLAG';end if;
 begin perform public.edu_event_quote(admin,cohort,'FREE_QA+EXTRA_QA');raise exception 'QA_ADMIN_FREE_STACK';exception when raise_exception then if sqlerrm<>'COUPON_STACK_NOT_ALLOWED' then raise;end if;end;
 update public.cohorts set price=200000 where id=cohort;
 q:=public.edu_event_quote(member,cohort,'EXTRA_QA+BASE_QA+RATE_QA');
 if (q->>'totalAmount')::integer<>0 or jsonb_array_length(q->'coupons')<>1 or q->>'couponCode'<>'BASE_QA' then raise exception 'QA_CAP_UNUSED %',q;end if;
 if has_function_privilege('authenticated','public.edu_event_quote(uuid,uuid,text,uuid)','execute') or has_function_privilege('anon','public.edu_save_coupon(uuid,uuid,jsonb,uuid[])','execute') then raise exception 'QA_RPC_ACCESS';end if;
end; $$;
rollback;
