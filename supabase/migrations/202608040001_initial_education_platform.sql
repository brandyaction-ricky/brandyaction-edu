begin;

create extension if not exists pgcrypto;

-- 회원
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  phone text,
  avatar_url text,
  role text not null default 'student' check (role in ('student', 'staff', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 클래스(상품)
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  slug text not null unique,
  title text not null,
  summary text,
  description text,
  category text,
  instructor_name text,
  list_price integer not null default 0 check (list_price >= 0),
  duration_label text,
  schedule_label text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  asset_type text not null check (asset_type in ('thumbnail', 'cover', 'detail')),
  storage_bucket text not null default 'course-assets',
  storage_path text not null,
  alt_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

-- 기수 및 라이브 회차. 커리큘럼의 콘텐츠 유형과는 별도다.
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  cohort_code text not null,
  name text not null,
  note text,
  recruitment_start_at timestamptz,
  recruitment_end_at timestamptz,
  operation_start_at timestamptz,
  operation_end_at timestamptz,
  price integer not null check (price >= 0),
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'upcoming' check (
    status in ('upcoming', 'recruiting', 'closed', 'in_progress', 'completed', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, cohort_code)
);

create table if not exists public.cohort_sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  session_number integer not null check (session_number > 0),
  title text not null,
  description text,
  expected_output text,
  scheduled_at timestamptz,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, session_number)
);

create table if not exists public.cohort_session_contents (
  session_id uuid primary key references public.cohort_sessions(id) on delete cascade,
  live_url text,
  replay_url text,
  resource_storage_path text,
  updated_at timestamptz not null default now()
);

-- 주차 → Day → VOD/자료 커리큘럼
create table if not exists public.curriculum_weeks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  title text not null,
  goal text,
  is_published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, week_number)
);

create table if not exists public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.curriculum_weeks(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  title text not null,
  description text,
  content_type text not null check (content_type in ('vod', 'material')),
  duration_label text,
  is_preview boolean not null default false,
  is_published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, day_number)
);

-- 실제 영상 링크와 자료 경로는 비구매자에게 노출되지 않도록 분리한다.
create table if not exists public.lesson_contents (
  lesson_id uuid primary key references public.curriculum_lessons(id) on delete cascade,
  vod_url text,
  resource_name text,
  resource_storage_path text,
  updated_at timestamptz not null default now(),
  check (
    (vod_url is not null and resource_storage_path is null)
    or (vod_url is null and resource_storage_path is not null)
  )
);

-- 주문·결제·환불
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'payment_failed', 'cancelled', 'partially_refunded', 'refunded')
  ),
  currency text not null default 'KRW' check (currency = 'KRW'),
  subtotal integer not null check (subtotal >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  total_amount integer not null check (total_amount >= 0),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  terms_version text not null,
  privacy_version text not null,
  refund_policy_version text not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_amount = subtotal - discount_amount)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  cohort_id uuid not null references public.cohorts(id),
  item_name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity = 1),
  created_at timestamptz not null default now(),
  unique (order_id, cohort_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null,
  provider_payment_key text unique,
  method text,
  status text not null default 'ready' check (
    status in ('ready', 'in_progress', 'done', 'cancelled', 'partial_cancelled', 'aborted', 'expired')
  ),
  approved_amount integer not null default 0 check (approved_amount >= 0),
  cancelled_amount integer not null default 0 check (cancelled_amount >= 0),
  receipt_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cancelled_amount <= approved_amount)
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  provider_refund_key text unique,
  amount integer not null check (amount > 0),
  reason text,
  status text not null default 'requested' check (status in ('requested', 'done', 'failed')),
  provider_payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received' check (
    processing_status in ('received', 'processed', 'ignored', 'failed')
  ),
  payload jsonb not null,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

-- 결제 완료 후 서버가 발급하는 수강권
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  course_id uuid not null references public.courses(id),
  cohort_id uuid not null references public.cohorts(id),
  order_item_id uuid not null unique references public.order_items(id),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'refunded')),
  access_starts_at timestamptz not null default now(),
  access_ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cohort_id)
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);

-- 리뷰·메인 운영 콘텐츠
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  course_id uuid not null references public.courses(id),
  cohort_id uuid references public.cohorts(id),
  order_id uuid references public.orders(id),
  author_name text not null,
  rating numeric(2, 1) not null check (rating between 1 and 5),
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  is_featured boolean not null default false,
  display_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  eyebrow text,
  title text not null,
  description text,
  link_url text,
  image_path text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- 조회 성능용 인덱스
