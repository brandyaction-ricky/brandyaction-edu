import { DiagnosisBridgeError } from './diagnosis-bridge';
import { runDiagnosisReport } from './diagnosis-report-service';
import type { DiagnosisReport, DiagnosisReportAction, DiagnosisReportContext } from './diagnosis-report';

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type Job = { attemptId: string; userId: string; lease: string };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function diagnosisReadyPushEnabled(env: NodeJS.ProcessEnv = process.env) {
  return ['EDU_DIAGNOSIS_READY_PUSH_ENABLED', 'EDU_MYIN_DIAGNOSIS_ENABLED', 'EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED',
    'EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED', 'EDU_WEB_PUSH_ENABLED', 'NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED'].every(key => env[key] === 'true');
}
// Runs from cron, never from a visitor's open tab. Status reads never generate or reissue a report.
export async function pollDiagnosisReadyPush({ rpc, send, enabled, now = Date.now }: {
  rpc: Rpc; send: (context: DiagnosisReportContext, action: DiagnosisReportAction) => Promise<DiagnosisReport>;
  enabled: boolean; now?: () => number;
}) {
  const totals = { enabled, checked: 0, ready: 0, deferred: 0 };
  if (!enabled) return totals;
  const started = now();
  const claimed = await rpc('edu_claim_report_watches', { p_limit: 20 });
  if (claimed.error || !Array.isArray(claimed.data)) throw Error('REPORT_WATCH_UNAVAILABLE');
  const jobs: Job[] = claimed.data.filter((v: Job) => v && [v.attemptId, v.userId, v.lease].every(uuid)).slice(0, 20);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length && now() - started < 42_000) {
      const job = jobs[cursor++];
      let state: string;
      try {
        const report = await runDiagnosisReport({ actor: { id: job.userId }, send, rpc: async (name, args) => {
          const result = await rpc(name, args);
          // A concurrent admin retest must never consume the predecessor's notification lease.
          if (!result.error && name === 'edu_diagnosis_context' && (result.data as { attemptId?: string } | null)?.attemptId !== job.attemptId)
            throw new DiagnosisBridgeError('OBSOLETE', 409);
          return result;
        } }, 'status');
        state = report.state;
      } catch (error) {
        state = error instanceof DiagnosisBridgeError && error.code === 'OBSOLETE' ? 'obsolete'
          : error instanceof DiagnosisBridgeError && error.code === 'FORBIDDEN' ? 'access_denied' : 'unavailable';
      }
      try {
        const finished = await rpc('edu_finish_report_watch', { p_attempt: job.attemptId, p_lease: job.lease, p_state: state });
        if (finished.error || finished.data !== true) totals.deferred++;
        else { totals.checked++; if (state === 'ready') totals.ready++; }
      } catch { totals.deferred++; } // Lease expiry recovers a lost database response.
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, worker));
  totals.deferred += jobs.length - cursor;
  return totals;
}
