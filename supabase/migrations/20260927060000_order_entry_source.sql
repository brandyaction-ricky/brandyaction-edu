-- Attribution for the four campaign links in the September EDU launch.
-- An absent value remains NULL for direct or consultation-led orders.
alter table public.orders
  add column if not exists entry_src text;

alter table public.orders
  add constraint orders_entry_src_check
  check (entry_src is null or entry_src in ('paid', 'organic', 'alumni', 'youtube'));
