import { DiagnosisBridgeError, type DiagnosisContext } from './diagnosis-bridge';
import type { DiagnosisSession } from './diagnosis-session';

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
type Dependencies = { actor: { id: string; full_name?: string | null; role?: string }; rpc: Rpc;
  send: (context: DiagnosisContext, command: Record<string, unknown>) => Promise<DiagnosisSession & { responseId: string }> };

export async function runDiagnosisSession({ actor, rpc, send }: Dependencies, input: unknown) {
  const invalid = () => { throw new DiagnosisBridgeError('INVALID', 400); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const body = input as Record<string, unknown>;
  const actions: Record<string, string[]> = { catalog: [], read: [], ensure: ['courseId'], restart: ['attemptId'], save: ['revision','answers','attemptId'], submit: ['revision','attemptId'] };
  const action = String(body.action);
  if (!Object.hasOwn(actions, action) || Object.keys(body).some(key => !['action', ...actions[action]].includes(key))) return invalid();
  if (['save','submit'].includes(action) && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0)) return invalid();
  if (action === 'save' && (!Array.isArray(body.answers) || body.answers.length > 200)) return invalid();
  if (body.attemptId !== undefined && !uuid(body.attemptId)) return invalid();
  if (action === 'restart' && actor.role !== 'admin') throw new DiagnosisBridgeError('FORBIDDEN', 403);
  async function call(name: string, args: Record<string, unknown>) {
    const r = await rpc(name, args);
    if (r.error) {
      const message = (r.error as { message?: string }).message;
      const code = message === 'DIAGNOSIS_FORBIDDEN' ? 'FORBIDDEN' : message === 'DIAGNOSIS_CONFLICT' ? 'CONFLICT' : 'UNAVAILABLE';
      throw new DiagnosisBridgeError(code, code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 503);
    }
    return r.data;
  }
  if (action === 'catalog') return { offers: await call('edu_diagnosis_available', { p_actor: actor.id }),
    current: await call('edu_diagnosis_read', { p_actor: actor.id }) };
  let context = await call('edu_diagnosis_context', { p_actor: actor.id }) as DiagnosisContext | null;
  if (action === 'ensure' && !context) {
    if (!uuid(body.courseId)) return invalid();
    await call('edu_diagnosis_begin', { p_actor: actor.id, p_course: body.courseId });
    context = await call('edu_diagnosis_context', { p_actor: actor.id }) as DiagnosisContext | null;
  }
  if (action === 'restart') {
    if (!uuid(body.attemptId)) return invalid();
    const restarted = await call('edu_diagnosis_restart', { p_actor: actor.id, p_attempt: body.attemptId }) as { id: string };
    context = await call('edu_diagnosis_context', { p_actor: actor.id }) as DiagnosisContext | null;
    if (context?.attemptId !== restarted.id) throw new DiagnosisBridgeError('CONFLICT', 409);
  }
  if (!context) {
    if (action !== 'read') throw new DiagnosisBridgeError('FORBIDDEN', 403);
    return { state: 'not_started', offers: await call('edu_diagnosis_available', { p_actor: actor.id }) };
  }
  if (context.adminTest && actor.role !== 'admin') throw new DiagnosisBridgeError('FORBIDDEN', 403);
  if (['save','submit'].includes(action) && ((context.adminTest && !body.attemptId) || (body.attemptId && body.attemptId !== context.attemptId))) throw new DiagnosisBridgeError('CONFLICT', 409);
  if (action === 'read' && !context.responseId) return { state: 'preparing', attemptId: context.attemptId, canRestart: actor.role === 'admin' && context.canRestart === true };

  const command = action === 'ensure' || action === 'restart'
    ? { action: 'ensure', ...(context.adminTest ? { adminTest: true } : {}), packageVersion: context.packageVersion, displayName: actor.full_name?.trim().slice(0,200) || '수강생' }
    : action === 'save' ? { action, revision: body.revision, answers: body.answers }
    : action === 'submit' ? { action, revision: body.revision } : { action: 'read' };
  const session = await send(context, command);
  const synced = await call('edu_diagnosis_sync_session', { p_actor: actor.id, p_attempt: context.attemptId,
    p_response: session.responseId, p_revision: session.revision, p_state: session.state });
  if (!synced) throw new DiagnosisBridgeError('CONFLICT', 409);
  // Source account IDs and the remote report identity never come from the browser.
  return { attemptId: context.attemptId, adminTest: context.adminTest === true, canRestart: actor.role === 'admin' && context.canRestart === true, state: session.state, revision: session.revision, answers: session.answers,
    submittedAt: session.submittedAt, needsReview: session.needsReview, survey: session.survey };
}
