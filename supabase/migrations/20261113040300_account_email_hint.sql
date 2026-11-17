begin;

create table private.edu_account_hint_attempts (
  bucket text primary key,
  expires_at timestamptz not null,
  attempts integer not null
);
create index edu_account_hint_expiry on private.edu_account_hint_attempts (expires_at);
alter table private.edu_account_hint_attempts enable row level security;
revoke all on private.edu_account_hint_attempts from public, anon, authenticated;
grant select, insert, update, delete on private.edu_account_hint_attempts to service_role;
grant usage on schema private to service_role;

-- Only the application server can supply a caller bucket. Keep PII out of counters.
create function public.edu_account_hint_allow(p_client text, p_order text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  k text;
  accepted integer;
begin
  if p_client is null or p_order is null or p_client !~ '^[a-f0-9]{64}$' or p_order !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  delete from private.edu_account_hint_attempts where expires_at <= now();
  foreach k in array array['client-' || p_client, 'order-' || p_order] loop
    insert into private.edu_account_hint_attempts as counters values (k, now() + interval '15 minutes', 1)
    on conflict (bucket) do update set attempts = counters.attempts + 1
      where counters.attempts < 8
    returning attempts into accepted;
    if accepted is null then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.edu_account_hint_allow(text,text) from public, anon, authenticated;
grant execute on function public.edu_account_hint_allow(text,text) to service_role;

commit;
