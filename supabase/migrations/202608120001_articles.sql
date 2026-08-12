begin;

create table if not exists public.article_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.article_categories(id) on delete set null,
  slug text not null unique,
  title text not null,
  summary text,
  content_blocks jsonb not null default '[]'::jsonb,
  cover_image_path text,
  cover_image_alt text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'hidden')),
  is_featured boolean not null default false,
  seo_title text,
  seo_description text,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_publication_idx on public.articles(status, published_at desc);
create index if not exists articles_category_idx on public.articles(category_id, published_at desc);
create unique index if not exists articles_one_featured_idx on public.articles(is_featured) where is_featured;

drop trigger if exists set_article_categories_updated_at on public.article_categories;
create trigger set_article_categories_updated_at before update on public.article_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_articles_updated_at on public.articles;
create trigger set_articles_updated_at before update on public.articles
for each row execute function public.set_updated_at();

alter table public.article_categories enable row level security;
alter table public.articles enable row level security;

drop policy if exists public_read_article_categories on public.article_categories;
create policy public_read_article_categories on public.article_categories
  for select to anon, authenticated
  using (is_active);

drop policy if exists admins_manage_article_categories on public.article_categories;
create policy admins_manage_article_categories on public.article_categories
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists public_read_articles on public.articles;
create policy public_read_articles on public.articles
  for select to anon, authenticated
  using (
    status = 'published'
    or (status = 'scheduled' and scheduled_at is not null and scheduled_at <= now())
  );

drop policy if exists admins_manage_articles on public.articles;
create policy admins_manage_articles on public.articles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.article_categories, public.articles from anon, authenticated;
grant select on public.article_categories, public.articles to anon, authenticated;
grant insert, update, delete on public.article_categories, public.articles to authenticated;
grant all on public.article_categories, public.articles to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-assets', 'article-assets', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists admins_upload_article_assets on storage.objects;
create policy admins_upload_article_assets on storage.objects
  for insert to authenticated
  with check (bucket_id = 'article-assets' and (select public.is_admin()));

drop policy if exists admins_update_article_assets on storage.objects;
create policy admins_update_article_assets on storage.objects
  for update to authenticated
  using (bucket_id = 'article-assets' and (select public.is_admin()))
  with check (bucket_id = 'article-assets' and (select public.is_admin()));

drop policy if exists admins_delete_article_assets on storage.objects;
create policy admins_delete_article_assets on storage.objects
  for delete to authenticated
  using (bucket_id = 'article-assets' and (select public.is_admin()));

insert into public.article_categories (name, slug, description, display_order)
values
  ('방향과 업', 'direction-work', '나의 기준과 일의 방향을 찾는 콘텐츠', 0),
  ('강점과 재능', 'strength-talent', '강점을 발견하고 성과로 연결하는 콘텐츠', 1),
  ('브랜딩과 수익화', 'branding-business', '브랜드를 만들고 수익으로 연결하는 콘텐츠', 2)
on conflict (slug) do nothing;

insert into public.site_settings (key, value, is_public)
values (
  'article_free_course',
  jsonb_build_object(
    'eyebrow', 'FREE CLASS · 무료 3강',
    'title', '진단 전에 먼저 보는 무료 강의',
    'description', '성향 유형을 붙여 주는 강의가 아닙니다. 반복해서 비어 있던 자리가 가리키는 내 업의 방향을 세 번의 강의로 먼저 잡습니다.',
    'signupCopy', '무료 회원가입을 완료하면 3강 전체를 사이트에서 바로 볼 수 있어요. 별도 결제는 필요 없습니다.',
    'lessons', jsonb_build_array(
      jsonb_build_object('id', 'lesson-1', 'title', '왜 열심히 해도 제자리인지 — 방향의 구조', 'videoUrl', ''),
      jsonb_build_object('id', 'lesson-2', 'title', '결핍이 가리키는 6가지 핵심 욕구', 'videoUrl', ''),
      jsonb_build_object('id', 'lesson-3', 'title', '내 업의 방향을 잡는 첫 질문', 'videoUrl', '')
    )
  ),
  true
)
on conflict (key) do nothing;

update public.site_settings
set value = value || jsonb_build_array(jsonb_build_object(
  'id', 'articles', 'label', '아티클', 'href', '/articles', 'enabled', true
))
where key = 'site_navigation'
  and jsonb_typeof(value) = 'array'
  and not exists (select 1 from jsonb_array_elements(value) item where item ->> 'href' = '/articles');

commit;
