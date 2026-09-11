-- DEV only. Every fixture and mutation is rolled back; no payment-provider calls.
begin;
do $$
declare
 actor uuid; member uuid; request uuid:=gen_random_uuid(); question_request uuid:=gen_random_uuid();
 first_row jsonb; second_row jsonb; course jsonb; cohort jsonb; enrollment uuid; again uuid;
 payment public.payments%rowtype; claim jsonb; denied boolean;
begin
 select id into actor from public.profiles where email='rickyjeon89@gmail.com' and role='admin' and status='active';
 select id into member from public.profiles where role<>'admin' and status='active' limit 1;
 if actor is null or member is null then raise exception 'QA requires an existing DEV admin and active member'; end if;
 first_row:=public.edu_create_record(actor,request,'site_banners','{"title":"QA rollback banner","is_active":false}'::jsonb);
 second_row:=public.edu_create_record(actor,request,'site_banners','{"title":"QA rollback banner","is_active":false}'::jsonb);
 if first_row->>'id'<>second_row->>'id' then raise exception 'F-01 duplicate create'; end if;
 denied:=false;
 begin perform public.edu_create_record(actor,request,'site_banners','{"title":"different"}'::jsonb); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'F-01 request reuse did not reject mismatched data'; end if;
 denied:=false;
 begin perform public.edu_create_record(member,gen_random_uuid(),'site_banners','{"title":"blocked"}'::jsonb); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'Admin boundary failed'; end if;
 second_row:=public.edu_create_record(member,question_request,'edu_questions',jsonb_build_object('user_id',member,'title','QA rollback question','content','Duplicate test'));
 if second_row<>public.edu_create_record(member,question_request,'edu_questions',jsonb_build_object('user_id',member,'title','QA rollback question','content','Duplicate test')) then raise exception 'F-01 question deduplication failed'; end if;
 perform public.edu_archive_records(actor,'banners',array[(first_row->>'id')::uuid]);
 if not exists(select 1 from public.site_banners where id=(first_row->>'id')::uuid and not is_active and archived_at is not null) then raise exception 'F-02 archive failed'; end if;
 perform public.edu_archive_records(actor,'questions',array[(second_row->>'id')::uuid]);
 if not exists(select 1 from public.edu_questions where id=(second_row->>'id')::uuid and is_archived) then raise exception 'F-02 question archive failed'; end if;
 course:=public.edu_create_record(actor,gen_random_uuid(),'courses',jsonb_build_object('title','QA rollback course','course_code','QA-'||request::text,'slug','qa-'||request::text,'status','draft'));
 cohort:=public.edu_create_record(actor,gen_random_uuid(),'cohorts',jsonb_build_object('course_id',course->>'id','name','QA rollback cohort','cohort_code','QA-'||request::text,'price',0,'capacity',10));
 enrollment:=public.edu_grant_enrollment(actor,member,(cohort->>'id')::uuid,now()+interval '1 day','QA transaction rollback');
 again:=public.edu_grant_enrollment(actor,member,(cohort->>'id')::uuid,now()+interval '1 day','QA transaction rollback');
 if enrollment<>again then raise exception 'F-02 grant duplicated'; end if;
 if (public.edu_admin_summary()->>'netRevenue')::bigint<>(select coalesce(sum(approved_amount-cancelled_amount),0) from public.payments) then raise exception 'F-05 revenue mismatch'; end if;
 select * into payment from public.payments where approved_amount-cancelled_amount>1 and not exists(select 1 from public.edu_refund_requests where payment_id=payments.id and status='processing') limit 1;
 if payment.id is null then raise exception 'QA requires an unblocked refundable DEV payment fixture'; end if;
 request:=gen_random_uuid();
 claim:=public.edu_claim_refund(actor,request,payment.id,1,'QA no external call');
 if claim->>'isNew'<>'true' then raise exception 'refund claim failed'; end if;
 if public.edu_claim_refund(actor,request,payment.id,1,'QA no external call')->>'isNew'<>'false' then raise exception 'refund retry is not idempotent'; end if;
 denied:=false;
 begin perform public.edu_claim_refund(actor,gen_random_uuid(),payment.id,1,'QA second request'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'second pending refund was allowed'; end if;
 denied:=false;
 begin perform public.edu_complete_refund(request,'{}'::jsonb,'{}'::jsonb); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'unverified refund was finalized'; end if;
 if has_function_privilege('anon','public.edu_create_record(uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.edu_claim_refund(uuid,uuid,uuid,integer,text)','EXECUTE') then raise exception 'privileged RPC exposed'; end if;
end $$;
select 'PASS: create deduplication, request mismatch, admin checks, archive, enrollment grant, net revenue, refund locking and RPC ACL; all fixtures rolled back' as result;
rollback;
