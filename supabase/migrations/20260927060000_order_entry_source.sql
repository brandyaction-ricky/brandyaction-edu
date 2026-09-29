-- Attribution for the four campaign links in the September EDU launch.
-- An absent value remains NULL for direct or consultation-led orders.
alter table public.orders
  add column if not exists entry_src text;

do $$
declare
  existing_definition text;
begin
  select pg_get_constraintdef(oid)
  into existing_definition
  from pg_constraint
  where conrelid = 'public.orders'::regclass
    and conname = 'orders_entry_src_check';

  if existing_definition is null then
    alter table public.orders
      add constraint orders_entry_src_check
      check (entry_src is null or entry_src in ('paid', 'organic', 'alumni', 'youtube'));
  elsif existing_definition is distinct from 'CHECK (((entry_src IS NULL) OR (entry_src = ANY (ARRAY[''paid''::text, ''organic''::text, ''alumni''::text, ''youtube''::text]))))' then
    raise exception 'orders_entry_src_check already exists with an unexpected definition: %', existing_definition;
  end if;
end;
$$;
