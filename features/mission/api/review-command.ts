import type { MissionDatabase } from '../infrastructure/access';
import { uuid } from '@/lib/edu-workflows';
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export async function reviewMissionSubmissions(db: MissionDatabase, actor: string, body: Record<string, unknown>) {
    if (!['approved', 'changes_requested', 'rejected'].includes(String(body.decision)))
        fail('검토 결과를 선택해 주세요.');
    const feedback = String(body.feedback || '').trim();
    if (feedback.length > 2000)
        fail('입력 내용이 너무 깁니다.');
    if (body.decision !== 'approved' && !feedback)
        fail('보완·반려 사유를 입력해 주세요.');
    const ids = body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(uuid) || new Set(ids).size !== ids.length)
        fail('대상을 최대 50개까지 선택해 주세요.');
    return db.rpc('review_mission_submissions', { p_actor: actor, p_ids: ids, p_decision: body.decision, p_feedback: feedback });
}
export async function archiveMissionDefinitions(db: MissionDatabase, actor: string, ids: string[]) {
    return db.rpc('archive_mission_definitions', { p_actor: actor, p_ids: [...new Set(ids)] });
}
