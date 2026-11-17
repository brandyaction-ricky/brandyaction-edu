-- Fixed short links for marketing content: https://<edu>/go/<key> never changes,
-- operators only change where it leads. Additive only.
-- Rollback: drop function if exists public.edu_short_link_hit(text, boolean); drop table if exists public.edu_short_links;
create table if not exists public.edu_short_links (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  channel text not null check (char_length(btrim(channel)) between 1 and 40),
  destination text not null check (char_length(destination) <= 2000 and destination ~ '^https://[^/?#\s@\\]+\.[^/?#\s@\\]+([/?#]\S*)?$'),
  is_active boolean not null default true,
  click_count bigint not null default 0 check (click_count >= 0),
  last_clicked_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists edu_short_links_created_idx on public.edu_short_links (created_at desc);
alter table public.edu_short_links enable row level security;
revoke all on public.edu_short_links from public, anon, authenticated;
grant select, insert, update on public.edu_short_links to service_role;

-- One round trip per click: count (when the request is a real visit) and return the destination.
-- ponytail: one hot row per popular link; move to an append-only click log if a single link takes heavy concurrent traffic.
create or replace function public.edu_short_link_hit(p_key text, p_record boolean)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_destination text;
begin
  if p_record then
    update public.edu_short_links set click_count = click_count + 1, last_clicked_at = now()
     where key = p_key and is_active returning destination into v_destination;
  else
    select destination into v_destination from public.edu_short_links where key = p_key and is_active;
  end if;
  return v_destination;
end $$;
revoke all on function public.edu_short_link_hit(text, boolean) from public, anon, authenticated;
grant execute on function public.edu_short_link_hit(text, boolean) to service_role;
