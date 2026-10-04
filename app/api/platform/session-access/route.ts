import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { hasLearningAccess } from '@/lib/platform-rules';
import { safeUrl } from '@/lib/platform';
import { uuid } from '@/lib/edu-workflows';
import { recordLearningUsage } from '@/lib/learning-usage-server';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedUser();
    if (!actor) return reply('로그인이 필요합니다.', 401);
    const params = new URL(request.url).searchParams, sessionId = params.get('session'), type = params.get('type');
    if (!uuid(sessionId) || !['live_join','replay_view','material_download'].includes(type || '') || (params.has('enrollment') && !uuid(params.get('enrollment')))) return reply('수업과 이용 항목을 확인해 주세요.', 400);
    const db = createAdminClient();
    const session = await db.from('cohort_sessions').select('id,cohort_id,is_public').eq('id', sessionId).eq('is_public', true).maybeSingle();
    if (session.error) throw session.error;
    if (!session.data) return reply('공개된 수업이 아닙니다.', 404);
    let enrollments = db.from('enrollments').select('id,status,revoked_at,access_starts_at,access_ends_at').eq('user_id', actor.id).eq('cohort_id', session.data.cohort_id);
    if (params.has('enrollment')) enrollments = enrollments.eq('id', params.get('enrollment'));
    const enrolled = await enrollments.order('id').limit(20);
    if (enrolled.error) throw enrolled.error;
    const enrollment = enrolled.data?.find(entry => hasLearningAccess(entry));
    if (!enrollment && actor.role !== 'admin') return reply('이 수업의 수강 권한이 필요합니다.', 403);
    const content = await db.from('cohort_session_contents').select('live_url,replay_url,resource_storage_path').eq('session_id', sessionId).maybeSingle();
    if (content.error) throw content.error;
    let url = '';
    if (type === 'material_download') {
      if (!content.data?.resource_storage_path) return reply('자료가 아직 등록되지 않았습니다.', 404);
      const signed = await db.storage.from('course-resources').createSignedUrl(content.data.resource_storage_path, 60, { download: true });
      if (signed.error || !signed.data) return reply('자료를 준비하지 못했습니다. 다시 시도해 주세요.', 503);
      url = signed.data.signedUrl;
    } else url = safeUrl(type === 'live_join' ? content.data?.live_url : content.data?.replay_url);
    if (!url) return reply('입장 주소가 아직 등록되지 않았습니다.', 404);
    if (enrollment) await recordLearningUsage(actor, enrollment.id, type as 'live_join' | 'replay_view' | 'material_download', sessionId!);
    return new Response(null, { status: 303, headers: { ...headers, Location: url } });
  } catch { return reply('수업을 열지 못했습니다. 잠시 후 다시 시도해 주세요.', 503); }
}

// HEAD probes are not learner entry clicks.
export function HEAD() { return new Response(null, { status: 405, headers: { Allow: 'GET', ...headers } }); }
