-- The Meta ad account is shared by every EDU landing campaign. Campaign IDs
-- remain campaign-specific and are entered by an administrator after ads exist.
insert into public.site_settings (key, value, is_public, updated_at)
values ('edu_meta_marketing', jsonb_build_object('adAccountId', 'act_245402678098216'), false, now())
on conflict (key) do update
set value = coalesce(public.site_settings.value, '{}'::jsonb) || excluded.value,
    is_public = false,
    updated_at = now();

-- Keep the existing column populated for backwards compatibility while the
-- common setting remains the source of truth for dashboard and sync APIs.
update public.landing_campaigns
set meta_ad_account_id = 'act_245402678098216',
    updated_at = now()
where meta_ad_account_id is distinct from 'act_245402678098216';
