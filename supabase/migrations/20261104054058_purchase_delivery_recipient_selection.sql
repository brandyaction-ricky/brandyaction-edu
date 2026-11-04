-- Keep provider-sized batches while presenting one reservation to the operator.
alter table public.edu_purchase_delivery_batches
  add column reservation_id uuid,
  drop constraint edu_purchase_delivery_batches_check,
  add constraint edu_purchase_delivery_message_check check (
    (channel = 'email' and template_id is null and subject is not null and template_hash is null)
    or (channel in ('sms', 'lms') and template_id is null and subject is null and template_hash is null and room_link is null)
    or (channel <> 'email' and template_id is not null and subject is null and template_hash is not null)
  );

create index edu_purchase_delivery_reservation_idx
  on public.edu_purchase_delivery_batches (cohort_id, reservation_id)
  where reservation_id is not null;

create view public.edu_purchase_delivery_reservations
with (security_invoker = true) as
select coalesce(reservation_id, id) as id, cohort_id,
  min(channel) as channel, min(subject) as subject, min(content) as content,
  sum(cardinality(recipient_ids))::integer as count,
  min(scheduled_at) as scheduled_at, min(created_at) as created_at,
  case
    when bool_and(status = 'scheduled') then 'scheduled'
    when bool_or(status in ('scheduled', 'sending')) then 'sending'
    when bool_or(status = 'unknown') then 'unknown'
    when bool_or(status = 'failed') then 'failed'
    when bool_and(status = 'cancelled') then 'cancelled'
    when bool_or(status = 'cancelled') then 'partially_cancelled'
    else 'completed'
  end as status,
  coalesce(sum(cardinality(recipient_ids)) filter (where status = 'scheduled'), 0)::integer as pending_count,
  sum(accepted_count)::integer as accepted_count,
  sum(failed_count)::integer as failed_count,
  sum(skipped_count)::integer as skipped_count,
  sum(unknown_count)::integer as unknown_count
from public.edu_purchase_delivery_batches
group by cohort_id, coalesce(reservation_id, id);

revoke all on public.edu_purchase_delivery_reservations from public, anon, authenticated;
grant select on public.edu_purchase_delivery_reservations to service_role;
