begin;

alter table public.articles
  add column if not exists content_type text not null default 'column',
  add column if not exists video_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'articles_content_type_check'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles
      add constraint articles_content_type_check
      check (content_type in ('column', 'youtube'));
  end if;
end $$;

commit;
