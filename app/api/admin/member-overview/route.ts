import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
// A read-only projection of existing records. No progress or access rules live here.
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await getOperatorUser('members', user)) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams;
    const member = params.get('member'), view = params.get('view');
    const page = Number(params.get('page') || 1), pageSize = 20;
    if (!uuid(member) || !['enrollments', 'progress', 'submissions', 'questions'].includes(view || '') || !Number.isSafeInteger(page) || page < 1 || page > 100000) return reply({ error: '회원과 조회 조건을 확인해 주세요.' }, 400);
    const db = createAdminClient();
    const profile = await db.from('profiles').select('id').eq('id', member).neq('status', 'withdrawn').maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data) return reply({ error: '조회할 회원이 없거나 탈퇴한 회원입니다.' }, 404);
    const enrollment = 'enrollments!inner(user_id,course_id,cohort_id,courses(id,title),cohorts(id,name))';
    let query;
    if (view === 'enrollments') query = db.from('enrollments').select('id,course_id,cohort_id,status,access_starts_at,access_ends_at,created_at,courses(id,title),cohorts(id,name)', { count: 'exact' }).eq('user_id', member).order('created_at', { ascending: false });
    else if (view === 'progress') query = db.from('lesson_progress').select(`id,lesson_id,enrollment_id,progress_percent,completed_at,updated_at,curriculum_lessons(id,title,day_number),${enrollment}`, { count: 'exact' }).eq('enrollments.user_id', member).order('updated_at', { ascending: false });
    else if (view === 'submissions') query = db.from('mission_submissions').select(`id,enrollment_id,status,attempt_number,submitted_at,reviewed_at,reviewer_feedback,curriculum_missions(id,title),${enrollment}`, { count: 'exact' }).eq('enrollments.user_id', member).order('submitted_at', { ascending: false });
    else query = db.from('edu_questions').select('id,title,status,is_archived,created_at,updated_at,courses(id,title)', { count: 'exact' }).eq('user_id', member).order('created_at', { ascending: false });
    const result = await query.order('id').range((page - 1) * pageSize, page * pageSize - 1);
    if (result.error) throw result.error;
    return reply({ rows: result.data || [], total: result.count || 0, page, pageSize });
  } catch {
    return reply({ error: '회원 운영 정보를 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}
