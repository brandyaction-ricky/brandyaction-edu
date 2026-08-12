begin;

insert into public.site_settings (key, value, is_public)
values (
  'site_navigation',
  jsonb_build_array(
    jsonb_build_object('id', 'classes', 'label', '클래스 소개', 'href', '/classes', 'enabled', true),
    jsonb_build_object('id', 'reviews', 'label', '리얼 후기', 'href', '/#reviews', 'enabled', true),
    jsonb_build_object('id', 'articles', 'label', '블로그', 'href', '/articles', 'enabled', true)
  ),
  true
)
on conflict (key) do update set
  value = excluded.value,
  is_public = excluded.is_public;

commit;
