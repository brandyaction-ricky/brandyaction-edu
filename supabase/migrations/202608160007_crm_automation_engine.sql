begin;

create table if not exists public.crm_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null check (trigger_type in ('member_joined','marketing_consent','tag_assigned','purchase_completed')),
  trigger_tag_id uuid references public.crm_tags(id) on delete set null,
  trigger_course_id uuid references public.courses(id) on delete set null,
  template_id uuid not null references public.crm_templates(id),
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 525600),
  is_active boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  trigger_key text not null,
  status text not null default 'pending' check (status in ('pending','processing','accepted','completed','failed','skipped','cancelled')),
  scheduled_for timestamptz not null,
  provider_group_id text,
  error_message text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(automation_id,trigger_key)
);

alter table public.crm_message_logs add column if not exists automation_run_id uuid references public.crm_automation_runs(id) on delete set null;
alter table public.crm_message_logs add column if not exists provider_status text;
alter table public.crm_message_logs add column if not exists delivered_at timestamptz;

alter table public.crm_automations enable row level security;
alter table public.crm_automation_runs enable row level security;
revoke all on public.crm_automations, public.crm_automation_runs from anon, authenticated;
grant all on public.crm_automations, public.crm_automation_runs to service_role;

drop trigger if exists crm_automations_updated_at on public.crm_automations;
create trigger crm_automations_updated_at before update on public.crm_automations for each row execute function public.set_updated_at();

create or replace function public.crm_enqueue_automation(
  p_trigger_type text,
  p_member_id uuid,
  p_trigger_key text,
  p_tag_id uuid default null,
  p_course_id uuid default null
) returns void language sql security definer set search_path = '' as $$
  insert into public.crm_automation_runs(automation_id,member_id,trigger_key,scheduled_for)
  select automation.id,p_member_id,p_trigger_key,now() + make_interval(mins=>automation.delay_minutes)
  from public.crm_automations automation
  where automation.is_active
    and automation.trigger_type=p_trigger_type
    and (automation.trigger_tag_id is null or automation.trigger_tag_id=p_tag_id)
    and (automation.trigger_course_id is null or automation.trigger_course_id=p_course_id)
  on conflict(automation_id,trigger_key) do nothing;
$$;

create or replace function public.crm_on_profile_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.crm_enqueue_automation('member_joined',new.id,'member_joined:'||new.id::text);
  if new.marketing_consent then perform public.crm_enqueue_automation('marketing_consent',new.id,'marketing_consent:'||new.id::text); end if;
  return new;
end; $$;

create or replace function public.crm_on_profile_consent() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.marketing_consent and not coalesce(old.marketing_consent,false) then
    perform public.crm_enqueue_automation('marketing_consent',new.id,'marketing_consent:'||new.id::text||':'||extract(epoch from coalesce(new.marketing_consent_at,now()))::bigint::text);
  end if;
  return new;
end; $$;

create or replace function public.crm_on_tag_assigned() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.crm_enqueue_automation('tag_assigned',new.member_id,'tag_assigned:'||new.member_id::text||':'||new.tag_id::text,new.tag_id,null);
  return new;
end; $$;

create or replace function public.crm_on_order_paid() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_course_id uuid;
begin
  if new.status='paid' and old.status is distinct from 'paid' and new.user_id is not null then
    select item.course_id into v_course_id from public.order_items item where item.order_id=new.id order by item.created_at limit 1;
    perform public.crm_enqueue_automation('purchase_completed',new.user_id,'purchase_completed:'||new.id::text,null,v_course_id);
  end if;
  return new;
end; $$;

drop trigger if exists crm_profile_inserted on public.profiles;
create trigger crm_profile_inserted after insert on public.profiles for each row execute function public.crm_on_profile_insert();
drop trigger if exists crm_profile_marketing_consent on public.profiles;
create trigger crm_profile_marketing_consent after update of marketing_consent on public.profiles for each row execute function public.crm_on_profile_consent();
drop trigger if exists crm_tag_assigned on public.crm_member_tags;
create trigger crm_tag_assigned after insert on public.crm_member_tags for each row execute function public.crm_on_tag_assigned();
drop trigger if exists crm_order_paid on public.orders;
create trigger crm_order_paid after update of status on public.orders for each row execute function public.crm_on_order_paid();

create index if not exists crm_automation_runs_due_idx on public.crm_automation_runs(status,scheduled_for);
create index if not exists crm_campaigns_due_idx on public.crm_campaigns(status,scheduled_at);

commit;
