begin;

create table if not exists public.customer_journey_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null check (char_length(session_id) between 8 and 80),
  user_id uuid null references public.profiles(id) on delete set null,
  event_name text not null check (event_name in ('page_view','click','article_view','article_click','class_view','checkout_view','application_click','order_complete')),
  path text not null,
  target_path text null,
  element_label text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists customer_journey_events_occurred_idx on public.customer_journey_events (occurred_at desc);
create index if not exists customer_journey_events_session_idx on public.customer_journey_events (session_id, occurred_at);
create index if not exists customer_journey_events_name_idx on public.customer_journey_events (event_name, occurred_at desc);
alter table public.customer_journey_events enable row level security;

-- DEV 화면 검증용 연결 여정. 개발 관리자 계정이 없는 환경에서는 생성하지 않는다.
do $$
declare
  v_admin uuid;
begin
  select id into v_admin from public.profiles where email='dev-admin@brandyaction.local' limit 1;
  if v_admin is null then return; end if;
  if exists(select 1 from public.customer_journey_events where session_id='dev-journey-article-01') then return; end if;

  insert into public.customer_journey_events(session_id,event_name,path,target_path,element_label,metadata,occurred_at) values
  ('dev-journey-article-01','page_view','/','',null,'{"source":"instagram","medium":"social","campaign":"august-live"}',now()-interval '5 days 2 hours'),
  ('dev-journey-article-01','article_click','/','/articles/why-i-cannot-find-my-work','이 고민부터 읽기','{}',now()-interval '5 days 110 minutes'),
  ('dev-journey-article-01','article_view','/articles/why-i-cannot-find-my-work',null,null,'{}',now()-interval '5 days 108 minutes'),
  ('dev-journey-article-01','article_view','/articles/should-i-change-jobs',null,null,'{}',now()-interval '5 days 80 minutes'),
  ('dev-journey-article-01','class_view','/classes/brandyaction-practical',null,null,'{}',now()-interval '5 days 35 minutes'),
  ('dev-journey-article-01','application_click','/classes/brandyaction-practical','/checkout?course=brandyaction-practical','클래스 신청하기','{}',now()-interval '5 days 30 minutes'),
  ('dev-journey-direct-01','page_view','/classes/brandyaction-practical',null,null,'{"source":"naver","medium":"cpc","campaign":"brand-search"}',now()-interval '4 days 3 hours'),
  ('dev-journey-direct-01','application_click','/classes/brandyaction-practical','/checkout?course=brandyaction-practical','클래스 신청하기','{}',now()-interval '4 days 175 minutes'),
  ('dev-journey-blog-01','page_view','/articles',null,null,'{"source":"google","medium":"organic"}',now()-interval '3 days 4 hours'),
  ('dev-journey-blog-01','article_view','/articles/why-i-cannot-find-my-work',null,null,'{}',now()-interval '3 days 230 minutes'),
  ('dev-journey-blog-01','article_view','/articles/work-values-checklist',null,null,'{}',now()-interval '3 days 205 minutes'),
  ('dev-journey-blog-01','article_view','/articles/stay-or-leave',null,null,'{}',now()-interval '3 days 170 minutes'),
  ('dev-journey-blog-01','class_view','/classes/content-conversion-lab',null,null,'{}',now()-interval '3 days 120 minutes'),
  ('dev-journey-blog-01','application_click','/classes/content-conversion-lab','/checkout?course=content-conversion-lab','4기 신청하기','{}',now()-interval '3 days 115 minutes'),
  ('dev-journey-crm-01','page_view','/','',null,'{"source":"crm","medium":"message","campaign":"free-class-followup"}',now()-interval '2 days 5 hours'),
  ('dev-journey-crm-01','article_view','/articles/stay-or-leave',null,null,'{}',now()-interval '2 days 290 minutes'),
  ('dev-journey-crm-01','class_view','/classes/brandyaction-practical',null,null,'{}',now()-interval '2 days 260 minutes'),
  ('dev-journey-crm-01','application_click','/classes/brandyaction-practical','/checkout?course=brandyaction-practical','다음 기수 예약하기','{}',now()-interval '2 days 250 minutes'),
  ('dev-journey-direct-02','page_view','/','',null,'{"source":"direct","medium":"none"}',now()-interval '1 day 2 hours'),
  ('dev-journey-direct-02','article_view','/articles/why-i-cannot-find-my-work',null,null,'{}',now()-interval '1 day 110 minutes'),
  ('dev-journey-direct-02','article_view','/articles/work-values-checklist',null,null,'{}',now()-interval '1 day 80 minutes'),
  ('dev-journey-social-02','page_view','/','',null,'{"source":"instagram","medium":"social","campaign":"review-reel"}',now()-interval '12 hours'),
  ('dev-journey-social-02','class_view','/classes/content-conversion-lab',null,null,'{}',now()-interval '11 hours 50 minutes'),
  ('dev-journey-social-02','application_click','/classes/content-conversion-lab','/checkout?course=content-conversion-lab','클래스 신청하기','{}',now()-interval '11 hours 45 minutes');
end $$;

commit;
