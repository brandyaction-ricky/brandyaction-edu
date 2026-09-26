/** Only the stored, timezone-qualified cohort deadline is authoritative. */
export function recruitmentRemaining(endAt: unknown, now: number) {
  if (typeof endAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(endAt)) return null;
  const end = Date.parse(endAt);
  if (!Number.isFinite(end)) return null;
  const total = Math.max(0, Math.ceil((end - now) / 1000));
  const days = Math.floor(total / 86400);
  const time = [Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  return { expired: total === 0, text: `${days > 0 ? `${days}일 ` : ''}${time}` };
}
