import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const operator = await getOperatorUser('products');
  if (!operator) return reply({ error: '상품 관리 권한이 필요합니다.' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: '변경 내용을 확인해 주세요.' }, 400); }
  const changes = body.changes;
  if (!uuid(body.cohortId) || !Array.isArray(changes) || changes.length < 1 || changes.length > 400 ||
    changes.some(item => !item || typeof item !== 'object' || !['week', 'lesson'].includes(item.kind) || !uuid(item.id) || typeof item.expected !== 'boolean' || typeof item.published !== 'boolean') ||
    new Set(changes.map(item => `${item.kind}:${item.id}`)).size !== changes.length) {
    return reply({ error: '기수와 공개 변경 항목을 확인해 주세요.' }, 400);
  }
  const result = await createAdminClient().rpc('edu_save_cohort_curriculum_visibility', {
    p_actor: operator.id, p_cohort: body.cohortId, p_changes: changes,
  });
  if (result.error) {
    const stale = result.error.message.includes('COHORT_VISIBILITY_STALE');
    return reply({ error: stale ? '다른 곳에서 공개 범위를 바꿨습니다. 최신 상태를 다시 확인해 주세요.' : '기수별 공개 범위를 저장하지 못했습니다. 상품·기수·본문 공개 상태를 확인해 주세요.' }, stale ? 409 : 400);
  }
  return reply({ ok: true });
}
