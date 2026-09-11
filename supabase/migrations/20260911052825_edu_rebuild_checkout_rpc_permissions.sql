begin;
-- Checkout mutation RPCs accept a user ID from the trusted server only.
do $$
declare target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'create_checkout_order','apply_coupon_to_order','finalize_zero_total_order',
      'finalize_zero_total_coupon_order','finalize_toss_payment'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated',target.signature);
    execute format('grant execute on function %s to service_role',target.signature);
  end loop;
end $$;
commit;
