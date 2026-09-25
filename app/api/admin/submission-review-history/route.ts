import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { reviewDecisions, reviewRecord } from '@/lib/submission-review';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await getOperatorUser('members', user)) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams;
    const id = params.get('submission'), page = Number(params.get('page') || 1), pageSize = 20;
    if (!uuid(id) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return reply({ error: '제출물과 조회 조건을 확인해 주세요.' }, 400);
    const db = createAdminClient();
    const submission = await db.from('mission_submissions').select('id,status,reviewed_at,reviewer_feedback').eq('id', id).maybeSingle();
    if (submission.error) throw submission.error;
    if (!submission.data) return reply({ error: '제출물을 찾을 수 없습니다.' }, 404);
    // Staff can access this narrow projection, never the admin-only audit table itself.
    const history = await db.from('audit_logs').select('id,actor_user_id,action,created_at,after_data', { count: 'exact' })
      .eq('entity_type', 'mission_submission').eq('entity_id', id)
      .in('action', reviewDecisions.map(decision => `mission_submission.${decision}`))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    if (history.error) throw history.error;
    const actorIds = [...new Set((history.data || []).map(row => row.actor_user_id).filter(Boolean))];
    const actors = actorIds.length ? await db.from('profiles').select('id,full_name').in('id', actorIds) : { data: [], error: null };
    if (actors.error) throw actors.error;
    const names = new Map((actors.data || []).map(row => [row.id, row.full_name]));
    const rows = (history.data || []).map(row => reviewRecord(row, names.get(row.actor_user_id) || '검토자 기록 없음')).filter(Boolean);
    const { id: submissionId, status, reviewed_at, reviewer_feedback } = submission.data;
    return reply({ rows, total: history.count || 0, page, pageSize, current: { id: submissionId, status, reviewed_at, reviewer_feedback } });
  } catch {
    return reply({ error: '검토 이력을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}
