-- LOCAL PGLITE TEST FIXTURE ONLY. This is NOT a production/DEV installer.
-- Column names/types/nullability model the read-only DEV preflight metadata.
-- Auth, profile creation, operator permission and base RLS are local models;
-- they do not prove equivalence with live Supabase triggers or service behavior.
-- No network, secrets, Auth provisioning API, or Storage object writes are used.

create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
create schema realtime;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic',true);
$$;
grant usage on schema auth,private,realtime,storage to authenticated,service_role;
grant execute on function auth.uid(),realtime.topic() to authenticated,service_role;

-- Seed columns, defaults, nullable flags and constraints below match the
-- 2026-11-03 read-only DEV seed metadata. Auth generated-column internals and
-- unrelated order data are not modeled. The nullable order-item FK has an empty
-- local target solely to reject invalid references; the smoke creates no orders.
create table auth.users (
  instance_id uuid,
  id uuid not null,
  aud varchar,
  role varchar,
  email varchar,
  encrypted_password varchar,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar,
  confirmation_sent_at timestamptz,
  recovery_token varchar,
  recovery_sent_at timestamptz,
  email_change_token_new varchar,
  email_change varchar,
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin bool,
  created_at timestamptz,
  updated_at timestamptz,
  phone text default NULL::character varying,
  phone_confirmed_at timestamptz,
  phone_change text default ''::character varying,
  phone_change_token varchar default ''::character varying,
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz,
  email_change_token_current varchar default ''::character varying,
  email_change_confirm_status int2 default 0,
  banned_until timestamptz,
  reauthentication_token varchar default ''::character varying,
  reauthentication_sent_at timestamptz,
  is_sso_user bool default false not null,
  deleted_at timestamptz,
  is_anonymous bool default false not null,
  constraint users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2))),
  constraint users_phone_key UNIQUE (phone),
  constraint users_pkey PRIMARY KEY (id)
);
create table public.profiles (
  id uuid not null,
  email text default ''::text not null,
  full_name text,
  phone text,
  avatar_url text,
  role text default 'student'::text not null,
  status text default 'active'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  marketing_consent bool default false not null,
  marketing_consent_at timestamptz,
  marketing_opt_out_at timestamptz,
  deleted_at timestamptz,
  contact_email text,
  is_internal bool default false not null,
  marketing_use_consent_at timestamptz,
  ad_sms_consent_at timestamptz,
  ad_kakao_consent_at timestamptz,
  ad_email_consent_at timestamptz,
  consent_revision uuid,
  consent_updated_at timestamptz,
  legacy_consent_retired_at timestamptz,
  constraint profiles_contact_email_valid CHECK (((contact_email IS NULL) OR ((char_length(contact_email) <= 254) AND (contact_email = lower(btrim(contact_email))) AND (contact_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'::text)))),
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'staff'::text, 'admin'::text]))),
  constraint profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'withdrawn'::text])))
);
create table public.courses (
  id uuid default gen_random_uuid() not null,
  course_code text not null,
  slug text not null,
  title text not null,
  summary text,
  description text,
  category text,
  instructor_name text,
  list_price int4 default 0 not null,
  duration_label text,
  schedule_label text,
  status text default 'draft'::text not null,
  display_order int4 default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  published_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  archived_at timestamptz,
  constraint courses_course_code_key UNIQUE (course_code),
  constraint courses_list_price_check CHECK ((list_price >= 0)),
  constraint courses_pkey PRIMARY KEY (id),
  constraint courses_slug_key UNIQUE (slug),
  constraint courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);
