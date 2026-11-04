import { campusError, isCampusId } from '../snapshot';
import type { CommunityPost } from './domain';
export const exchangeLabels = { proposed: '응답 대기', accepted: '함께 작업 중', declined: '제안 거절', submitted: '완료 확인 대기', completed: '서로 완료 확인', canceled: '제안 취소' };
export type Exchange = { id: string; post_id: string; cohort_id: string; proposer_id: string; recipient_id: string; alias: string; proposal: string; result_note: string; status: keyof typeof exchangeLabels; revision: number; created_at: string };
export const slotLabels = { scheduled: '발표 예정', presenting: '발표 중', finished: '발표 종료', canceled: '예약 취소' };
export type DemoSlot = { id: string; post_id: string; cohort_id: string; presenter_id: string; starts_at: string; minutes: number; status: keyof typeof slotLabels; revision: number; created_at: string };
export type DemoQuestion = { id: string; slot_id: string; author_id: string; alias: string; body: string; answer: string; revision: number; answered_at: string | null; created_at: string };
export type FlowHistory = { id: string; post_id: string; entity_id: string; kind: 'exchange' | 'demo'; actor_id: string; action: string; status: string; note: string; revision: number; created_at: string };
export type FlowState = { exchanges: Exchange[]; slots: DemoSlot[]; questions: DemoQuestion[]; history: FlowHistory[]; operator: boolean };
export type FlowAction = 'exchange_propose' | 'exchange_accept' | 'exchange_decline' | 'exchange_submit' | 'exchange_complete' | 'exchange_cancel' | 'demo_reserve' | 'demo_start' | 'demo_finish' | 'demo_cancel' | 'demo_ask' | 'demo_answer';
export type FlowCommand = { requestId: string; postId: string; action: FlowAction; entityId?: string; questionId?: string; expectedRevision?: number; note?: string; alias?: string; startsAt?: string; minutes?: number };
export function validateFlowCommand(input: unknown): FlowCommand {
 if (!input || typeof input !== 'object' || Array.isArray(input)) campusError(400, '입력 내용을 확인해 주세요.');
 const c = input as FlowCommand;
 if (!isCampusId(c.requestId) || !isCampusId(c.postId) || !['exchange_propose','exchange_accept','exchange_decline','exchange_submit','exchange_complete','exchange_cancel','demo_reserve','demo_start','demo_finish','demo_cancel','demo_ask','demo_answer'].includes(c.action)) campusError(400, '요청을 확인해 주세요.');
 const out: FlowCommand = { requestId: c.requestId, postId: c.postId, action: c.action };
 if (!['exchange_propose','demo_reserve'].includes(c.action)) { if (!isCampusId(c.entityId ?? '')) campusError(400, '대상을 선택해 주세요.'); out.entityId = c.entityId; }
 if (!['exchange_propose','demo_reserve','demo_ask'].includes(c.action)) { if (!Number.isSafeInteger(c.expectedRevision) || c.expectedRevision! < 1) campusError(400, '현재 상태를 확인해 주세요.'); out.expectedRevision = c.expectedRevision; }
 if (c.action === 'demo_answer') { if (!isCampusId(c.questionId ?? '')) campusError(400, '질문을 선택해 주세요.'); out.questionId = c.questionId; }
 if (c.action !== 'demo_reserve') { if (typeof c.note !== 'string' || c.note.trim().length < (c.action === 'exchange_propose' ? 10 : 5) || c.note.length > 2000) campusError(400, '구체적인 내용과 이유를 적어 주세요.'); out.note = c.note.trim(); }
 if (['exchange_propose','demo_ask'].includes(c.action)) { if (typeof c.alias !== 'string' || c.alias.trim().length < 2 || c.alias.length > 24) campusError(400, '표시할 별명을 적어 주세요.'); out.alias = c.alias.trim(); }
 if (c.action === 'demo_reserve') { const t = Date.parse(c.startsAt ?? ''); if (!Number.isFinite(t) || !Number.isInteger(c.minutes) || c.minutes! < 5 || c.minutes! > 30) campusError(400, '발표 시간과 길이를 선택해 주세요.');out.startsAt = new Date(t).toISOString();out.minutes = c.minutes; }
 return out;
}
export const emptyFlowState = (): FlowState => ({ exchanges: [], slots: [], questions: [], history: [], operator: false });
export function mutateFlowDemo(state: FlowState, input: FlowCommand, post: CommunityPost, actor: string, operator = false): FlowState {
 const c = validateFlowCommand(input), next = structuredClone(state), now = new Date().toISOString(); let entityId = '', status = '', revision = 1;
 if (post.id !== c.postId || post.visibility !== 'cohort' || post.hidden) campusError(403, '기수에 공유된 작업물만 선택해 주세요.');
 if (c.action === 'exchange_propose') {
  if (post.owner_id === actor || !post.kind.startsWith('talent_')) campusError(403, '다른 동료에게 제안해 주세요.');
  if (next.exchanges.some(x => x.proposer_id === actor && ['proposed','accepted','submitted'].includes(x.status))) campusError(409, '진행 중인 제안이 있어요.');
  next.exchanges.unshift({ id: c.requestId, post_id: post.id, cohort_id: post.cohort_id, proposer_id: actor, recipient_id: post.owner_id, alias: c.alias!, proposal: c.note!, result_note: '', status: 'proposed', revision: 1, created_at: now }); entityId = c.requestId; status = 'proposed';
 } else if (c.action.startsWith('exchange_')) {
  const x = next.exchanges.find(x => x.id === c.entityId); if (!x || ![x.proposer_id,x.recipient_id].includes(actor)) campusError(403, '교환 참여자만 바꿀 수 있어요.');
  if (x.revision !== c.expectedRevision) campusError(409, '최신 상태를 확인해 주세요.');
  const target = actor === x.recipient_id && x.status === 'proposed' ? ({exchange_accept:'accepted',exchange_decline:'declined'} as const)[c.action as 'exchange_accept'] : actor === x.proposer_id && x.status === 'accepted' && c.action === 'exchange_submit' ? 'submitted' : actor === x.recipient_id && x.status === 'submitted' && c.action === 'exchange_complete' ? 'completed' : actor === x.proposer_id && x.status === 'proposed' && c.action === 'exchange_cancel' ? 'canceled' : null;
  if (!target) campusError(409, '이 상태에서는 처리할 수 없어요.'); x.status = target;x.revision++;if(c.action==='exchange_submit')x.result_note=c.note!;entityId=x.id;status=x.status;revision=x.revision;
 } else if (c.action === 'demo_reserve') {
  if (actor !== post.owner_id || post.kind !== 'demo_day') campusError(403, '내 발표 결과물을 선택해 주세요.');
  const start=Date.parse(c.startsAt!),end=start+c.minutes!*60000;
  if(start<Date.now() || start>Date.now()+90*86400000 || next.slots.some(s=>['scheduled','presenting'].includes(s.status)&&(s.post_id===post.id||Date.parse(s.starts_at)<end&&Date.parse(s.starts_at)+s.minutes*60000>start)))campusError(409,'겹치지 않는 미래 시간을 선택해 주세요.');
  next.slots.push({id:c.requestId,post_id:post.id,cohort_id:post.cohort_id,presenter_id:actor,starts_at:c.startsAt!,minutes:c.minutes!,status:'scheduled',revision:1,created_at:now});entityId=c.requestId;status='scheduled';
 } else {
  const s=next.slots.find(s=>s.id===c.entityId);if(!s||s.post_id!==post.id)campusError(403,'발표를 선택해 주세요.');entityId=s.id;status=s.status;revision=s.revision;
  if(c.action==='demo_ask'){if(!['scheduled','presenting'].includes(s.status))campusError(409,'질문 접수가 끝났어요.');next.questions.push({id:c.requestId,slot_id:s.id,author_id:actor,alias:c.alias!,body:c.note!,answer:'',revision:1,answered_at:null,created_at:now});}
  else if(c.action==='demo_answer'){const q=next.questions.find(q=>q.id===c.questionId&&q.slot_id===s.id);if(!q||s.presenter_id!==actor)campusError(403,'발표자만 답변할 수 있어요.');if(q.revision!==c.expectedRevision)campusError(409,'최신 질문을 확인해 주세요.');q.answer=c.note!;q.revision++;q.answered_at=now;revision=q.revision;}
  else {if(s.revision!==c.expectedRevision)campusError(409,'최신 발표를 확인해 주세요.');if(!operator&&!(c.action==='demo_cancel'&&s.presenter_id===actor))campusError(403,'진행자 권한이 필요해요.');const target=c.action==='demo_start'&&s.status==='scheduled'?'presenting':c.action==='demo_finish'&&s.status==='presenting'?'finished':c.action==='demo_cancel'&&s.status==='scheduled'?'canceled':null;if(!target||target==='presenting'&&next.slots.some(row=>row.status==='presenting'))campusError(409,'진행 상태를 확인해 주세요.');s.status=target;s.revision++;status=s.status;revision=s.revision;}
 }
 next.history.unshift({id:c.requestId,post_id:post.id,entity_id:entityId,kind:c.action.startsWith('exchange_')?'exchange':'demo',actor_id:actor,action:c.action,status,note:c.note??'',revision,created_at:now});return next;
}
