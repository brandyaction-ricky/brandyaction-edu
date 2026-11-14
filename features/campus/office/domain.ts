import { campusError, isCampusId } from '../snapshot';
import { safeCommunityUrl } from '../community/domain';
export const officeOutputs = ['plan', 'copy', 'checklist', 'analysis'] as const;
export type OfficeOutput = typeof officeOutputs[number];
export type OfficeStatus = 'awaiting_connection' | 'queued' | 'running' | 'review' | 'approved' | 'revision_requested' | 'failed' | 'archived';
export const officeStatusLabels: Record<OfficeStatus, string> = { awaiting_connection: '연결 대기', queued: '요청 접수', running: '실행 중', review: '내 검토 필요', approved: '승인 완료', revision_requested: '수정 요청', failed: '실행 오류', archived: '숨김' };
export const outputLabels: Record<OfficeOutput, string> = { plan: '실행 계획', copy: '문구 초안', checklist: '점검 목록', analysis: '분석 정리' };
export type OfficeJob = { id: string; employee_id?: string | null; owner_id: string; enrollment_id: string; objective: string; material_urls: string[]; output_type: OfficeOutput; status: OfficeStatus; revision: number; draft_text: string; draft_url: string; review_note: string; error_note: string; created_at: string; updated_at: string };
export type OfficeHistory = { id: string; job_id: string; revision: number; actor_type: 'learner' | 'connector'; action: string; status: OfficeStatus; note: string; draft_text: string; created_at: string };
export type OfficeState = { jobs: OfficeJob[]; detail?:OfficeJob|null; next?:{before:string;id:string}|null; history: OfficeHistory[]; connection: 'not_connected' | 'incoming_adapter_registered'; demo: boolean };
export type OfficeCommand = { requestId: string; enrollmentId: string; action: 'create' | 'approve' | 'request_revision' | 'retry' | 'archive' | 'restore'; jobId?: string; expectedRevision?: number; objective?: string; materialUrls?: string[]; outputType?: OfficeOutput; note?: string };
export type OfficeEvent = { dispatchId?: string; jobId: string; expectedRevision: number; event: 'accepted' | 'started' | 'draft' | 'failed'; draftText?: string; draftUrl?: string; note?: string };
export type OfficeRegistration = { event: 'registered'; jobId: string; enrollmentId: string; objective: string; outputType: OfficeOutput };
export function validateOfficeRegistration(input: unknown): OfficeRegistration {
  if (!input || typeof input !== 'object' || Array.isArray(input)) campusError(400, 'Invalid registration');
  const r = input as OfficeRegistration;
  if (r.event !== 'registered' || !isCampusId(r.jobId) || !isCampusId(r.enrollmentId) || !officeOutputs.includes(r.outputType)) campusError(400, 'Invalid registration');
  return { event: 'registered', jobId: r.jobId, enrollmentId: r.enrollmentId, objective: text(r.objective, 10, 2000), outputType: r.outputType };
}
function text(v: unknown, min: number, max: number) { if (typeof v !== 'string' || v.trim().length < min || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) campusError(400, '입력 내용을 확인해 주세요.'); return v.trim(); }
export function validateOfficeCommand(input: unknown): OfficeCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) campusError(400, '요청 형식을 확인해 주세요.');
  const c = input as OfficeCommand;
  if (!isCampusId(c.requestId) || !isCampusId(c.enrollmentId) || !['create', 'approve', 'request_revision', 'retry', 'archive', 'restore'].includes(c.action)) campusError(400, '요청 형식을 확인해 주세요.');
  const out: OfficeCommand = { requestId: c.requestId, enrollmentId: c.enrollmentId, action: c.action };
  if (c.action === 'create') {
    out.objective = text(c.objective, 10, 2000);
    if (!officeOutputs.includes(c.outputType!) || !Array.isArray(c.materialUrls) || c.materialUrls.length > 5) campusError(400, '결과물 유형과 자료 링크를 확인해 주세요.');
    out.materialUrls = [...new Set(c.materialUrls.map(v => safeCommunityUrl(v, false)))]; out.outputType = c.outputType;
  } else {
    if (!isCampusId(c.jobId!) || !Number.isSafeInteger(c.expectedRevision) || c.expectedRevision! < 1) campusError(400, '최신 작업을 선택해 주세요.');
    out.jobId = c.jobId; out.expectedRevision = c.expectedRevision; out.note = text(c.note ?? '', c.action === 'request_revision' ? 5 : 0, 2000);
  }
  return out;
}
export function validateOfficeEvent(input: unknown): OfficeEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) campusError(400, 'Invalid event');
  const e = input as OfficeEvent;
  if (!isCampusId(e.jobId) || !Number.isSafeInteger(e.expectedRevision) || e.expectedRevision < 1 || !['accepted', 'started', 'draft', 'failed'].includes(e.event)) campusError(400, 'Invalid event');
  const out: OfficeEvent = { jobId: e.jobId, expectedRevision: e.expectedRevision, event: e.event };
  if(e.dispatchId!==undefined){if(!isCampusId(e.dispatchId))campusError(400,'Invalid dispatch');out.dispatchId=e.dispatchId;}
  if (e.event === 'draft') { out.draftText = text(e.draftText, 10, 10000); out.draftUrl = safeCommunityUrl(e.draftUrl); }
  out.note = text(e.note ?? '', e.event === 'failed' ? 5 : 0, 1000);
  return out;
}
export function learnerOfficeTransition(job: OfficeJob, command: OfficeCommand): OfficeStatus {
  if (job.revision !== command.expectedRevision) campusError(409, '작업 상태가 바뀌었습니다.');
  if (command.action === 'approve' && job.status === 'review' && job.draft_text.length >= 10) return 'approved';
  if (command.action === 'request_revision' && job.status === 'review') return 'revision_requested';
  if (command.action === 'retry' && job.status === 'failed') return 'awaiting_connection';
  if (command.action === 'archive' && ['awaiting_connection', 'review', 'approved', 'revision_requested', 'failed'].includes(job.status)) return 'archived';
  // The database returns a hidden job to the state it had before it was hidden. This practice copy keeps no
  // history of its own, so it returns to the nearest state it can tell from the job itself.
  if (command.action === 'restore' && job.status === 'archived') return job.draft_text.length >= 10 ? 'review' : 'awaiting_connection';
  return campusError(409, '현재 상태에서 할 수 없는 요청입니다.');
}
export function connectorOfficeTransition(job: OfficeJob, event: OfficeEvent): OfficeStatus {
  if (job.revision !== event.expectedRevision) campusError(409, 'Revision conflict');
  if (event.event === 'accepted' && ['awaiting_connection', 'revision_requested'].includes(job.status)) return 'queued';
  if (event.event === 'started' && job.status === 'queued') return 'running';
  if (event.event === 'draft' && job.status === 'running') return 'review';
  if (event.event === 'failed' && ['queued', 'running'].includes(job.status)) return 'failed';
  return campusError(409, 'Invalid transition');
}
