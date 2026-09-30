-- A paid checkout already stores the applicant's phone on the order. Fill only
-- an empty member profile after payment is final; pending/failed orders cannot
-- change member contact information. The trigger also covers Toss webhooks.
create function public.edu_fill_profile_phone_from_paid_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text;
begin
  if new.status <> 'paid' or old.status = 'paid' or new.total_amount <= 0 or new.user_id is null then
    return new;
  end if;
  v_phone := regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g');
  if v_phone ~ '^01[016789][0-9]{7,8}$' then
    update public.profiles
    set phone = v_phone
    where id = new.user_id and status = 'active' and nullif(btrim(phone), '') is null;
  end if;
  return new;
end;
$$;

revoke all on function public.edu_fill_profile_phone_from_paid_order() from public, anon, authenticated;
create trigger orders_fill_profile_phone_after_payment
after update of status on public.orders
for each row execute function public.edu_fill_profile_phone_from_paid_order();
