begin;

-- DEV 전용: 전환 UI 검증 데이터. 개발 관리자 계정이 없는 환경에서는 어떤 데이터도 만들지 않는다.
do $$
declare
  v_admin uuid;
begin
  select id into v_admin from public.profiles where email = 'dev-admin@brandyaction.local' limit 1;
  if v_admin is null then
    raise notice 'DEV demo seed skipped: dev administrator not found';
    return;
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mina.dev@example.com',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name','김민아','phone','010-2101-1001','marketing_consent',true),now()-interval '45 days',now()),
    ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jiyun.dev@example.com',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name','박지윤','phone','010-2101-1002','marketing_consent',true),now()-interval '38 days',now()),
    ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','seojun.dev@example.com',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name','이서준','phone','010-2101-1003','marketing_consent',false),now()-interval '24 days',now()),
    ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hayeon.dev@example.com',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name','최하연','phone','010-2101-1004','marketing_consent',true),now()-interval '13 days',now()),
    ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','doyun.dev@example.com',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name','정도윤','phone','010-2101-1005','marketing_consent',true),now()-interval '5 days',now()),
    ('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sora.dev@example.com',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name','한소라','phone','010-2101-1006','marketing_consent',true),now()-interval '2 days',now())
  on conflict (id) do update set updated_at=excluded.updated_at;

  update public.profiles p set
    full_name=v.full_name, phone=v.phone, status='active', role='student', marketing_consent=v.marketing,
    marketing_consent_at=case when v.marketing then coalesce(p.marketing_consent_at,now()-interval '30 days') else null end
  from (values
    ('20000000-0000-0000-0000-000000000001'::uuid,'김민아','010-2101-1001',true),
    ('20000000-0000-0000-0000-000000000002'::uuid,'박지윤','010-2101-1002',true),
    ('20000000-0000-0000-0000-000000000003'::uuid,'이서준','010-2101-1003',false),
    ('20000000-0000-0000-0000-000000000004'::uuid,'최하연','010-2101-1004',true),
    ('20000000-0000-0000-0000-000000000005'::uuid,'정도윤','010-2101-1005',true),
    ('20000000-0000-0000-0000-000000000006'::uuid,'한소라','010-2101-1006',true)
  ) v(id,full_name,phone,marketing) where p.id=v.id;

  insert into public.courses (id,course_code,slug,title,summary,description,category,instructor_name,list_price,duration_label,schedule_label,status,display_order,published_at)
  values
    ('30000000-0000-0000-0000-000000000001','DEV-BA-01','brand-action-lab','브랜디액션 실전 클래스','내 업의 방향을 브랜드 언어와 실행 계획으로 완성하는 4주 라이브 클래스입니다.','진단에서 끝나지 않고 실제 브랜드 문장과 실행 결과물을 완성합니다.','브랜드·커리어','윤위클래스',490000,'4주 · VOD/자료/다시보기','매주 목요일 20:00', 'published',20,now()-interval '60 days'),
    ('30000000-0000-0000-0000-000000000002','DEV-CONTENT-01','content-conversion-lab','콘텐츠 전환 실험실','콘텐츠를 문의와 구매로 연결하는 메시지·퍼널·실험을 직접 설계합니다.','4주 동안 고객 언어를 수집하고 전환 콘텐츠를 실행합니다.','콘텐츠·마케팅','브랜디액션',390000,'4주 · VOD/워크북/LIVE','매주 화요일 19:30','published',19,now()-interval '45 days')
  on conflict(id) do update set title=excluded.title,summary=excluded.summary,status='published',display_order=excluded.display_order;

  insert into public.cohorts (id,course_id,cohort_code,name,note,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at,price,capacity,status)
  values
    ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','DEV-8','8기 · 9월 라이브','현재 모집중 DEV 시나리오',now()-interval '12 days',now()+interval '18 days',now()+interval '24 days',now()+interval '52 days',440000,20,'recruiting'),
    ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','DEV-4','4기 · 전환 집중반','현재 모집중 DEV 시나리오',now()-interval '8 days',now()+interval '12 days',now()+interval '18 days',now()+interval '46 days',350000,16,'recruiting'),
    ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','DEV-7','7기 · 실행반','학습활동 검증용',now()-interval '55 days',now()-interval '26 days',now()-interval '21 days',now()+interval '7 days',420000,18,'in_progress')
  on conflict(id) do update set recruitment_end_at=excluded.recruitment_end_at,operation_start_at=excluded.operation_start_at,operation_end_at=excluded.operation_end_at,status=excluded.status;

  insert into public.curriculum_weeks (id,course_id,week_number,title,goal,is_published,display_order)
  values
    ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'내 일의 반복 패턴 읽기','지금까지 비어 있던 자리를 구체화합니다.',true,1),
    ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',2,'브랜드 언어 만들기','내 기준을 고객이 이해하는 문장으로 바꿉니다.',true,2),
    ('50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002',1,'고객 언어 수집','구매 직전 고객의 질문을 찾습니다.',true,1)
  on conflict(id) do update set title=excluded.title,goal=excluded.goal,is_published=true;

  insert into public.curriculum_lessons (id,week_id,day_number,title,description,content_type,duration_label,is_published,display_order)
  values
    ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'왜 열심히 해도 방향이 흐려지는가','반복되는 선택의 구조를 확인합니다.','vod','22분',true,1),
    ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',2,'결핍·욕구 기록 워크북','내 사례를 적어 다음 질문을 만듭니다.','material','20분',true,2),
    ('51000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000002',1,'한 문장 브랜드 기준','브랜드가 지킬 선택 기준을 만듭니다.','vod','28분',true,1),
    ('51000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000003',1,'고객 질문 인터뷰','고객 질문을 콘텐츠 소재로 바꿉니다.','vod','24분',true,1)
  on conflict(id) do update set title=excluded.title,is_published=true;

  insert into public.cohort_sessions (id,cohort_id,session_number,title,description,expected_output,scheduled_at)
  values
    ('52000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',1,'방향 진단 라이브','현재 패턴을 함께 해석합니다.','방향 가설 1장',now()-interval '14 days'),
    ('52000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003',2,'브랜드 문장 피드백','작성한 문장을 함께 다듬습니다.','브랜드 핵심 문장',now()-interval '7 days'),
    ('52000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003',3,'실행 계획 라이브','다음 30일 실행을 확정합니다.','30일 액션 플랜',now()+interval '1 day')
  on conflict(id) do update set scheduled_at=excluded.scheduled_at,title=excluded.title;
  insert into public.cohort_session_contents(session_id,live_url,replay_url)
  values
    ('52000000-0000-0000-0000-000000000001','https://zoom.us/j/dev-live-1','https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ('52000000-0000-0000-0000-000000000002','https://zoom.us/j/dev-live-2','https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ('52000000-0000-0000-0000-000000000003','https://zoom.us/j/dev-live-3',null)
  on conflict(session_id) do update set live_url=excluded.live_url,replay_url=excluded.replay_url;

  insert into public.orders (id,order_number,user_id,status,subtotal,discount_amount,total_amount,customer_name,customer_email,customer_phone,terms_version,privacy_version,refund_policy_version,paid_at,cancelled_at,created_at)
  values
    ('60000000-0000-0000-0000-000000000001','DEV-ORDER-001','20000000-0000-0000-0000-000000000001','paid',490000,70000,420000,'김민아','mina.dev@example.com','010-2101-1001','2026-08','2026-08','2026-08',now()-interval '20 days',null,now()-interval '20 days'),
    ('60000000-0000-0000-0000-000000000002','DEV-ORDER-002','20000000-0000-0000-0000-000000000002','paid',490000,70000,420000,'박지윤','jiyun.dev@example.com','010-2101-1002','2026-08','2026-08','2026-08',now()-interval '16 days',null,now()-interval '16 days'),
    ('60000000-0000-0000-0000-000000000003','DEV-ORDER-003','20000000-0000-0000-0000-000000000004','paid',490000,50000,440000,'최하연','hayeon.dev@example.com','010-2101-1004','2026-08','2026-08','2026-08',now()-interval '6 days',null,now()-interval '6 days'),
    ('60000000-0000-0000-0000-000000000004','DEV-ORDER-004','20000000-0000-0000-0000-000000000005','paid',390000,40000,350000,'정도윤','doyun.dev@example.com','010-2101-1005','2026-08','2026-08','2026-08',now()-interval '3 days',null,now()-interval '3 days'),
    ('60000000-0000-0000-0000-000000000005','DEV-ORDER-005','20000000-0000-0000-0000-000000000006','pending',390000,40000,350000,'한소라','sora.dev@example.com','010-2101-1006','2026-08','2026-08','2026-08',null,null,now()-interval '1 day'),
    ('60000000-0000-0000-0000-000000000006','DEV-ORDER-006','20000000-0000-0000-0000-000000000003','partially_refunded',490000,70000,420000,'이서준','seojun.dev@example.com','010-2101-1003','2026-08','2026-08','2026-08',now()-interval '12 days',now()-interval '2 days',now()-interval '12 days')
  on conflict(id) do update set status=excluded.status,paid_at=excluded.paid_at,cancelled_at=excluded.cancelled_at;

  insert into public.order_items(id,order_id,course_id,cohort_id,item_name,unit_price)
  values
    ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','브랜디액션 실전 클래스 · 7기 실행반',420000),
    ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','브랜디액션 실전 클래스 · 7기 실행반',420000),
    ('61000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','브랜디액션 실전 클래스 · 8기',440000),
    ('61000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','콘텐츠 전환 실험실 · 4기',350000),
    ('61000000-0000-0000-0000-000000000005','60000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','콘텐츠 전환 실험실 · 4기',350000),
    ('61000000-0000-0000-0000-000000000006','60000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','브랜디액션 실전 클래스 · 7기 실행반',420000)
  on conflict(id) do nothing;

  insert into public.payments(id,order_id,provider,provider_payment_key,method,status,approved_amount,cancelled_amount,approved_at)
  values
    ('62000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','dev','DEV-PAY-001','카드','done',420000,0,now()-interval '20 days'),
    ('62000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','dev','DEV-PAY-002','계좌이체','done',420000,0,now()-interval '16 days'),
    ('62000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000003','dev','DEV-PAY-003','카드','done',440000,0,now()-interval '6 days'),
    ('62000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000004','dev','DEV-PAY-004','카드','done',350000,0,now()-interval '3 days'),
    ('62000000-0000-0000-0000-000000000006','60000000-0000-0000-0000-000000000006','dev','DEV-PAY-006','카드','partial_cancelled',420000,120000,now()-interval '12 days')
  on conflict(id) do update set status=excluded.status,cancelled_amount=excluded.cancelled_amount;

  insert into public.enrollments(id,user_id,course_id,cohort_id,order_item_id,status,source,access_starts_at,access_ends_at,created_at)
  values
    ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000001','active','purchase',now()-interval '20 days',now()+interval '100 days',now()-interval '20 days'),
    ('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000002','active','purchase',now()-interval '16 days',now()+interval '100 days',now()-interval '16 days'),
    ('70000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000006','active','purchase',now()-interval '12 days',now()+interval '100 days',now()-interval '12 days'),
    ('70000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000003','active','purchase',now()-interval '6 days',now()+interval '120 days',now()-interval '6 days'),
    ('70000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','61000000-0000-0000-0000-000000000004','active','purchase',now()-interval '3 days',now()+interval '120 days',now()-interval '3 days')
  on conflict(id) do update set status='active';

  insert into public.lesson_progress(id,enrollment_id,lesson_id,progress_percent,last_position_seconds,completed_at,updated_at)
  values
    ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001',100,1320,now()-interval '14 days',now()-interval '14 days'),
    ('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002',100,0,now()-interval '10 days',now()-interval '10 days'),
    ('71000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000003',65,1020,null,now()-interval '1 day'),
    ('71000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001',100,1320,now()-interval '12 days',now()-interval '12 days'),
    ('71000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002',40,0,null,now()-interval '8 days'),
    ('71000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001',15,210,null,now()-interval '11 days')
  on conflict(id) do update set progress_percent=excluded.progress_percent,updated_at=excluded.updated_at;

  insert into public.learning_usage_events(id,enrollment_id,item_type,item_id,first_used_at,last_used_at,use_count)
  values
    ('72000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','material_download','51000000-0000-0000-0000-000000000002',now()-interval '10 days',now()-interval '1 day',3),
    ('72000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','live_join','52000000-0000-0000-0000-000000000002',now()-interval '7 days',now()-interval '7 days',1),
    ('72000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000002','replay_view','52000000-0000-0000-0000-000000000001',now()-interval '9 days',now()-interval '2 days',2),
    ('72000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000002','live_join','52000000-0000-0000-0000-000000000002',now()-interval '7 days',now()-interval '7 days',1)
  on conflict(id) do update set last_used_at=excluded.last_used_at,use_count=excluded.use_count;

  insert into public.crm_tags(id,name,color,description,created_by)
  values
    ('80000000-0000-0000-0000-000000000001','무료 3강 관심','#A10D12','무료 강의를 본 잠재 고객',v_admin),
    ('80000000-0000-0000-0000-000000000002','모집 클래스 관심','#D97706','현재 모집 기수를 확인한 고객',v_admin),
    ('80000000-0000-0000-0000-000000000003','결제 고객','#26734D','결제를 완료한 수강 고객',v_admin),
    ('80000000-0000-0000-0000-000000000004','7일 미활동','#667085','최근 7일 학습 활동이 없는 수강생',v_admin)
  on conflict(id) do update set name=excluded.name,color=excluded.color,description=excluded.description;
  insert into public.crm_member_tags(member_id,tag_id,assigned_by)
  values
    ('20000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003',v_admin),
    ('20000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003',v_admin),
    ('20000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000004',v_admin),
    ('20000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000002',v_admin),
    ('20000000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000001',v_admin),
    ('20000000-0000-0000-0000-000000000006','80000000-0000-0000-0000-000000000001',v_admin)
  on conflict do nothing;

  insert into public.crm_templates(id,name,channel,purpose,content,is_active,created_by)
  values
    ('81000000-0000-0000-0000-000000000001','무료 3강 이후 방향 안내','lms','marketing','[브랜디액션] 무료 3강에서 찾은 질문을 실전 클래스로 이어보세요.',true,v_admin),
    ('81000000-0000-0000-0000-000000000002','모집 마감 D-7','alimtalk','marketing','관심 클래스 모집 마감이 7일 남았습니다. 일정과 커리큘럼을 확인하세요.',true,v_admin)
  on conflict(id) do update set content=excluded.content;
  insert into public.crm_campaigns(id,name,template_id,target_tag_id,status,sent_at,recipient_count,success_count,failure_count,created_by,created_at)
  values
    ('82000000-0000-0000-0000-000000000001','8월 무료 3강 후속 안내','81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','completed',now()-interval '9 days',4,4,0,v_admin,now()-interval '9 days'),
    ('82000000-0000-0000-0000-000000000002','모집 마감 D-7 안내','81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','completed',now()-interval '5 days',3,3,0,v_admin,now()-interval '5 days')
  on conflict(id) do update set sent_at=excluded.sent_at,success_count=excluded.success_count;
  insert into public.crm_message_logs(id,campaign_id,member_id,channel,recipient_masked,status,sent_at,created_at)
  values
    ('83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','lms','010-****-1004','success',now()-interval '9 days',now()-interval '9 days'),
    ('83000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','lms','010-****-1005','success',now()-interval '9 days',now()-interval '9 days'),
    ('83000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000004','alimtalk','010-****-1004','success',now()-interval '5 days',now()-interval '5 days'),
    ('83000000-0000-0000-0000-000000000004','82000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000005','alimtalk','010-****-1005','success',now()-interval '5 days',now()-interval '5 days')
  on conflict(id) do update set sent_at=excluded.sent_at;

  insert into public.article_categories(id,name,slug,description,display_order,is_active)
  values
    ('90000000-0000-0000-0000-000000000001','나를 이해하기','understand-me','욕구와 반복 패턴을 통해 나를 이해하는 글',0,true),
    ('90000000-0000-0000-0000-000000000002','일을 이해하기','understand-work','회사와 일의 구조를 해석하는 글',1,true),
    ('90000000-0000-0000-0000-000000000003','선택하기','make-a-choice','이직·잔류·전환의 기준을 세우는 글',2,true),
    ('90000000-0000-0000-0000-000000000004','잘 일하기','work-better','강점을 성과와 만족으로 연결하는 글',3,true),
    ('90000000-0000-0000-0000-000000000005','사례·리서치','cases-research','실제 변화 사례와 데이터를 읽는 글',4,true)
  on conflict(id) do update set name=excluded.name,description=excluded.description,is_active=true;

  update public.articles set is_featured=false where is_featured=true;
  insert into public.articles(id,category_id,slug,title,summary,content_blocks,status,is_featured,published_at,created_by,updated_by,created_at)
  values
    ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','why-i-cannot-find-my-work','하고 싶은 일이 아직 없는 게 아니라, 질문이 너무 컸던 건 아닐까','하고 싶은 일이 아직 없어요라는 고민을 작은 경험과 욕구의 언어로 바꾸는 방법입니다.',jsonb_build_array(jsonb_build_object('id','p1','type','paragraph','text','하고 싶은 일을 한 번에 찾으려 하면 답이 멀어집니다. 먼저 반복해서 마음이 움직였던 순간을 구체적으로 모아보세요.'),jsonb_build_object('id','h1','type','heading','text','답보다 먼저 모아야 할 장면'),jsonb_build_object('id','p2','type','paragraph','text','부러움, 답답함, 유난히 오래 붙잡은 일은 모두 방향의 단서가 됩니다.')), 'published',true,now()-interval '2 days',v_admin,v_admin,now()-interval '2 days'),
    ('91000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000002','is-this-company-right-for-me','지금 회사가 나와 맞는지 판단하는 세 가지 기준','지금 회사가 나와 맞는지 모르겠어요라는 질문을 역할·관계·성장으로 나눠 봅니다.',jsonb_build_array(jsonb_build_object('id','p1','type','paragraph','text','회사 전체가 맞지 않는다고 느껴질 때 역할, 관계, 성장 중 무엇이 막혀 있는지 분리해야 합니다.')), 'published',false,now()-interval '5 days',v_admin,v_admin,now()-interval '5 days'),
    ('91000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000003','stay-or-move','이직해야 할지 남아야 할지 결정하기 전에 확인할 것','이직해야 할지 남아야 할지 고민될 때 감정과 조건을 분리하는 선택표를 소개합니다.',jsonb_build_array(jsonb_build_object('id','p1','type','paragraph','text','떠나고 싶은 이유와 새로 얻고 싶은 조건을 같은 문장에 섞지 마세요. 두 목록을 분리하면 선택의 기준이 보입니다.')), 'published',false,now()-interval '8 days',v_admin,v_admin,now()-interval '8 days'),
    ('91000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000001','find-work-that-fits','나에게 맞는 일을 찾는 사람들의 공통된 출발점','나에게 맞는 일을 찾고 싶어요라는 바람을 일하는 방식과 해결하고 싶은 문제로 바꿉니다.',jsonb_build_array(jsonb_build_object('id','p1','type','paragraph','text','직무명보다 내가 오래 집중하는 방식과 해결하고 싶은 문제를 먼저 정의해야 합니다.')), 'published',false,now()-interval '11 days',v_admin,v_admin,now()-interval '11 days'),
    ('91000000-0000-0000-0000-000000000005','90000000-0000-0000-0000-000000000004','good-but-not-satisfied','일은 잘하는데 만족스럽지 않은 이유','일은 잘하는데 만족스럽지 않아요라는 신호가 성과와 욕구의 불일치에서 오는지 살펴봅니다.',jsonb_build_array(jsonb_build_object('id','p1','type','paragraph','text','잘한다는 평가와 내가 중요하게 여기는 가치는 다를 수 있습니다. 성과 뒤에 남는 감정을 기록해보세요.')), 'published',false,now()-interval '14 days',v_admin,v_admin,now()-interval '14 days')
  on conflict(id) do update set title=excluded.title,summary=excluded.summary,content_blocks=excluded.content_blocks,status='published',is_featured=excluded.is_featured,published_at=excluded.published_at;

  insert into public.reviews(id,user_id,course_id,cohort_id,order_id,author_name,rating,body,status,is_featured,display_order,published_at)
  values
    ('92000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','김민아',5,'막연했던 방향이 한 문장과 30일 실행 계획으로 바뀌었습니다.','published',true,1,now()-interval '3 days'),
    ('92000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002','박지윤',4.5,'강의를 듣는 데서 끝나지 않고 매주 결과물을 남길 수 있어 좋았습니다.','pending',false,2,null)
  on conflict(id) do update set status=excluded.status,body=excluded.body;

  insert into public.review_videos(id,title,reviewer_name,reviewer_role,description,video_url,is_published,display_order)
  values
    ('93000000-0000-0000-0000-000000000001','막연한 방향이 30일 실행 계획으로','김민아','브랜디액션 7기 수강생','혼자 고민할 때와 달리 매주 결과물을 남기면서 다음 행동이 분명해졌습니다.','https://www.youtube.com/watch?v=dQw4w9WgXcQ',true,1),
    ('93000000-0000-0000-0000-000000000002','잘하는 일을 브랜드 문장으로 바꾼 과정','박지윤','브랜디액션 7기 수강생','내가 잘하는 일을 고객이 이해하는 언어로 설명할 수 있게 되었습니다.','https://www.youtube.com/watch?v=dQw4w9WgXcQ',true,2),
    ('93000000-0000-0000-0000-000000000003','콘텐츠가 문의로 이어지기 시작했어요','정도윤','콘텐츠 전환 4기 수강생','고객 질문을 기준으로 콘텐츠를 바꾸고 실제 문의 흐름을 확인했습니다.','https://www.youtube.com/watch?v=dQw4w9WgXcQ',true,3),
    ('93000000-0000-0000-0000-000000000004','남을지 옮길지 선택 기준이 생겼습니다','최하연','브랜디액션 8기 수강생','감정과 조건을 분리해 보니 지금 해야 할 선택이 선명해졌습니다.','https://www.youtube.com/watch?v=dQw4w9WgXcQ',true,4)
  on conflict(id) do update set title=excluded.title,description=excluded.description,is_published=true,display_order=excluded.display_order;
end $$;

commit;
