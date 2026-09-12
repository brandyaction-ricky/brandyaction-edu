begin;
-- Server-generated publish timestamps do not change the user's create intent.
create or replace function public.edu_create_record(p_actor uuid,p_request uuid,p_table text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.edu_mutation_receipts%rowtype; cols text; v_result jsonb; fingerprint text;
begin
  if p_request is null or jsonb_typeof(p_values)<>'object' then raise exception '잘못된 등록 요청입니다.'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception '로그인이 필요합니다.'; end if;
  if p_table='edu_questions' then
    if p_values->>'user_id' is distinct from p_actor::text or (p_values - array['user_id','title','content','course_id'])<>'{}'::jsonb then raise exception '허용되지 않은 질문입니다.'; end if;
  elsif not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.';
  end if;
  if not (p_table=any(array['courses','cohorts','curriculum_weeks','curriculum_lessons','lesson_contents','curriculum_missions','crm_tags','coupons','site_banners','articles','review_videos','edu_questions'])) then raise exception '등록할 수 없는 항목입니다.'; end if;
  fingerprint := md5(p_table||(p_values-'published_at')::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,p_table,fingerprint) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.fingerprint<>fingerprint or receipt.target_table<>p_table then raise exception '같은 요청 ID로 다른 내용을 저장할 수 없습니다.'; end if;
  if receipt.result is not null then return receipt.result; end if;
  select string_agg(format('%I',k),',' order by k) into cols from jsonb_object_keys(p_values) as k;
  if cols is null then raise exception '입력값이 없습니다.'; end if;
  execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',p_table,cols) into v_result using p_values;
  update public.edu_mutation_receipts set result=v_result where actor_id=p_actor and request_id=p_request;
  return v_result;
end; $$;


-- Legacy private paths stay in storage but are excluded from operator reports.
create or replace function public.edu_analytics_report(p_from timestamptz,p_to timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with events as (
   select * from public.customer_journey_events
   where occurred_at>=p_from and occurred_at<p_to
     and path ~ '^/(|classes(/[a-zA-Z0-9_-]+)?|articles(/[a-zA-Z0-9_-]+)?|stories|checkout|apply)$'
 ),
 paths as (select path,count(*) filter(where event_name in ('page_view','class_view','article_view','checkout_view')) as views,count(distinct session_id) as visitors,count(*) filter(where event_name in ('application_click','article_click','click')) as clicks from events group by path),
 payments as (select * from public.payments where approved_at>=p_from and approved_at<p_to),
 stages as (select event_name,count(distinct session_id) as sessions from events group by event_name)
 select jsonb_build_object('visitors',(select count(distinct session_id) from events),'events',(select count(*) from events),
 'stages',coalesce((select jsonb_object_agg(event_name,sessions) from stages),'{}'::jsonb),
 'paths',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from paths order by views desc limit 100) p),'[]'::jsonb),
 'paidOrders',(select count(*) from payments),'revenue',coalesce((select sum(approved_amount-cancelled_amount) from payments),0));
$$;
commit;
