import { timingSafeEqual } from 'node:crypto';

const countKeys = [
  'total_requests', 'unpublished_requests', 'no_receipt_requests',
  'pending_overdue_requests', 'reported_late_requests', 'breach_history_requests',
  'awaiting_ack_requests', 'awaiting_global_verification_requests',
] as const;
type Counts = Record<(typeof countKeys)[number], number>;
type Summary = Counts & { oldest_overdue_at: string | null };
type Dependencies = {
  env: Record<string, string | undefined>;
  rpc: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const timestamp = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const response = (body: unknown, status: number) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
});

function parseReport(data: unknown, consumer: string, environment: string) {
  if (!object(data) || data.consumer_id !== consumer || data.environment !== environment
    || !timestamp(data.checked_at) || !object(data.summary)) throw new Error('Invalid report');
  const raw = data.summary;
  const counts = {} as Counts;
  for (const key of countKeys) {
    if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) throw new Error('Invalid count');
    counts[key] = raw[key] as number;
  }
  if (countKeys.some(key => counts[key] > counts.total_requests)
    || counts.unpublished_requests > counts.no_receipt_requests
    || counts.reported_late_requests > counts.breach_history_requests
    || counts.pending_overdue_requests > counts.breach_history_requests) throw new Error('Inconsistent counts');
  if (counts.pending_overdue_requests === 0 ? raw.oldest_overdue_at !== null
    : !timestamp(raw.oldest_overdue_at) || Date.parse(raw.oldest_overdue_at) >= Date.parse(data.checked_at)) {
    throw new Error('Invalid deadline');
  }
  return { checkedAt: data.checked_at, summary: { ...counts, oldest_overdue_at: raw.oldest_overdue_at } as Summary };
}

/** Internal cron adapter only. It records observations, never deletes or grants clearance. */
export async function monitorErasureDeadlines(request: Request, deps: Dependencies) {
  if (request.method !== 'GET') return new Response(null, {
    status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
  });
  const secret = deps.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return response({ status: 'unauthorized', checked: false }, 401);
  }
  if (deps.env.EDU_TIPS_ERASURE_MONITOR_ENABLED !== 'true') {
    return response({ status: 'disabled', checked: false }, 503);
  }
  const environment = deps.env.NEXT_PUBLIC_APP_ENV === 'development' ? 'dev'
    : deps.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : null;
  const consumers = (deps.env.EDU_TIPS_ERASURE_MONITOR_CONSUMERS ?? '').split(',').map(v => v.trim().toLowerCase());
  if (!environment || consumers.length > 8 || consumers.some(v => !uuid.test(v))
    || new Set(consumers).size !== consumers.length) {
    return response({ status: 'configuration_required', checked: false }, 503);
  }
  // Never let URL parameters alter the server-owned scope or hide an unchecked consumer.
  if (new URL(request.url).search) return response({ status: 'invalid_request', checked: false }, 400);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reports = await Promise.race([
      Promise.all(consumers.map(async consumer => {
        // Summary covers the entire ledger; do not fetch customer-level detail for a monitor.
        const { data, error } = await deps.rpc('edu_tips_check_erasure_deadlines', {
          p_consumer: consumer, p_limit: 1,
        }, controller.signal);
        if (error) throw new Error('Check failed');
        return parseReport(data, consumer, environment);
      })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Check timeout')); }, 10_000);
      }),
    ]);
    const counts = Object.fromEntries(countKeys.map(key => [key, 0])) as Counts;
    let oldest: string | null = null;
    for (const { summary } of reports) {
      for (const key of countKeys) {
        counts[key] += summary[key];
        if (!Number.isSafeInteger(counts[key])) throw new Error('Count overflow');
      }
      if (summary.oldest_overdue_at && (!oldest || Date.parse(summary.oldest_overdue_at) < Date.parse(oldest))) {
        oldest = summary.oldest_overdue_at;
      }
    }
    return response({
      status: counts.pending_overdue_requests ? 'overdue' : 'no_overdue', checked: true,
      environment, checked_consumers: reports.length,
      checked_from: reports.reduce((a, r) => Date.parse(a) < Date.parse(r.checkedAt) ? a : r.checkedAt, reports[0].checkedAt),
      checked_until: reports.reduce((a, r) => Date.parse(a) > Date.parse(r.checkedAt) ? a : r.checkedAt, reports[0].checkedAt),
      count_unit: 'consumer_request_pairs',
      summary: { ...counts, oldest_overdue_at: oldest },
      // These waits can coexist. None means remote physical deletion has been proven.
      signals: {
        awaiting_receipt: counts.no_receipt_requests > 0,
        awaiting_ack: counts.awaiting_ack_requests > 0,
        awaiting_global_verification: counts.awaiting_global_verification_requests > 0,
        historical_breach: counts.breach_history_requests > 0,
      },
    }, 200);
  } catch {
    // A partial scan must not look like a healthy complete scan. Never echo DB errors or IDs.
    return response({ status: 'check_unavailable', checked: false }, 503);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
