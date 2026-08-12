insert into public.site_settings (key, value, is_public)
values ('search_code_settings', jsonb_build_object('metaCode', '', 'headerCode', '', 'bodyCode', ''), false)
on conflict (key) do nothing;
