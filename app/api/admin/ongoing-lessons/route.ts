import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { publicLessonBlocks, validateLessonBlocks } from '@/lib/lesson-blocks';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function id(value: string | null) { if (!uuid(value)) fail('학습과 참여 기록을 확인해 주세요.'); return value!; }
export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedUser();
    if (!actor) fail('로그인이 필요합니다.', 401);
    if (!await getOperatorUser('members', actor)) fail('회원 기록을 볼 권한이 필요합니다.', 403);
    const q = new URL(request.url).searchParams, db = createAdminClient(), action = q.get('action') || 'list';
    if (action === 'options') {
      const result = await db.rpc('edu_ongoing_review_options', { p_actor: actor.id }); if (result.error) throw result.error; return reply({ lessons: result.data });
    }
    if (action === 'list') {
      const scope = q.get('scope') || 'current', state = q.get('state') || '', page = Number(q.get('page') || 1);
      if (!['current', 'all'].includes(scope) || !['', 'completed', 'draft'].includes(state) || !Number.isInteger(page) || page < 1 || page > 100000) fail('목록 조건을 확인해 주세요.');
      const result = await db.rpc('edu_list_ongoing_reviews', { p_actor: actor.id, p_lesson: q.get('lesson') ? id(q.get('lesson')) : null, p_scope: scope, p_state: state, p_page: page });
      if (result.error) throw result.error; return reply(result.data);
    }
    if (!['detail', 'file'].includes(action)) fail('조회할 내용을 확인해 주세요.');
    const period = q.get('period'), snapshot = q.get('snapshot') || 'latest';
    if (!period || !/^\d{4}-\d\d-\d\dT/.test(period) || period.length > 50 || !Number.isFinite(Date.parse(period)) || !['latest', 'completed'].includes(snapshot)) fail('조회할 기간과 답변을 확인해 주세요.');
    const args = { p_actor: actor.id, p_lesson: id(q.get('lesson')), p_enrollment: id(q.get('enrollment')), p_period: new Date(period).toISOString(), p_completed: snapshot === 'completed' };
    if (action === 'detail') {
      const result = await db.rpc('edu_read_ongoing_review', args); if (result.error) throw result.error;
      return reply({ ...result.data, document: publicLessonBlocks(validateLessonBlocks(result.data.document)) });
    }
    const kind = q.get('kind'); if (!['answer', 'content'].includes(kind || '')) fail('자료 종류를 확인해 주세요.');
    const result = await db.rpc('edu_read_ongoing_review_file', { ...args, p_file: id(q.get('file')), p_kind: kind }); if (result.error) throw result.error;
    const file = result.data;
    if (!file || !['lesson-answer-files', 'lesson-content-media'].includes(file.bucket)) throw new Error('Invalid file receipt');
    const signed = await db.storage.from(file.bucket).createSignedUrl(file.path, 60, { download: file.kind === 'file' || q.get('download') === '1' ? file.name : false });
    if (signed.error) throw signed.error;
    return new Response(null, { status: 303, headers: { ...headers, Location: signed.data.signedUrl } });
  } catch (error) {
    const e = error as { message?: string; status?: number };
    if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
    const known: Record<string, [string, number]> = { BLOCK_FORBIDDEN: ['회원 기록을 볼 권한이 없습니다.', 403], BLOCK_NOT_FOUND: ['참여 기록이나 연결된 자료를 찾지 못했습니다.', 404], BLOCK_INVALID: ['조회 조건을 확인해 주세요.', 400] };
    const result = known[e.message || ''];
    return result ? reply({ error: result[0] }, result[1]) : reply({ error: '참여 기록을 불러오지 못했습니다. 다시 확인해 주세요.' }, 503);
  }
}
