-- Show the confirmed mail-order sales registration number in the public footer.
-- Preserve every other existing site setting.

insert into public.site_settings (key, value, is_public)
values (
  'site_basic',
  jsonb_build_object('mailOrderNumber', '제2026-충남천안-1825호'),
  true
)
on conflict (key) do update
set
  value = jsonb_set(
    coalesce(public.site_settings.value, '{}'::jsonb),
    '{mailOrderNumber}',
    to_jsonb('제2026-충남천안-1825호'::text),
    true
  ),
  is_public = true,
  updated_at = now();