create table public.cohorts (
  id uuid default gen_random_uuid() not null,
  course_id uuid not null,
  cohort_code text not null,
  name text not null,
  note text,
  recruitment_start_at timestamptz,
  recruitment_end_at timestamptz,
  operation_start_at timestamptz,
  operation_end_at timestamptz,
  price int4 not null,
  capacity int4,
  status text default 'upcoming'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  archived_at timestamptz,
  alumni_access_on_enroll bool default false not null,
  constraint cohorts_capacity_check CHECK (((capacity IS NULL) OR (capacity > 0))),
  constraint cohorts_course_id_cohort_code_key UNIQUE (course_id, cohort_code),
  constraint cohorts_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  constraint cohorts_pkey PRIMARY KEY (id),
  constraint cohorts_price_check CHECK ((price >= 0)),
  constraint cohorts_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'recruiting'::text, 'closed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);
create table public.order_items(id uuid primary key);
create table public.enrollments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_id uuid not null,
  cohort_id uuid not null,
  order_item_id uuid,
  status text default 'active'::text not null,
  access_starts_at timestamptz default now() not null,
  access_ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  source text default 'purchase'::text not null,
  granted_by uuid,
  constraint enrollments_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES cohorts(id),
  constraint enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id),
  constraint enrollments_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES profiles(id),
  constraint enrollments_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  constraint enrollments_order_item_id_key UNIQUE (order_item_id),
  constraint enrollments_pkey PRIMARY KEY (id),
  constraint enrollments_source_check CHECK ((source = ANY (ARRAY['purchase'::text, 'admin_grant'::text]))),
  constraint enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'refunded'::text]))),
  constraint enrollments_user_id_cohort_id_key UNIQUE (user_id, cohort_id),
  constraint enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id)
);
create table public.curriculum_weeks (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id),
  week_number integer not null check(week_number>0), title text not null, goal text,
  is_published boolean not null default false, display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz, category_kind text not null default 'main', active_week_number integer,
  unique(course_id,week_number)
);
create table public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(), week_id uuid not null references public.curriculum_weeks(id),
  day_number integer not null check(day_number>0), title text not null, description text,
  content_type text not null check(content_type in ('vod','material')), duration_label text,
  is_preview boolean not null default false, is_published boolean not null default false,
  display_order integer not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), access_mode text not null default 'enrolled',
  archived_at timestamptz, unique(week_id,day_number)
);
create table public.curriculum_missions (
  id uuid primary key default gen_random_uuid(), lesson_id uuid not null references public.curriculum_lessons(id),
  title text not null, instructions text, is_required boolean not null default true,
  submission_type text not null default 'mixed', is_published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz, form_schema jsonb not null default '{}'::jsonb,
  archived_by_curriculum boolean not null default false
);
create table public.mission_submissions (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.enrollments(id),
  mission_id uuid not null references public.curriculum_missions(id), attempt_number integer not null,
  status text not null default 'submitted', response jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(), reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id), reviewer_feedback text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  quiz_required boolean not null default false, quiz_passed boolean,
  unique(enrollment_id,mission_id,attempt_number)
);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name,phone)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.phone)
  on conflict(id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function private.mission_has_scope(text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and status='active' and role='admin');
$$;
grant execute on function private.mission_has_scope(text) to authenticated;

-- Local owner/enrolled-only base RLS model, deliberately not broad USING(true).
create function private.qa_enrolled(p_course uuid,p_cohort uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.user_id=auth.uid() and e.course_id=p_course and (p_cohort is null or e.cohort_id=p_cohort)
    and p.status='active' and e.status in ('active','expired') and e.revoked_at is null);
$$;
revoke all on function private.qa_enrolled(uuid,uuid) from public,anon;
grant execute on function private.qa_enrolled(uuid,uuid) to authenticated;
alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;
alter table public.courses enable row level security;
alter table public.cohorts enable row level security;
alter table public.curriculum_weeks enable row level security;
alter table public.curriculum_lessons enable row level security;
alter table public.curriculum_missions enable row level security;
alter table public.mission_submissions enable row level security;
create policy qa_profile_owner on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy qa_enrollment_owner on public.enrollments for select to authenticated using(user_id=(select auth.uid()));
create policy qa_course_enrolled on public.courses for select to authenticated using(private.qa_enrolled(id));
create policy qa_cohort_enrolled on public.cohorts for select to authenticated using(private.qa_enrolled(course_id,id));
create policy qa_week_enrolled on public.curriculum_weeks for select to authenticated using(is_published and private.qa_enrolled(course_id));
create policy qa_lesson_enrolled on public.curriculum_lessons for select to authenticated using(is_published and exists(select 1 from public.curriculum_weeks w where w.id=week_id));
create policy qa_mission_enrolled on public.curriculum_missions for select to authenticated using(is_published and exists(select 1 from public.curriculum_lessons l where l.id=lesson_id));
create policy qa_submission_owner on public.mission_submissions for select to authenticated using(exists(select 1 from public.enrollments e where e.id=enrollment_id and e.user_id=(select auth.uid())));
grant select on public.profiles,public.courses,public.cohorts,public.enrollments,public.curriculum_weeks,public.curriculum_lessons,public.curriculum_missions,public.mission_submissions to authenticated,service_role;
grant update on public.profiles,public.enrollments,public.courses,public.cohorts to service_role;

create table realtime.messages(id serial primary key,extension text);
alter table realtime.messages enable row level security;
grant select,insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;
create policy existing_realtime_send on realtime.messages for insert to authenticated with check(true);
create policy existing_realtime_read on realtime.messages for select to authenticated using(true);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,update,delete on storage.objects to authenticated;
create policy existing_storage_read on storage.objects for select to authenticated using(true);
-- Fail if the smoke ever attempts an object mutation, even inside its rollback.
create function private.qa_deny_storage_object_write() returns trigger language plpgsql as $$
begin raise exception 'Storage.objects writes are forbidden in transactional QA'; end;
$$;
create trigger qa_no_storage_object_writes before insert or update or delete or truncate on storage.objects
  for each statement execute function private.qa_deny_storage_object_write();
