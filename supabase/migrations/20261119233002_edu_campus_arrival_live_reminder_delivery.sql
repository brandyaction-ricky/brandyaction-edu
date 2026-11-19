begin;

create table public.edu_campus_arrival_reminder_batches (
  id uuid primary key,
  event_id text not null check (event_id ~ '^moonshot-live-[0-9]{8}$'),
  claimed_at timestamptz not null default statement_timestamp(),
  recipient_count integer not null check (recipient_count between 1 and 1000),
  status text not null default 'claimed' check (status in ('claimed', 'accepted', 'complete', 'failed', 'unknown', 'skipped')),
  provider_group_id text check (provider_group_id ~ '^G4V[A-Za-z0-9]{29}$'),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_code text check (error_code in ('WINDOW_ENDED', 'SUBMISSION_UNCONFIRMED', 'RECEIPT_UNCONFIRMED', 'PROVIDER_REJECTED', 'DELIVERY_FAILED')),
  check (accepted_count + rejected_count <= recipient_count),
  check (delivered_count + failed_count <= accepted_count)
);

alter table public.edu_campus_arrival_reminder_batches enable row level security;
revoke all on public.edu_campus_arrival_reminder_batches from public, anon, authenticated, service_role;
grant select, insert on public.edu_campus_arrival_reminder_batches to service_role;
grant update (status, provider_group_id, accepted_count, rejected_count, delivered_count, failed_count, error_code)
  on public.edu_campus_arrival_reminder_batches to service_role;

create table public.edu_campus_arrival_reminder_purges (
  event_id text primary key check (event_id ~ '^moonshot-live-[0-9]{8}$'),
  purged_at timestamptz not null default statement_timestamp(),
  removed_count integer not null default 0 check (removed_count >= 0),
  eligible_unsent_count integer not null default 0 check (eligible_unsent_count between 0 and removed_count)
);
alter table public.edu_campus_arrival_reminder_purges enable row level security;
revoke all on public.edu_campus_arrival_reminder_purges from public, anon, authenticated, service_role;
grant select, insert on public.edu_campus_arrival_reminder_purges to service_role;
grant update (removed_count, eligible_unsent_count) on public.edu_campus_arrival_reminder_purges to service_role;

alter table public.edu_campus_arrival_live_reminders add column dispatch_batch_id uuid
  references public.edu_campus_arrival_reminder_batches (id);
grant update (dispatch_batch_id, consent_version, consented_at), delete
  on public.edu_campus_arrival_live_reminders to service_role;
create index edu_campus_arrival_reminders_unsent
  on public.edu_campus_arrival_live_reminders (event_id, consent_version, consented_at, phone)
  where dispatch_batch_id is null;

-- A newly submitted opt-in upgrades the old row without making a second
-- recipient or changing the timestamp of a duplicate current opt-in.
create function public.edu_refresh_campus_arrival_reminder_consent(p_event text, p_phone text, p_consent_version smallint)
returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.edu_campus_arrival_live_reminders
    set consent_version = p_consent_version, consented_at = statement_timestamp()
    where event_id = p_event and phone = p_phone and consent_version < p_consent_version
      and dispatch_batch_id is null;

  return exists (
    select 1 from public.edu_campus_arrival_live_reminders
      where event_id = p_event and phone = p_phone and consent_version = p_consent_version
  );
end;
$$;

-- The durable assignment is written before any outbound call. An interrupted or
-- ambiguous attempt is never made eligible for another outbound call.
create function public.edu_claim_campus_arrival_reminders(
  p_event text, p_consent_version smallint, p_cutoff timestamptz, p_batch uuid, p_limit integer
)
returns table(phone text)
language sql security invoker set search_path = '' as $$
  with candidates as materialized (
    select reminder.phone
    from public.edu_campus_arrival_live_reminders reminder
    where reminder.event_id = p_event
      and reminder.consent_version = p_consent_version
      and reminder.consented_at < p_cutoff
      and reminder.dispatch_batch_id is null
    order by reminder.consented_at, reminder.phone
    limit greatest(0, least(p_limit, 1000))
    for update skip locked
  ), batch as (
    insert into public.edu_campus_arrival_reminder_batches (id, event_id, recipient_count)
    select p_batch, p_event, count(*)::integer from candidates having count(*) > 0
    returning id
  )
  update public.edu_campus_arrival_live_reminders reminder
    set dispatch_batch_id = batch.id
    from candidates, batch
    where reminder.event_id = p_event and reminder.phone = candidates.phone
    returning reminder.phone;
$$;

create function public.edu_purge_campus_arrival_reminders(p_event text, p_consent_version smallint)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  result public.edu_campus_arrival_reminder_purges%rowtype;
begin
  insert into public.edu_campus_arrival_reminder_purges (event_id)
    values (p_event) on conflict (event_id) do nothing;
  if not found then
    select * into result from public.edu_campus_arrival_reminder_purges where event_id = p_event;
    return to_jsonb(result);
  end if;

  update public.edu_campus_arrival_reminder_batches
    set provider_group_id = null,
        status = case when status in ('claimed', 'accepted') then 'unknown' else status end,
        error_code = case status
          when 'claimed' then 'SUBMISSION_UNCONFIRMED'
          when 'accepted' then 'RECEIPT_UNCONFIRMED'
          else error_code
        end
    where event_id = p_event and (provider_group_id is not null or status in ('claimed', 'accepted'));

  with removed as (
    delete from public.edu_campus_arrival_live_reminders
      where event_id = p_event
      returning consent_version, dispatch_batch_id
  ), counts as (
    select count(*)::integer as total,
      (count(*) filter (where dispatch_batch_id is null and consent_version = p_consent_version))::integer as unsent
      from removed
  )
  update public.edu_campus_arrival_reminder_purges
    set removed_count = counts.total, eligible_unsent_count = counts.unsent
    from counts where event_id = p_event returning edu_campus_arrival_reminder_purges.* into result;

  return to_jsonb(result);
end;
$$;

revoke all on function public.edu_claim_campus_arrival_reminders(text, smallint, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.edu_purge_campus_arrival_reminders(text, smallint) from public, anon, authenticated;
revoke all on function public.edu_refresh_campus_arrival_reminder_consent(text, text, smallint)
  from public, anon, authenticated;
grant execute on function public.edu_claim_campus_arrival_reminders(text, smallint, timestamptz, uuid, integer)
  to service_role;
grant execute on function public.edu_purge_campus_arrival_reminders(text, smallint) to service_role;
grant execute on function public.edu_refresh_campus_arrival_reminder_consent(text, text, smallint) to service_role;

comment on table public.edu_campus_arrival_reminder_batches is
  'Moonshot live reminder delivery totals. No phone data. Provider group references are cleared with event phone deletion.';

notify pgrst, 'reload schema';

commit;
