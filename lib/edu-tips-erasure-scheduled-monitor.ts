import { monitorErasureDeadlines } from './edu-tips-erasure-monitor';

type Rpc = (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
type Dependencies = { env: Record<string, string | undefined>; rpc: Rpc };

/** Persist a heartbeat after every authorized, configured scan. A failed write is not a successful check. */
export async function scheduledErasureMonitor(request: Request, deps: Dependencies) {
  const result = await monitorErasureDeadlines(request, deps);
  const body = await result.clone().json().catch(() => null);
  if (!body || !['no_overdue', 'overdue', 'check_unavailable'].includes(body.status)) return result;

  const environment = deps.env.NEXT_PUBLIC_APP_ENV === 'development' ? 'dev'
    : deps.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : null;
  if (!environment) return result;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const { error } = await deps.rpc('edu_tips_record_erasure_monitor_run', {
      p_environment: environment,
      p_status: body.status,
      p_checked_consumers: result.ok ? body.checked_consumers : 0,
      p_pending_overdue_requests: result.ok ? body.summary.pending_overdue_requests : 0,
      p_oldest_overdue_at: result.ok ? body.summary.oldest_overdue_at : null,
    }, controller.signal);
    if (error) throw new Error('Heartbeat failed');
  } catch {
    return Response.json({ status: 'check_unavailable', checked: false }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return result;
}
