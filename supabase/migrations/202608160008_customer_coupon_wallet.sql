begin;

create table if not exists public.customer_coupons (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'available' check (status in ('available','used','revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coupon_id, user_id),
  check (expires_at is null or expires_at > issued_at)
);

create index if not exists customer_coupons_user_status_idx
  on public.customer_coupons(user_id, status, expires_at);

alter table public.customer_coupons enable row level security;

drop policy if exists customers_read_own_coupons on public.customer_coupons;
create policy customers_read_own_coupons
  on public.customer_coupons for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists admins_manage_customer_coupons on public.customer_coupons;
create policy admins_manage_customer_coupons
  on public.customer_coupons for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.customer_coupons to authenticated;
grant select,insert,update,delete on public.customer_coupons to service_role;

create or replace function public.sync_customer_coupon_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then return new; end if;

  if new.status = 'used' then
    update public.customer_coupons
      set status = 'used', used_at = coalesce(new.used_at, now()), updated_at = now()
      where coupon_id = new.coupon_id
        and user_id = new.user_id
        and status = 'available';
  end if;

  return new;
end;
$$;

drop trigger if exists coupon_redemptions_sync_customer_wallet on public.coupon_redemptions;
create trigger coupon_redemptions_sync_customer_wallet
  after insert or update of status on public.coupon_redemptions
  for each row execute function public.sync_customer_coupon_wallet();

commit;
