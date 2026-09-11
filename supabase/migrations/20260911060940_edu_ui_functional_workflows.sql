-- UI workflow transactions. Only authenticated application server calls these.
create or replace function public.edu_save_session(p_actor uuid,p_id uuid,p_values jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid; cohort uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
 cohort:=(p_values->>'cohort_id')::uuid;
 perform 1 from public.cohorts where id=cohort for update;
 if not found then raise exception '기수를 찾을 수 없습니다.'; end if;
 if p_id is not null and not exists(select 1 from public.cohort_sessions where id=p_id and cohort_id=cohort) then raise exception '다른 기수의 회차는 수정할 수 없습니다.'; end if;
 insert into public.cohort_sessions(id,cohort_id,session_number,title,description,scheduled_at,is_public)
 values(coalesce(p_id,gen_random_uuid()),cohort,(p_values->>'session_number')::integer,p_values->>'title',p_values->>'description',(p_values->>'scheduled_at')::timestamptz,(p_values->>'is_public')::boolean)
 on conflict(id) do update set session_number=excluded.session_number,title=excluded.title,description=excluded.description,scheduled_at=excluded.scheduled_at,is_public=excluded.is_public returning id into sid;
 insert into public.cohort_session_contents(session_id,live_url,replay_url)
 values(sid,nullif(p_values->>'live_url',''),nullif(p_values->>'replay_url',''))
 on conflict(session_id) do update set live_url=excluded.live_url,replay_url=excluded.replay_url;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(p_actor,'session.saved','cohort_session',sid);
 return sid;
end; $$;

create or replace function public.edu_clone_cohort(p_actor uuid,p_source uuid,p_name text,p_code text,p_shift integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare src public.cohorts; cid uuid; delta interval;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
 if length(trim(p_name)) not between 1 and 100 or length(trim(p_code)) not between 1 and 80 or p_shift not between -3650 and 3650 then raise exception '복제할 기수 정보를 확인해 주세요.'; end if;
 select * into src from public.cohorts where id=p_source for update;
 if not found then raise exception '기수를 찾을 수 없습니다.'; end if;
 delta:=make_interval(days=>p_shift);
 insert into public.cohorts(course_id,cohort_code,name,note,price,capacity,status,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at)
 values(src.course_id,trim(p_code),trim(p_name),src.note,src.price,src.capacity,'upcoming',src.recruitment_start_at+delta,src.recruitment_end_at+delta,src.operation_start_at+delta,src.operation_end_at+delta) returning id into cid;
 insert into public.cohort_sessions(cohort_id,session_number,title,description,expected_output,scheduled_at,is_public)
 select cid,session_number,title,description,expected_output,scheduled_at+delta,false from public.cohort_sessions where cohort_id=p_source;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data) values(p_actor,'cohort.cloned','cohort',cid,jsonb_build_object('source',p_source,'shiftDays',p_shift));
 return cid;
end; $$;

create or replace function public.edu_save_quiz(p_actor uuid,p_mission uuid,p_revision uuid,p_quiz jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare current_revision uuid; course uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
 select w.course_id into course from public.curriculum_missions m join public.curriculum_lessons l on l.id=m.lesson_id join public.curriculum_weeks w on w.id=l.week_id where m.id=p_mission;
 if course is null then raise exception '미션을 찾을 수 없습니다.'; end if;
 perform 1 from public.courses where id=course for update;
 select revision into current_revision from public.mission_quizzes where mission_id=p_mission;
 if current_revision is distinct from p_revision then raise exception '퀴즈가 변경되었습니다. 새로고침 후 다시 저장해 주세요.'; end if;
 if p_quiz is null then
  if exists(select 1 from public.curriculum_missions where id=p_mission and submission_type='quiz') then raise exception '퀴즈 전용 미션은 문항이 필요합니다.'; end if;
  delete from public.mission_quizzes where mission_id=p_mission;
 else
  insert into public.mission_quizzes(mission_id,questions,pass_percent) values(p_mission,p_quiz->'questions',(p_quiz->>'passPercent')::integer)
  on conflict(mission_id) do update set questions=excluded.questions,pass_percent=excluded.pass_percent,revision=case when mission_quizzes.questions=excluded.questions and mission_quizzes.pass_percent=excluded.pass_percent then mission_quizzes.revision else gen_random_uuid() end;
 end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(p_actor,'quiz.saved','mission',p_mission);
end; $$;

create or replace function public.review_mission_submissions(p_actor uuid,p_ids uuid[],p_decision text,p_feedback text)
returns integer language plpgsql security invoker set search_path='' as $$
declare s public.mission_submissions; n integer:=0;
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) then raise exception '운영자 권한이 필요합니다.'; end if;
 if cardinality(p_ids) not between 1 and 50 or p_decision not in ('approved','changes_requested','rejected') or length(coalesce(p_feedback,''))>2000 or (p_decision<>'approved' and length(btrim(coalesce(p_feedback,'')))=0) then raise exception '검토 대상과 피드백을 확인해 주세요.'; end if;
 for s in select * from public.mission_submissions where id=any(p_ids) order by id for update loop
  if s.status<>'submitted' then raise exception '이미 검토된 제출이 있습니다. 새로고침해 주세요.'; end if;
  update public.mission_submissions set status=p_decision,reviewed_at=now(),reviewed_by=p_actor,reviewer_feedback=nullif(trim(p_feedback),'') where id=s.id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor,'mission_submission.'||p_decision,'mission_submission',s.id,jsonb_build_object('status',s.status),jsonb_build_object('status',p_decision,'feedback',p_feedback));
  n:=n+1;
 end loop;
 if n<>cardinality(p_ids) then raise exception '일부 제출 내역이 없습니다.'; end if;
 return n;