create index if not exists cohorts_course_status_idx on public.cohorts(course_id, status);
create index if not exists cohort_sessions_cohort_idx on public.cohort_sessions(cohort_id, session_number);
create index if not exists curriculum_weeks_course_idx on public.curriculum_weeks(course_id, week_number);
create index if not exists curriculum_lessons_week_idx on public.curriculum_lessons(week_id, display_order);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists orders_search_idx on public.orders(order_number, customer_email, customer_phone);
create index if not exists payments_order_idx on public.payments(order_id);
create index if not exists refunds_payment_idx on public.refunds(payment_id);
create index if not exists enrollments_user_status_idx on public.enrollments(user_id, status);
create index if not exists lesson_progress_enrollment_idx on public.lesson_progress(enrollment_id);
create index if not exists reviews_course_status_idx on public.reviews(course_id, status, is_featured);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

-- 공통 함수
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('staff', 'admin')
      and status = 'active'
  );
$$;

create or replace function public.has_course_access(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_course_id is not null and (
    public.is_admin()
    or exists (
      select 1
      from public.enrollments
      where user_id = (select auth.uid())
        and course_id = target_course_id
        and status = 'active'
        and access_starts_at <= now()
        and (access_ends_at is null or access_ends_at > now())
    )
  );
$$;

create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- 인증 사용자 생성 시 프로필 자동 생성
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at 자동 갱신
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
drop trigger if exists courses_updated_at on public.courses;
create trigger courses_updated_at before update on public.courses
  for each row execute procedure public.set_updated_at();
drop trigger if exists cohorts_updated_at on public.cohorts;
create trigger cohorts_updated_at before update on public.cohorts
  for each row execute procedure public.set_updated_at();
drop trigger if exists cohort_sessions_updated_at on public.cohort_sessions;
create trigger cohort_sessions_updated_at before update on public.cohort_sessions
  for each row execute procedure public.set_updated_at();
drop trigger if exists cohort_session_contents_updated_at on public.cohort_session_contents;
create trigger cohort_session_contents_updated_at before update on public.cohort_session_contents
  for each row execute procedure public.set_updated_at();
drop trigger if exists curriculum_weeks_updated_at on public.curriculum_weeks;
create trigger curriculum_weeks_updated_at before update on public.curriculum_weeks
  for each row execute procedure public.set_updated_at();
drop trigger if exists curriculum_lessons_updated_at on public.curriculum_lessons;
create trigger curriculum_lessons_updated_at before update on public.curriculum_lessons
  for each row execute procedure public.set_updated_at();
drop trigger if exists lesson_contents_updated_at on public.lesson_contents;
create trigger lesson_contents_updated_at before update on public.lesson_contents
  for each row execute procedure public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute procedure public.set_updated_at();
drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute procedure public.set_updated_at();
drop trigger if exists enrollments_updated_at on public.enrollments;
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute procedure public.set_updated_at();
drop trigger if exists lesson_progress_updated_at on public.lesson_progress;
create trigger lesson_progress_updated_at before update on public.lesson_progress
  for each row execute procedure public.set_updated_at();
drop trigger if exists reviews_updated_at on public.reviews;
create trigger reviews_updated_at before update on public.reviews
  for each row execute procedure public.set_updated_at();
drop trigger if exists site_banners_updated_at on public.site_banners;
create trigger site_banners_updated_at before update on public.site_banners
  for each row execute procedure public.set_updated_at();

-- 모든 업무 테이블에 RLS 적용
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_assets enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_sessions enable row level security;
alter table public.cohort_session_contents enable row level security;
alter table public.curriculum_weeks enable row level security;
alter table public.curriculum_lessons enable row level security;
alter table public.lesson_contents enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.payment_events enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.reviews enable row level security;
alter table public.site_banners enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_logs enable row level security;

-- 정책을 재실행 가능하도록 먼저 제거
drop policy if exists profiles_read_own_or_admin on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists public_read_published_courses on public.courses;
drop policy if exists admins_manage_courses on public.courses;
drop policy if exists public_read_course_assets on public.course_assets;
drop policy if exists admins_manage_course_assets on public.course_assets;
drop policy if exists public_read_available_cohorts on public.cohorts;
drop policy if exists admins_manage_cohorts on public.cohorts;
drop policy if exists public_read_cohort_sessions on public.cohort_sessions;
drop policy if exists admins_manage_cohort_sessions on public.cohort_sessions;
drop policy if exists enrolled_read_cohort_session_contents on public.cohort_session_contents;
drop policy if exists admins_manage_cohort_session_contents on public.cohort_session_contents;
drop policy if exists public_read_curriculum_weeks on public.curriculum_weeks;
drop policy if exists admins_manage_curriculum_weeks on public.curriculum_weeks;
drop policy if exists public_read_curriculum_lessons on public.curriculum_lessons;
drop policy if exists admins_manage_curriculum_lessons on public.curriculum_lessons;
drop policy if exists enrolled_read_lesson_contents on public.lesson_contents;
drop policy if exists admins_manage_lesson_contents on public.lesson_contents;
drop policy if exists users_read_own_orders on public.orders;
drop policy if exists admins_manage_orders on public.orders;
drop policy if exists users_read_own_order_items on public.order_items;
drop policy if exists admins_manage_order_items on public.order_items;
drop policy if exists users_read_own_payments on public.payments;
drop policy if exists admins_manage_payments on public.payments;
drop policy if exists users_read_own_refunds on public.refunds;
drop policy if exists admins_manage_refunds on public.refunds;
drop policy if exists admins_read_payment_events on public.payment_events;
drop policy if exists users_read_own_enrollments on public.enrollments;
drop policy if exists admins_manage_enrollments on public.enrollments;
drop policy if exists users_manage_own_progress on public.lesson_progress;
drop policy if exists public_read_published_reviews on public.reviews;
drop policy if exists buyers_submit_reviews on public.reviews;
drop policy if exists admins_manage_reviews on public.reviews;
drop policy if exists public_read_active_banners on public.site_banners;
drop policy if exists admins_manage_banners on public.site_banners;
drop policy if exists public_read_settings on public.site_settings;
drop policy if exists admins_manage_settings on public.site_settings;
drop policy if exists admins_read_audit_logs on public.audit_logs;

-- 회원
create policy profiles_read_own_or_admin on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 공개 클래스·기수·목차
create policy public_read_published_courses on public.courses
  for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy admins_manage_courses on public.courses
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_course_assets on public.course_assets
  for select to anon, authenticated
  using (
    exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
    or (select public.is_admin())
  );
create policy admins_manage_course_assets on public.course_assets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_available_cohorts on public.cohorts
  for select to anon, authenticated
  using (
    (
      status <> 'cancelled'
      and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
    )
    or (select public.is_admin())
  );
create policy admins_manage_cohorts on public.cohorts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_cohort_sessions on public.cohort_sessions
  for select to anon, authenticated
  using (
    (
      is_public
      and exists (
        select 1
        from public.cohorts ch
        join public.courses c on c.id = ch.course_id
        where ch.id = cohort_id and ch.status <> 'cancelled' and c.status = 'published'
      )
    )
    or (select public.is_admin())
  );
create policy admins_manage_cohort_sessions on public.cohort_sessions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy enrolled_read_cohort_session_contents on public.cohort_session_contents
  for select to authenticated
  using (
    exists (
      select 1
      from public.cohort_sessions s
      join public.cohorts ch on ch.id = s.cohort_id
      where s.id = session_id and public.has_course_access(ch.course_id)
    )
  );
create policy admins_manage_cohort_session_contents on public.cohort_session_contents
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_curriculum_weeks on public.curriculum_weeks
  for select to anon, authenticated
  using (
    (
      is_published
      and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
    )
    or (select public.is_admin())
  );
create policy admins_manage_curriculum_weeks on public.curriculum_weeks
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_curriculum_lessons on public.curriculum_lessons
  for select to anon, authenticated
  using (
    (
      is_published
      and exists (
        select 1
        from public.curriculum_weeks w
        join public.courses c on c.id = w.course_id
        where w.id = week_id and w.is_published and c.status = 'published'
      )
    )
    or (select public.is_admin())
  );
create policy admins_manage_curriculum_lessons on public.curriculum_lessons
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy enrolled_read_lesson_contents on public.lesson_contents
  for select to authenticated
  using (
    exists (
      select 1
      from public.curriculum_lessons l
      join public.curriculum_weeks w on w.id = l.week_id
      where l.id = lesson_id and public.has_course_access(w.course_id)
    )
  );
create policy admins_manage_lesson_contents on public.lesson_contents
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- 주문·결제·환불·수강권
create policy users_read_own_orders on public.orders
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy admins_manage_orders on public.orders
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy users_read_own_order_items on public.order_items
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select public.is_admin())
  );
