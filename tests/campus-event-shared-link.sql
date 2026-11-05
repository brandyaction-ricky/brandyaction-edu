begin;
do $$
declare admin uuid:='00000000-0000-4000-8000-000000000001'; member uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 course uuid:=gen_random_uuid(); cohort uuid:=gen_random_uuid(); live uuid:=gen_random_uuid(); zone uuid; bonus uuid; code text;
 q jsonb; o jsonb; before_count integer;
begin
 update public.profiles set role='admin',status='active' where id=admin;
 insert into auth.users(id,email,raw_user_meta_data) values(member,'event-member@example.invalid','{}'),(other,'event-other@example.invalid','{}');
 insert into public.courses(id,course_code,title,slug,category,status,list_price) values(course,'EVENT-QA','Event QA','event-qa','paid_class','published',1000000);
 insert into public.cohorts(id,cohort_code,course_id,name,status,price,recruitment_start_at,recruitment_end_at) values(cohort,'EVENT-QA',course,'Event QA','recruiting',1000000,now()-interval '1 day',now()+interval '7 days');
 insert into public.coupons(id,name,code,discount_type,discount_value,product_scope,per_user_limit,ends_at) values(live,'라이브 30만원','1108','fixed',300000,'all',1,now()+interval '7 days');
 zone:=public.edu_event_save(admin,jsonb_build_object('slug','event-qa','title','당첨자','description','QA','cohortId',cohort,'claimEndsAt',now()+interval '1 day','couponEndsAt',now()+interval '3 days','liveEndsAt',now()+interval '2 days','enabled',true,'sharedLink',true,'resources','[]'::jsonb),null);
 if (select ends_at from public.coupons where id=live)<>now()+interval '2 days' then raise exception 'QA_LIVE_DEADLINE';end if;
 select bonus_coupon_id into bonus from public.edu_event_zones where id=zone;
 select c.code into code from public.coupons c where id=bonus;

 if not (select shared_link from public.edu_event_zones where id=zone) then raise exception 'QA_SHARED_SAVE';end if;
 perform public.edu_event_claim(member,'event-qa','');
 perform public.edu_event_claim(other,'event-qa','');
 perform public.edu_event_claim(member,'event-qa','');
 if (select count(*) from public.edu_event_awards where zone_id=zone)<>2 or (select count(*) from public.customer_coupons where coupon_id=bonus)<>2 then raise exception 'QA_SHARED_ONCE_PER_ACCOUNT';end if;
 if exists(select 1 from public.edu_event_invites where zone_id=zone) then raise exception 'QA_SHARED_NO_INVITE';end if;
 perform public.edu_event_claim(member,'event-qa','',true);
 q:=public.edu_event_quote(member,cohort,code||'+1108');
 if (q->>'couponDiscount')::integer<>400000 then raise exception 'QA_SHARED_STACK';end if;
 -- An old client save omitting the new field must preserve shared mode.
 perform public.edu_event_save(admin,jsonb_build_object('slug','event-qa','title','Shared','description','','cohortId',cohort,'claimEndsAt',now()+interval '1 day','couponEndsAt',now()+interval '3 days','liveEndsAt',now()+interval '2 days','enabled',true,'resources','[]'::jsonb),(select revision from public.edu_event_zones where id=zone));
 if not (select shared_link from public.edu_event_zones where id=zone) then raise exception 'QA_SHARED_OLD_SAVE';end if;
 -- New accounts cannot claim after the deadline; existing accounts retain access.
 update public.edu_event_zones set claim_ends_at=now()-interval '1 second' where id=zone;
 perform public.edu_event_claim(member,'event-qa','');
 begin perform public.edu_event_claim(admin,'event-qa','');raise exception 'QA_SHARED_EXPIRED';exception when raise_exception then if sqlerrm<>'EVENT_CLAIM_ENDED' then raise;end if;end;
 update public.edu_event_zones set enabled=false where id=zone;
 begin perform public.edu_event_claim(member,'event-qa','');raise exception 'QA_SHARED_CLOSED';exception when raise_exception then if sqlerrm<>'EVENT_UNAVAILABLE' then raise;end if;end;
 update public.edu_event_zones set enabled=true,claim_ends_at=now()+interval '1 day' where id=zone;
 update public.customer_coupons set status='revoked' where user_id=member and coupon_id=bonus;
 begin perform public.edu_event_claim(member,'event-qa','');raise exception 'QA_SHARED_REVOKED';exception when raise_exception then if sqlerrm<>'COUPON_REVOKED' then raise;end if;end;
 update public.profiles set status='suspended' where id=other;
 begin perform public.edu_event_claim(other,'event-qa','');raise exception 'QA_SHARED_INACTIVE';exception when raise_exception then if sqlerrm<>'AUTH_REQUIRED' then raise;end if;end;
 if has_function_privilege('authenticated','public.edu_event_claim(uuid,text,text,boolean)','execute') then raise exception 'QA_SHARED_RLS';end if;
end; $$;
rollback;
