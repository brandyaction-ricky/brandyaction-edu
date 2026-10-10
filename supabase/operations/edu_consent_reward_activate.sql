-- Separate activation approval; require the approved coupon and no analysis disclosure.
begin;
set local lock_timeout='5s';
do $$ begin
 if (select count(*) from public.edu_consent_reward_config where singleton and coupon_id='e59feb81-ef02-457b-a208-98fea75ca377' and valid_days=30) <> 1 then
  raise exception 'REWARD_CONFIG_MISMATCH';
 end if;
 if exists(select 1 from public.edu_personalization_terms where is_current) then
  raise exception 'UNEXPECTED_ANALYSIS_DISCLOSURE';
 end if;
end $$;
update public.edu_consent_reward_config set enabled=true where singleton;
commit;
