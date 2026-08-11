begin;

-- RLS restricts rows, not which columns an owner may change. Without explicit
-- column grants, a logged-in member can call the Data API directly and try to
-- change role/status on their own profile row.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

commit;