create policy admins_manage_order_items on public.order_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy users_read_own_payments on public.payments
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select public.is_admin())
  );
create policy admins_manage_payments on public.payments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy users_read_own_refunds on public.refunds
  for select to authenticated
  using (
    exists (
      select 1
      from public.payments p
      join public.orders o on o.id = p.order_id
      where p.id = payment_id and o.user_id = (select auth.uid())
    )
    or (select public.is_admin())
  );
create policy admins_manage_refunds on public.refunds
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy admins_read_payment_events on public.payment_events
  for select to authenticated
  using ((select public.is_admin()));

create policy users_read_own_enrollments on public.enrollments
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy admins_manage_enrollments on public.enrollments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy users_manage_own_progress on public.lesson_progress
  for all to authenticated
  using (
    exists (
      select 1
      from public.enrollments e
      where e.id = enrollment_id and e.user_id = (select auth.uid()) and e.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.enrollments e
      join public.curriculum_lessons l on l.id = lesson_id
      join public.curriculum_weeks w on w.id = l.week_id
      where e.id = enrollment_id
        and e.user_id = (select auth.uid())
        and e.status = 'active'
        and e.course_id = w.course_id
    )
  );

-- 리뷰·배너·설정·감사로그
create policy public_read_published_reviews on public.reviews
  for select to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()) or (select public.is_admin()));
