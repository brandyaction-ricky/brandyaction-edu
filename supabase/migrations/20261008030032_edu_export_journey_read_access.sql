-- The invoker export source reads only these columns to count class views.
-- Production did not give service_role the SELECT access present in DEV,
-- so every export dataset failed before aggregation with SQLSTATE 42501.
-- Do not expose private journey payloads or grant any browser-role access.
grant select (occurred_at, session_id, path, user_id, event_name)
  on public.customer_journey_events to service_role;
