import type { CampusSnapshot } from '../contracts';
import { campusError } from '../snapshot';
import { connectorOfficeTransition, learnerOfficeTransition, validateOfficeCommand, validateOfficeEvent, type OfficeState, type OfficeCommand, type OfficeEvent, type OfficeJob } from './domain';
export const emptyOfficeDemo = (): OfficeState => ({ jobs: [], history: [], connection: 'not_connected', demo: true });
export function mutateOfficeDemo(state: OfficeState, input: OfficeCommand, snapshot: CampusSnapshot, receipts: Map<string, string>): OfficeState {
  const c = validateOfficeCommand(input), fingerprint = JSON.stringify(c);
  if (receipts.has(c.requestId)) { if (receipts.get(c.requestId) !== fingerprint) campusError(409, '요청이 변경되었습니다.'); return state; }
  if (!snapshot.scopes.some(s => s.enrollmentId === c.enrollmentId)) campusError(403, '기수를 확인해 주세요.');
  const next = structuredClone(state), now = new Date().toISOString(); let job: OfficeJob;
  if (c.action === 'create') job = { id: c.requestId, owner_id: snapshot.viewer.id, enrollment_id: c.enrollmentId, objective: c.objective!, material_urls: c.materialUrls!, output_type: c.outputType!, status: 'awaiting_connection', revision: 1, draft_text: '', draft_url: '', review_note: '', error_note: '', created_at: now, updated_at: now };
  else {
    const original = next.jobs.find(j => j.id === c.jobId && j.owner_id === snapshot.viewer.id && j.enrollment_id === c.enrollmentId); if (!original) campusError(403, '내 작업만 확인할 수 있어요.');
    job = { ...original, status: learnerOfficeTransition(original, c), revision: original.revision + 1, review_note: c.note ?? '', updated_at: now };
  }
  next.jobs = [job, ...next.jobs.filter(j => j.id !== job.id)];
  next.history.unshift({ id: c.requestId, job_id: job.id, revision: job.revision, actor_type: 'learner', action: c.action, status: job.status, note: c.note ?? '', draft_text: '', created_at: now });
  receipts.set(c.requestId, fingerprint); return next;
}
export function receiveOfficeDemo(state: OfficeState, input: OfficeEvent): OfficeState {
  const event = validateOfficeEvent(input), next = structuredClone(state), job = next.jobs.find(j => j.id === event.jobId);
  if (!job) campusError(404, '작업을 찾을 수 없습니다.');
  const status = connectorOfficeTransition(job, event); job.status = status; job.revision++; job.updated_at = new Date().toISOString();
  if (event.event === 'draft') { job.draft_text = event.draftText!; job.draft_url = event.draftUrl ?? ''; }
  if (event.event === 'failed') job.error_note = event.note!;
  next.history.unshift({ id: `${job.id}:${job.revision}`, job_id: job.id, revision: job.revision, actor_type: 'connector', action: event.event, status, note: event.note ?? '', draft_text: event.draftText ?? '', created_at: job.updated_at });
  return next;
}