create policy buyers_submit_reviews on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and is_featured = false
    and exists (
      select 1
      from public.enrollments e
      where e.user_id = (select auth.uid())
        and e.course_id = course_id
        and e.status = 'active'
    )
  );
create policy admins_manage_reviews on public.reviews
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_active_banners on public.site_banners
  for select to anon, authenticated
  using (
    (
      is_active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    )
    or (select public.is_admin())
  );
create policy admins_manage_banners on public.site_banners
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy public_read_settings on public.site_settings
  for select to anon, authenticated
  using (is_public or (select public.is_admin()));
create policy admins_manage_settings on public.site_settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy admins_read_audit_logs on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- API 권한. 주문 생성·결제 승인·수강권 발급은 서버 전용 키로만 처리한다.
revoke all on public.profiles, public.courses, public.course_assets, public.cohorts,
  public.cohort_sessions, public.cohort_session_contents, public.curriculum_weeks,
  public.curriculum_lessons, public.lesson_contents, public.orders, public.order_items,
  public.payments, public.refunds, public.payment_events, public.enrollments,
  public.lesson_progress, public.reviews, public.site_banners, public.site_settings,
  public.audit_logs from anon, authenticated;

grant select on public.courses, public.course_assets, public.cohorts,
  public.cohort_sessions, public.curriculum_weeks, public.curriculum_lessons,
  public.reviews, public.site_banners, public.site_settings to anon;

grant select on public.profiles, public.courses, public.course_assets, public.cohorts,
  public.cohort_sessions, public.cohort_session_contents, public.curriculum_weeks,
  public.curriculum_lessons, public.lesson_contents, public.orders, public.order_items,
  public.payments, public.refunds, public.payment_events, public.enrollments,
  public.lesson_progress, public.reviews, public.site_banners, public.site_settings,
  public.audit_logs to authenticated;

grant insert, update, delete on public.courses, public.course_assets, public.cohorts,
  public.cohort_sessions, public.cohort_session_contents, public.curriculum_weeks,
  public.curriculum_lessons, public.lesson_contents, public.reviews,
  public.site_banners, public.site_settings to authenticated;
grant insert, update on public.lesson_progress to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on function public.is_admin() from public;
revoke execute on function public.has_course_access(uuid) from public;
revoke execute on function public.try_uuid(text) from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.has_course_access(uuid) to authenticated, service_role;
grant execute on function public.try_uuid(text) to authenticated, service_role;

-- 파일 저장소: 상세 이미지는 공개, 수업 자료는 수강생에게만 공개
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('course-assets', 'course-assets', true, 10485760,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('course-resources', 'course-resources', false, 52428800,
    array[
      'application/pdf',
      'application/zip',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'application/x-hwp',
      'application/haansofthwp',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists course_assets_public_read on storage.objects;
drop policy if exists admins_upload_course_assets on storage.objects;
drop policy if exists admins_update_course_assets on storage.objects;
drop policy if exists admins_delete_course_assets on storage.objects;
drop policy if exists enrolled_read_course_resources on storage.objects;
drop policy if exists admins_upload_course_resources on storage.objects;
drop policy if exists admins_update_course_resources on storage.objects;
drop policy if exists admins_delete_course_resources on storage.objects;

create policy course_assets_public_read on storage.objects
  for select to public
  using (bucket_id = 'course-assets');
create policy admins_upload_course_assets on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-assets' and (select public.is_admin()));
create policy admins_update_course_assets on storage.objects
  for update to authenticated
  using (bucket_id = 'course-assets' and (select public.is_admin()))
  with check (bucket_id = 'course-assets' and (select public.is_admin()));
create policy admins_delete_course_assets on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-assets' and (select public.is_admin()));

create policy enrolled_read_course_resources on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-resources'
    and public.has_course_access(
      public.try_uuid((storage.foldername(name))[1])
    )
  );
create policy admins_upload_course_resources on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-resources' and (select public.is_admin()));
create policy admins_update_course_resources on storage.objects
  for update to authenticated
  using (bucket_id = 'course-resources' and (select public.is_admin()))
  with check (bucket_id = 'course-resources' and (select public.is_admin()));
create policy admins_delete_course_resources on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-resources' and (select public.is_admin()));

-- 상품·기수·커리큘럼은 운영자가 관리자 화면에서 등록한다.
insert into public.site_settings (key, value, is_public)
values
  ('site_name', '"브랜디액션 에듀"'::jsonb, true),
  ('support_email', '"edu@brandyaction.co.kr"'::jsonb, true)
on conflict (key) do nothing;

commit;
