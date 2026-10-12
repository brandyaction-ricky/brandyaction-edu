-- The invoker report needs SELECT; bypass-RLS does not confer table privileges.
-- Keep browser roles and all write privileges unchanged.
begin;
grant select on public.customer_journey_events to service_role;
commit;
