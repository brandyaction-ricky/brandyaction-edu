import { DiagnosisBridgeError, type DiagnosisContext } from './diagnosis-bridge';
import { validDiagnosisReportContext, validateDiagnosisReport, type DiagnosisReport, type DiagnosisReportContext, type DiagnosisReportStatus } from './diagnosis-report';

type Dependencies = { actor: { id: string };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  send: (context: DiagnosisReportContext, action: 'status' | 'download') => Promise<DiagnosisReport> };

export async function runDiagnosisReport({ actor, rpc, send }: Dependencies, action: 'status' | 'download'):
  Promise<DiagnosisReportStatus & { markdown?: string }> {
  if (!['status','download'].includes(action)) throw new DiagnosisBridgeError('INVALID', 400);
  async function currentContext() {
    // This private function rechecks the active profile, enabled offer and current paid/manual grant.
    const { data, error } = await rpc('edu_diagnosis_context', { p_actor: actor.id });
    if (error) {
      const forbidden = (error as { message?: string }).message === 'DIAGNOSIS_FORBIDDEN';
      throw new DiagnosisBridgeError(forbidden ? 'FORBIDDEN' : 'UNAVAILABLE', forbidden ? 403 : 503);
    }
    if (!validDiagnosisReportContext(data as DiagnosisContext | null, actor.id)) throw new DiagnosisBridgeError('NOT_READY', 409);
    return data as DiagnosisReportContext;
  }
  const before = await currentContext();
  const report = validateDiagnosisReport(await send(before, action), before, action);
  // Do not release a result fetched while a refund, suspension or grant revocation was taking place.
  const after = await currentContext();
  if (before.subject !== after.subject || before.attemptId !== after.attemptId || before.responseId !== after.responseId
    || before.releaseId !== after.releaseId || before.packageVersion !== after.packageVersion)
    throw new DiagnosisBridgeError('FORBIDDEN', 403);
  validateDiagnosisReport(report, after, action);
  // Lost submit acknowledgments may leave the EDU revision behind MYIN's frozen revision; no new attempt is needed.
  return { state: report.state, updatedAt: report.updatedAt, canRetry: false, downloadAvailable: report.downloadAvailable,
    ...(action === 'download' ? { markdown: report.markdown } : {}) };
}
