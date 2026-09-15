-- Every creation path (including future campaign APIs) inherits the private
-- shared setting. Retain the legacy column without allowing row overrides.
create or replace function public.edu_apply_common_meta_account() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare account text;
begin
  select nullif(btrim(value->>'adAccountId'), '') into account
  from public.site_settings where key = 'edu_meta_marketing';
  if account is not null then
    account := 'act_' || regexp_replace(account, '^act_', '');
    if account !~ '^act_[0-9]+$' then raise exception 'INVALID_COMMON_META_ACCOUNT'; end if;
  end if;
  new.meta_ad_account_id := account;
  if (tg_op = 'UPDATE' and old.meta_ad_account_id is distinct from account)
     or new.meta_sync_status = 'not_configured' then
    new.meta_sync_status := case when account is not null and cardinality(new.meta_campaign_ids) > 0 then 'idle' else 'not_configured' end;
    new.meta_sync_error := null;
  end if;
  return new;
end $$;
revoke all on function public.edu_apply_common_meta_account() from public, anon, authenticated;
grant execute on function public.edu_apply_common_meta_account() to service_role;
drop trigger if exists landing_campaigns_shared_account on public.landing_campaigns;
create trigger landing_campaigns_shared_account before insert or update of meta_ad_account_id
on public.landing_campaigns for each row execute function public.edu_apply_common_meta_account();

-- Repair only mismatched accounts; preserve all campaign IDs, metrics, actuals,
-- prices and last successful sync timestamps. The trigger supplies the value.
update public.landing_campaigns
set meta_ad_account_id = meta_ad_account_id, updated_at = now()
where meta_ad_account_id is distinct from (
  select case when nullif(btrim(value->>'adAccountId'), '') is null then null
    else 'act_' || regexp_replace(btrim(value->>'adAccountId'), '^act_', '') end
  from public.site_settings where key = 'edu_meta_marketing'
);
