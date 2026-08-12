begin;

alter table public.profiles add column if not exists marketing_consent boolean not null default false;
alter table public.profiles add column if not exists marketing_consent_at timestamptz;
alter table public.profiles add column if not exists marketing_opt_out_at timestamptz;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,email,full_name,phone,marketing_consent,marketing_consent_at)
  values (new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),coalesce(new.phone,new.raw_user_meta_data->>'phone'),coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean,false),case when coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean,false) then now() else null end)
  on conflict (id) do update set email=excluded.email,full_name=coalesce(public.profiles.full_name,excluded.full_name),phone=coalesce(public.profiles.phone,excluded.phone);
  return new;
end; $$;

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(), name text not null unique, color text not null default '#A10D12', description text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_member_tags (
  member_id uuid not null references public.profiles(id) on delete cascade, tag_id uuid not null references public.crm_tags(id) on delete cascade,
  assigned_by uuid references public.profiles(id), assigned_at timestamptz not null default now(), primary key(member_id,tag_id)
);
create table if not exists public.crm_templates (
  id uuid primary key default gen_random_uuid(), name text not null, channel text not null check(channel in ('sms','lms','alimtalk')),
  purpose text not null default 'marketing' check(purpose in ('marketing','transactional')), content text not null,
  alimtalk_template_id text, buttons jsonb not null default '[]'::jsonb, is_active boolean not null default true,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(), name text not null, template_id uuid not null references public.crm_templates(id),
  target_tag_id uuid references public.crm_tags(id) on delete set null, status text not null default 'draft' check(status in ('draft','scheduled','sending','completed','failed','cancelled')),
  scheduled_at timestamptz, sent_at timestamptz, recipient_count integer not null default 0, success_count integer not null default 0, failure_count integer not null default 0,
  provider_group_id text, error_message text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_message_logs (
  id uuid primary key default gen_random_uuid(), campaign_id uuid references public.crm_campaigns(id) on delete set null,
  member_id uuid references public.profiles(id) on delete set null, channel text not null, recipient_masked text not null,
  status text not null, provider_group_id text, error_message text, sent_at timestamptz, created_at timestamptz not null default now()
);

do $$ declare table_name text; begin
  foreach table_name in array array['crm_tags','crm_member_tags','crm_templates','crm_campaigns','crm_message_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

drop trigger if exists crm_tags_updated_at on public.crm_tags;
create trigger crm_tags_updated_at before update on public.crm_tags for each row execute function public.set_updated_at();
drop trigger if exists crm_templates_updated_at on public.crm_templates;
create trigger crm_templates_updated_at before update on public.crm_templates for each row execute function public.set_updated_at();
drop trigger if exists crm_campaigns_updated_at on public.crm_campaigns;
create trigger crm_campaigns_updated_at before update on public.crm_campaigns for each row execute function public.set_updated_at();

commit;
