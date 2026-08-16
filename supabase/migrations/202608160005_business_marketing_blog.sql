begin;

alter table public.site_banners add column if not exists link_label text;

-- DEV demo content: reposition the article hub for business owners using marketing and AI to grow revenue.
update public.article_categories set
  name = case id
    when '90000000-0000-0000-0000-000000000001' then '매출 진단'
    when '90000000-0000-0000-0000-000000000002' then '콘텐츠 마케팅'
    when '90000000-0000-0000-0000-000000000003' then 'AI 실무'
    when '90000000-0000-0000-0000-000000000004' then '광고·퍼널'
    when '90000000-0000-0000-0000-000000000005' then 'CRM·재구매'
  end,
  slug = case id
    when '90000000-0000-0000-0000-000000000001' then 'revenue-diagnosis'
    when '90000000-0000-0000-0000-000000000002' then 'content-marketing'
    when '90000000-0000-0000-0000-000000000003' then 'ai-practice'
    when '90000000-0000-0000-0000-000000000004' then 'ads-funnel'
    when '90000000-0000-0000-0000-000000000005' then 'crm-retention'
  end,
  description = case id
    when '90000000-0000-0000-0000-000000000001' then '유입부터 구매까지 매출이 막히는 지점을 찾는 글'
    when '90000000-0000-0000-0000-000000000002' then '콘텐츠를 조회가 아닌 문의와 구매로 연결하는 글'
    when '90000000-0000-0000-0000-000000000003' then '사업자가 AI로 마케팅 시간과 비용을 줄이는 실무 글'
    when '90000000-0000-0000-0000-000000000004' then '광고와 랜딩페이지의 전환 구조를 개선하는 글'
    when '90000000-0000-0000-0000-000000000005' then '고객 데이터로 재구매와 관계를 만드는 글'
  end
where id in (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000003',
  '90000000-0000-0000-0000-000000000004',
  '90000000-0000-0000-0000-000000000005'
);

update public.articles set
  category_id = '90000000-0000-0000-0000-000000000001',
  title = '광고비를 늘리기 전에 확인해야 할 매출 전환 구조 5가지',
  summary = '유입은 있는데 구매가 없다면 광고보다 먼저 랜딩페이지, 제안, 결제 단계의 이탈 지점을 확인해야 합니다.',
  content_blocks = '[{"id":"p1","type":"paragraph","text":"매출이 기대만큼 나오지 않을 때 가장 먼저 광고 예산을 늘리기 쉽습니다. 하지만 방문 이후의 전환 구조가 막혀 있다면 더 많은 유입은 더 큰 손실이 됩니다."},{"id":"h1","type":"heading","text":"광고비보다 먼저 볼 다섯 지표"},{"id":"p2","type":"list","text":"광고 클릭률과 방문 품질\n핵심 제안 확인률\n클래스 상세 CTA 클릭률\n결제 시작 대비 완료율\n첫 구매 이후 재구매율"},{"id":"p3","type":"paragraph","text":"각 단계의 수치를 나누어 보면 지금 필요한 일이 소재 교체인지, 랜딩페이지 개선인지, 결제 경험 수정인지 구분할 수 있습니다."}]'::jsonb,
  seo_title = '광고비보다 먼저 확인할 매출 전환 구조 5가지',
  seo_description = '사업자가 광고 예산을 늘리기 전에 확인해야 할 유입, 랜딩페이지, 결제 전환 지표를 설명합니다.'
where id = '91000000-0000-0000-0000-000000000001';

update public.articles set
  category_id = '90000000-0000-0000-0000-000000000002',
  title = '조회수는 나오는데 매출이 안 나는 콘텐츠의 공통점',
  summary = '좋은 정보만 전달하고 고객의 문제, 선택 기준, 다음 행동을 연결하지 않으면 콘텐츠는 구매로 이어지지 않습니다.',
  content_blocks = '[{"id":"p1","type":"paragraph","text":"조회수와 저장 수는 콘텐츠 반응을 보여주지만 매출을 보장하지는 않습니다. 고객이 자신의 문제를 인식하고 다음 행동을 선택할 구조가 있어야 합니다."},{"id":"h1","type":"heading","text":"콘텐츠를 구매로 잇는 세 가지 질문"},{"id":"p2","type":"list","text":"누구의 어떤 문제를 다루는가\n왜 지금 해결해야 하는가\n읽은 뒤 무엇을 해야 하는가"},{"id":"p3","type":"paragraph","text":"모든 콘텐츠에 판매 문구를 넣는 것이 아니라 문제 인식에서 사례, 해결 기준, 적합한 클래스까지 자연스러운 경로를 설계해야 합니다."}]'::jsonb,
  seo_title = '조회수는 나오는데 매출이 안 나는 콘텐츠의 공통점',
  seo_description = '콘텐츠 조회를 문의와 구매로 연결하기 위해 필요한 고객 문제, 선택 기준, CTA 구조를 설명합니다.'
where id = '91000000-0000-0000-0000-000000000002';