end; $$;

create or replace function public.edu_assign_customers(p_actor uuid,p_members uuid[],p_kind text,p_target uuid,p_remove boolean default false)
returns integer language plpgsql security invoker set search_path='' as $$
declare coupon public.coupons; affected integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
 if cardinality(p_members) not between 1 and 50 or (select count(*) from public.profiles where id=any(p_members) and status='active')<>cardinality(p_members) then raise exception '활성 회원을 최대 50명까지 선택해 주세요.'; end if;
 if p_kind='tag' then
  if not exists(select 1 from public.crm_tags where id=p_target and tag_kind='manual') then raise exception '수동 태그를 선택해 주세요.'; end if;
  if p_remove then delete from public.crm_member_tags where tag_id=p_target and member_id=any(p_members) and assignment_source='manual';
  else insert into public.crm_member_tags(member_id,tag_id,assigned_by,assignment_source) select unnest(p_members),p_target,p_actor,'manual' on conflict(member_id,tag_id) do nothing; end if;
 elsif p_kind='coupon' and not p_remove then
  select * into coupon from public.coupons where id=p_target and is_active for update;
  if not found or (coupon.ends_at is not null and coupon.ends_at<=now()) then raise exception '사용 가능한 쿠폰을 선택해 주세요.'; end if;
  insert into public.customer_coupons(coupon_id,user_id,created_by,expires_at) select p_target,unnest(p_members),p_actor,coupon.ends_at on conflict(coupon_id,user_id) do nothing;
 else raise exception '작업 종류를 확인해 주세요.'; end if;
 get diagnostics affected=row_count;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data) values(p_actor,p_kind||case when p_remove then '.unassigned' else '.assigned' end,'customer',p_target,jsonb_build_object('members',p_members,'affected',affected));
 return affected;
end; $$;

create or replace function public.edu_analytics_report(p_from timestamptz,p_to timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with events as (select * from public.customer_journey_events where occurred_at>=p_from and occurred_at<p_to),
 paths as (select path,count(*) filter(where event_name in ('page_view','class_view','article_view','checkout_view')) as views,count(distinct session_id) as visitors,count(*) filter(where event_name in ('application_click','article_click','click')) as clicks from events group by path),
 orders as (select * from public.orders where created_at>=p_from and created_at<p_to),
 stages as (select event_name,count(distinct session_id) as sessions from events group by event_name)
 select jsonb_build_object('visitors',(select count(distinct session_id) from events),'events',(select count(*) from events),
 'stages',coalesce((select jsonb_object_agg(event_name,sessions) from stages),'{}'::jsonb),
 'paths',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from paths order by views desc limit 100) p),'[]'::jsonb),
 'paidOrders',(select count(*) from orders where status='paid'),'revenue',coalesce((select sum(total_amount) from orders where status='paid'),0));
$$;

create or replace function public.edu_record_event(p_session text,p_user uuid,p_event text,p_path text,p_target text,p_metadata jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.site_settings where key='edu_operations' and value->>'trackingEnabled'='true') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session,17));
 if (select count(*) from public.customer_journey_events where session_id=p_session and occurred_at>now()-interval '1 minute')>=30 then return false; end if;
 if exists(select 1 from public.customer_journey_events where session_id=p_session and event_name=p_event and path=p_path and occurred_at>now()-interval '2 seconds') then return false; end if;
 insert into public.customer_journey_events(session_id,user_id,event_name,path,target_path,metadata) values(p_session,p_user,p_event,p_path,p_target,p_metadata);
 return true;
end; $$;

revoke all on function public.edu_save_session(uuid,uuid,jsonb),public.edu_clone_cohort(uuid,uuid,text,text,integer),public.edu_save_quiz(uuid,uuid,uuid,jsonb),public.review_mission_submissions(uuid,uuid[],text,text),public.edu_assign_customers(uuid,uuid[],text,uuid,boolean),public.edu_analytics_report(timestamptz,timestamptz),public.edu_record_event(text,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_save_session(uuid,uuid,jsonb),public.edu_clone_cohort(uuid,uuid,text,text,integer),public.edu_save_quiz(uuid,uuid,uuid,jsonb),public.review_mission_submissions(uuid,uuid[],text,text),public.edu_assign_customers(uuid,uuid[],text,uuid,boolean),public.edu_analytics_report(timestamptz,timestamptz),public.edu_record_event(text,uuid,text,text,text,jsonb) to service_role;

-- A live URL belongs to one cohort, even when several cohorts share a course.
drop policy if exists enrolled_read_cohort_session_contents on public.cohort_session_contents;
create policy enrolled_read_cohort_session_contents on public.cohort_session_contents for select to authenticated using (
 exists(select 1 from public.cohort_sessions s join public.enrollments e on e.cohort_id=s.cohort_id join public.profiles p on p.id=e.user_id
 where s.id=cohort_session_contents.session_id and s.is_public and e.user_id=(select auth.uid()) and e.status='active' and p.status='active'
 and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
);

-- Tag changes and CRM queueing are triggered internally, never by a public RPC.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'crm_%' or p.proname in ('sync_coupon_redemption_status','sync_customer_coupon_wallet')) loop
  execute format('revoke execute on function %s from public, anon, authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
