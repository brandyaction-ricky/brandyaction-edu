type RawStatus = {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status: 'no_overdue' | 'overdue' | 'check_unavailable' | null;
  checked_consumers: number | null;
  pending_overdue_requests: number | null;
  oldest_overdue_at: string | null;
};

const validTime = (v: unknown) => v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));

/** The dashboard read catches a missing cron invocation; the cron itself cannot. */
export function classifyErasureMonitorStatus(raw: unknown, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid monitor status');
  const row = raw as RawStatus;
  if (!validTime(row.last_attempt_at) || !validTime(row.last_success_at)
    || !validTime(row.oldest_overdue_at)
    || ![null, 'no_overdue', 'overdue', 'check_unavailable'].includes(row.last_status)
    || (row.pending_overdue_requests !== null && (!Number.isSafeInteger(row.pending_overdue_requests) || row.pending_overdue_requests < 0))
    || (row.checked_consumers !== null && (!Number.isSafeInteger(row.checked_consumers) || row.checked_consumers < 0 || row.checked_consumers > 8))) {
    throw new Error('Invalid monitor status');
  }
  const state = !row.last_attempt_at ? 'not_started'
    : now - Date.parse(row.last_attempt_at) > 90 * 60_000
      || Date.parse(row.last_attempt_at) - now > 5 * 60_000 ? 'stale'
      : row.last_status === 'check_unavailable' ? 'check_failed'
        : row.last_status === 'overdue' ? 'overdue' : 'ok';
  return {
    state, lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
    checkedConsumers: row.checked_consumers, pendingOverdueRequests: row.pending_overdue_requests,
    oldestOverdueAt: row.oldest_overdue_at,
  };
}