update public.articles set
  category_id = '90000000-0000-0000-0000-000000000003',
  title = '사업자가 AI로 가장 먼저 줄여야 할 마케팅 업무 7가지',
  summary = '반복 조사, 초안, 분류, 요약은 AI에 맡기고 고객 이해와 최종 의사결정에 사업자의 시간을 집중하세요.',
  content_blocks = '[{"id":"p1","type":"paragraph","text":"AI는 사업 전략을 대신 결정하는 도구보다 반복 업무를 줄이고 더 많은 실험을 가능하게 하는 실행 도구로 사용할 때 효과가 큽니다."},{"id":"h1","type":"heading","text":"AI에 먼저 맡길 반복 업무"},{"id":"p2","type":"list","text":"고객 후기와 상담 내용 분류\n경쟁사 메시지 조사 요약\n콘텐츠 주제와 초안 생성\n광고 소재 변형 제작\nCRM 메시지 버전 생성\n회의와 인터뷰 요약\n주간 마케팅 리포트 정리"},{"id":"p3","type":"paragraph","text":"고객 언어와 브랜드 기준을 먼저 제공하고, 최종 제안과 우선순위는 사업자가 검수해야 합니다."}]'::jsonb,
  seo_title = '사업자가 AI로 줄여야 할 마케팅 업무 7가지',
  seo_description = '고객 분석, 콘텐츠, 광고, CRM 등 사업자가 AI로 자동화할 수 있는 마케팅 반복 업무를 정리합니다.'
where id = '91000000-0000-0000-0000-000000000003';

update public.articles set
  category_id = '90000000-0000-0000-0000-000000000004',
  title = 'UTM으로 어떤 콘텐츠가 실제 매출을 만들었는지 확인하는 법',
  summary = '채널별 링크에 UTM을 붙이고 방문, 클래스 조회, 결제 시작, 구매 완료를 연결하면 매출 기여 콘텐츠를 구분할 수 있습니다.',
  content_blocks = '[{"id":"p1","type":"paragraph","text":"좋아요나 클릭만으로는 어떤 마케팅이 매출을 만들었는지 알기 어렵습니다. 유입 링크의 UTM과 사이트 안의 핵심 행동, 주문 데이터를 같은 방문 흐름으로 연결해야 합니다."},{"id":"h1","type":"heading","text":"최소한 기록할 전환 단계"},{"id":"p2","type":"list","text":"UTM 링크 방문\n블로그와 클래스 상세 조회\n클래스 신청 CTA 클릭\n결제 시작\n결제 완료"},{"id":"p3","type":"paragraph","text":"직접 신청과 블로그를 여러 편 읽은 뒤 신청한 흐름을 분리하면 콘텐츠의 보조 전환 가치도 확인할 수 있습니다."}]'::jsonb,
  seo_title = 'UTM으로 콘텐츠 매출 기여도 확인하는 법',
  seo_description = 'UTM 유입부터 콘텐츠 조회, 결제 시작, 구매 완료까지 연결해 마케팅 매출 기여도를 측정하는 방법입니다.'
where id = '91000000-0000-0000-0000-000000000004';

update public.articles set
  category_id = '90000000-0000-0000-0000-000000000005',
  title = '신규 고객보다 재구매가 먼저인 사업의 CRM 설계법',
  summary = '고객 태그를 구매 상품, 행동, 관심 주제로 나누고 필요한 시점에 다음 제안을 보내는 CRM 기본 구조입니다.',
  content_blocks = '[{"id":"p1","type":"paragraph","text":"계속 신규 고객만 찾으면 광고비가 오를수록 수익성이 흔들립니다. 이미 구매한 고객이 다음 문제를 해결할 수 있도록 행동과 구매 이력을 기준으로 관계를 설계해야 합니다."},{"id":"h1","type":"heading","text":"CRM 세그먼트의 기본"},{"id":"p2","type":"list","text":"구매한 클래스와 기수\n수강 진도와 최근 활동\n읽은 콘텐츠와 관심 주제\n마케팅 수신 동의\n다음 추천 클래스와 발송 결과"},{"id":"p3","type":"paragraph","text":"태그는 고객을 평가하는 이름이 아니라 다음 메시지와 제안을 결정할 운영 기준이어야 합니다."}]'::jsonb,
  seo_title = '재구매를 만드는 사업자 CRM 설계법',
  seo_description = '구매, 활동, 관심 주제 태그로 고객을 분류하고 재구매 메시지를 설계하는 CRM 기본 구조입니다.'
where id = '91000000-0000-0000-0000-000000000005';

update public.site_settings
set value = jsonb_build_object(
  'eyebrow', 'FREE CLASS · 사업자 무료 3강',
  'title', '사업자를 위한 마케팅·AI 매출 진단',
  'description', '광고비를 더 쓰기 전에 고객 유입, 콘텐츠, 전환, 재구매 중 어디에서 매출이 막히는지 먼저 확인합니다.',
  'signupCopy', '무료 회원가입을 완료하면 사업자용 3강 전체를 바로 볼 수 있습니다. 별도 결제는 필요 없습니다.',
  'lessons', jsonb_build_array(
    jsonb_build_object('id', 'lesson-1', 'title', '매출을 막는 마케팅 병목 찾기', 'videoUrl', ''),
    jsonb_build_object('id', 'lesson-2', 'title', 'AI로 줄일 일과 사람이 결정할 일', 'videoUrl', ''),
    jsonb_build_object('id', 'lesson-3', 'title', '7일 안에 실행할 매출 실험 설계', 'videoUrl', '')
  )
)
where key = 'article_free_course';

commit;
