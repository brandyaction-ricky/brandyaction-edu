import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { PUBLIC_CACHE_TAG } from '@/lib/public-platform-plan';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const errors: Record<string, [string, number]> = {
  LESSON_ORDER_FORBIDDEN: ['상품 관리 권한이 필요합니다.', 403],
  LESSON_ORDER_NOT_FOUND: ['상품 또는 주차가 삭제됐습니다. 커리큘럼을 다시 열어 주세요.', 404],
  LESSON_ORDER_INVALID: ['변경할 수업 목록을 확인해 주세요.', 400],
  LESSON_ORDER_CHANGED: ['다른 곳에서 수업이 변경됐습니다. 최신 순서를 불러온 뒤 다시 확인해 주세요.', 409],
};
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
    const actor = await getOperatorUser('products');
    if (!actor) return reply({ error: '상품 관리 권한이 필요합니다.' }, 403);
    // Bound the body before parsing; a client-supplied Content-Length is not trusted.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: '변경할 수업 목록을 확인해 주세요.' }, 400);
    const chunks: string[] = [], decoder = new TextDecoder(); let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 200_000) { await reader.cancel(); return reply({ error: '한 번에 최대 1,000개 수업을 정렬할 수 있습니다.' }, 413); }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(chunks.join('')); } catch { return reply({ error: '요청 형식을 확인해 주세요.' }, 400); }
    if (!body || !uuid(body.courseId) || !uuid(body.weekId) || !Array.isArray(body.ids)
      || body.ids.length < 2 || body.ids.length > 1000 || !body.ids.every(uuid) || new Set(body.ids).size !== body.ids.length
      || !Array.isArray(body.expected) || body.expected.length !== body.ids.length
      || !body.expected.every((row: { id?: unknown; day?: unknown; updatedAt?: unknown }) => row && uuid(row.id)
        && Number.isInteger(row.day) && Number(row.day) > 0 && Number(row.day) <= 2147483647
        && typeof row.updatedAt === 'string' && row.updatedAt.length <= 40 && Number.isFinite(Date.parse(row.updatedAt)))
      || new Set(body.expected.map((row: { id: string }) => row.id)).size !== body.ids.length
      || !body.expected.every((row: { id: string }) => body.ids.includes(row.id))) {
      return reply({ error: '변경할 수업 목록을 확인해 주세요.' }, 400);
    }
    const { data, error } = await createAdminClient().rpc('edu_admin_reorder_lessons', {
      p_actor: actor.id, p_course: body.courseId, p_week: body.weekId, p_ids: body.ids,
      p_expected_ids: body.expected.map((row: { id: string }) => row.id),
      p_expected_days: body.expected.map((row: { day: number }) => row.day),
      p_expected_updated_at: body.expected.map((row: { updatedAt: string }) => row.updatedAt),
    }).abortSignal(AbortSignal.timeout(15_000));
    if (error) {
      const known = errors[error.message];
      if (known) return reply({ error: known[0] }, known[1]);
      throw error;
    }
    revalidateTag(PUBLIC_CACHE_TAG, { expire: 0 });
    return reply({ ok: true, changed: data });
  } catch {
    return reply({ error: '저장 결과를 확인하지 못했습니다. 최신 순서를 다시 불러와 주세요.' }, 503);
  }
}
