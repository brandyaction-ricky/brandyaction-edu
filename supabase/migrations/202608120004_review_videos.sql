begin;

create table if not exists public.review_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  reviewer_name text not null,
  reviewer_role text,
  description text,
  video_url text not null,
  thumbnail_url text,
  is_published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists review_videos_updated_at on public.review_videos;
create trigger review_videos_updated_at before update on public.review_videos
for each row execute function public.set_updated_at();

alter table public.review_videos enable row level security;

drop policy if exists public_read_published_review_videos on public.review_videos;
create policy public_read_published_review_videos on public.review_videos
  for select to anon, authenticated using (is_published);

drop policy if exists admins_manage_review_videos on public.review_videos;
create policy admins_manage_review_videos on public.review_videos
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.review_videos from anon, authenticated;
grant select on public.review_videos to anon, authenticated;
grant insert, update, delete on public.review_videos to authenticated;
grant all on public.review_videos to service_role;

commit;
