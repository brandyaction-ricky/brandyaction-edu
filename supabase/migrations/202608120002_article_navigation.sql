begin;

insert into public.site_settings (key, value, is_public)
values (
  'site_navigation',
  jsonb_build_array(
    jsonb_build_object('id', 'classes', 'label', '클래스', 'href', '/classes', 'enabled', true),
    jsonb_build_object('id', 'articles', 'label', '아티클', 'href', '/articles', 'enabled', true),
    jsonb_build_object('id', 'philosophy', 'label', '교육 철학', 'href', '/#philosophy', 'enabled', true),
    jsonb_build_object('id', 'reviews', 'label', '후기', 'href', '/#reviews', 'enabled', true)
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
  and not exists (
    select 1
    from jsonb_array_elements(value) item
    where item ->> 'href' = '/articles'
  );

commit;
