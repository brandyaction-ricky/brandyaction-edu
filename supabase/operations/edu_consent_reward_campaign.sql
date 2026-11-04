-- Apply only after explicit production DB/coupon approval. Creates no wallet awards.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
insert into public.coupons(id,name,code,discount_type,discount_value,product_scope,per_user_limit,minimum_order_amount,issue_target,exclude_free,is_active,is_draft)
values('e59feb81-ef02-457b-a208-98fea75ca377','카카오톡 혜택 소식 동의 1만원 할인','EDU_KAKAO_WELCOME_10000','fixed',10000,'paid',1,0,'all',true,true,false);
insert into public.edu_consent_reward_config(coupon_id,valid_days,enabled)
values('e59feb81-ef02-457b-a208-98fea75ca377',30,false);
-- Intentionally no analysis/overseas disclosure seed, no customer issuance or message.
commit;
