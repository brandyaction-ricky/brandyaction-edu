begin;

alter table public.edu_questions add column if not exists is_archived boolean not null default false;

do $$ declare t text; begin
  foreach t in array array['courses','cohorts','curriculum_lessons','curriculum_weeks','curriculum_missions','coupons','reviews','site_banners','articles','review_videos','edu_questions'] loop
    execute format('alter table public.%I add column if not exists archived_at timestamptz',t);
  end loop;
end $$;

-- A create and its receipt commit together: a timeout/retry cannot insert twice.
create table if not exists public.edu_mutation_receipts (
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  target_table text not null,
  fingerprint text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
alter table public.edu_mutation_receipts enable row level security;
revoke all on public.edu_mutation_receipts from anon, authenticated;
grant all on public.edu_mutation_receipts to service_role;
create policy service_receipts on public.edu_mutation_receipts for all to service_role using (true) with check (true);

create or replace function public.edu_create_record(p_actor uuid,p_request uuid,p_table text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.edu_mutation_receipts%rowtype; cols text; result jsonb; fingerprint text;
begin
  if p_request is null or jsonb_typeof(p_values)<>'object' then raise exception '잘못된 등록 요청입니다.'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception '로그인이 필요합니다.'; end if;
  if p_table='edu_questions' then
    if p_values->>'user_id' is distinct from p_actor::text or (p_values - array['user_id','title','content','course_id'])<>'{}'::jsonb then raise exception '허용되지 않은 질문입니다.'; end if;
  elsif not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.';
  end if;
  if not (p_table=any(array['courses','cohorts','curriculum_weeks','curriculum_lessons','lesson_contents','curriculum_missions','crm_tags','coupons','site_banners','articles','review_videos','edu_questions'])) then raise exception '등록할 수 없는 항목입니다.'; end if;
  fingerprint := md5(p_table||p_values::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,p_table,fingerprint) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.fingerprint<>fingerprint or receipt.target_table<>p_table then raise exception '같은 요청 ID로 다른 내용을 저장할 수 없습니다.'; end if;
  if receipt.result is not null then return receipt.result; end if;
  select string_agg(format('%I',k),',' order by k) into cols from jsonb_object_keys(p_values) as k;
  if cols is null then raise exception '입력값이 없습니다.'; end if;
  execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',p_table,cols) into result using p_values;
  update public.edu_mutation_receipts set result=edu_create_record.result where actor_id=p_actor and request_id=p_request;
  return result;
end; $$;

create or replace function public.edu_archive_records(p_actor uuid,p_section text,p_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare target text; col text; value jsonb; affected integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
  if cardinality(p_ids) not between 1 and 50 then raise exception '최대 50개까지 선택해 주세요.'; end if;
  select x.t,x.c,x.v into target,col,value from (values
    ('products','courses','status','"archived"'::jsonb), ('cohorts','cohorts','status','"cancelled"'::jsonb),
    ('learning','curriculum_lessons','is_published','false'::jsonb),('weeks','curriculum_weeks','is_published','false'::jsonb),
    ('missions','curriculum_missions','is_published','false'::jsonb),('coupons','coupons','is_active','false'::jsonb),
    ('product-reviews','reviews','status','"hidden"'::jsonb),('banners','site_banners','is_active','false'::jsonb),
    ('articles','articles','status','"hidden"'::jsonb),('testimonials','review_videos','is_published','false'::jsonb),
    ('questions','edu_questions','is_archived','true'::jsonb)
  ) as x(s,t,c,v) where x.s=p_section;
  if target is null then raise exception '보관할 수 없는 항목입니다.'; end if;
  execute format('update public.%1$I set archived_at=now(), %2$I=(select %2$I from jsonb_populate_record(null::public.%1$I,$1)) where id=any($2)',target,col) using jsonb_build_object(col,value),p_ids;
  get diagnostics affected=row_count;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'edu.archive',target,null,jsonb_build_object('ids',p_ids,'count',affected,'change',jsonb_build_object(col,value)));
  return affected;
end; $$;

create or replace function public.edu_admin_summary()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'members',(select count(*) from public.profiles),
   'activeEnrollments',(select count(*) from public.enrollments where status='active' and revoked_at is null and access_starts_at<=now() and (access_ends_at is null or access_ends_at>now())),
   'pendingReviews',(select count(*) from public.mission_submissions where status='submitted'),
   'openQuestions',(select count(*) from public.edu_questions where status='open' and not is_archived),
   'approvedRevenue',coalesce((select sum(approved_amount) from public.payments),0),
   'refundedRevenue',coalesce((select sum(cancelled_amount) from public.payments),0),
   'netRevenue',coalesce((select sum(approved_amount-cancelled_amount) from public.payments),0)
 );
$$;

create or replace function public.edu_grant_enrollment(p_actor uuid,p_member uuid,p_cohort uuid,p_ends timestamptz,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare cohort public.cohorts%rowtype; previous public.enrollments%rowtype; result uuid;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
  if length(btrim(p_reason)) not between 2 and 500 or (p_ends is not null and p_ends<=now()) then raise exception '발급 사유와 미래 만료일을 확인해 주세요.'; end if;
  perform 1 from public.profiles where id=p_member and status='active' for update;
  if not found then raise exception '활성 회원을 선택해 주세요.'; end if;
  select * into cohort from public.cohorts where id=p_cohort for update;
  if not found or cohort.status='cancelled' then raise exception '유효한 기수를 선택해 주세요.'; end if;
  select * into previous from public.enrollments where user_id=p_member and cohort_id=p_cohort for update;
  if found then
    if previous.status='active' and previous.revoked_at is null and (previous.access_ends_at is null or previous.access_ends_at>now()) then return previous.id; end if;
    raise exception '기존 수강 이력이 있습니다. 기존 수강권을 확인해 주세요.';
  end if;
  if cohort.capacity is not null and (select count(*) from public.enrollments where cohort_id=p_cohort and status='active')>=cohort.capacity then raise exception '모집 정원이 마감되었습니다.'; end if;
  insert into public.enrollments(user_id,course_id,cohort_id,source,granted_by,access_ends_at)
    values(p_member,cohort.course_id,p_cohort,'admin_grant',p_actor,p_ends) returning id into result;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'enrollment.granted','enrollment',result::text,jsonb_build_object('member_id',p_member,'cohort_id',p_cohort,'reason',p_reason,'access_ends_at',p_ends));
  return result;
end; $$;

-- Preserve legacy email until the canonical setting has actually been set.
insert into public.site_settings(key,value,is_public)
select 'edu_operations',jsonb_build_object('supportEmail',value),false from public.site_settings where key='support_email' and jsonb_typeof(value)='string'
on conflict(key) do update set value=excluded.value||public.site_settings.value;

-- Normalize only URLs belonging to this DEV bucket; external images are retained.
update public.site_banners set image_path=replace(image_path,'https://vjmjhaidlqkmascdjocw.supabase.co/storage/v1/object/public/course-assets/','')
where image_path like 'https://vjmjhaidlqkmascdjocw.supabase.co/storage/v1/object/public/course-assets/%';

revoke all on function public.edu_create_record(uuid,uuid,text,jsonb), public.edu_archive_records(uuid,text,uuid[]), public.edu_admin_summary(), public.edu_grant_enrollment(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.edu_create_record(uuid,uuid,text,jsonb), public.edu_archive_records(uuid,text,uuid[]), public.edu_admin_summary(), public.edu_grant_enrollment(uuid,uuid,uuid,timestamptz,text) to service_role;
commit;
