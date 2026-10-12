import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { questionDeletionReady } from '@/lib/question-deletion-server';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
// Read existing records under both product and member permissions. This does
// not grant access, change progress, or expose answers and submission bodies.
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const operator = await getOperatorUser('products', user);
    if (!operator?.permissions.members) return reply({ error: '상품과 회원 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams;
    const course = params.get('course'), cohort = params.get('cohort') || null, view = params.get('view') || 'students';
    const page = Number(params.get('page') || 1), pageSize = 20;
    if (!uuid(course) || (cohort && !uuid(cohort)) || !['students', 'missions', 'blocks', 'questions'].includes(view) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return reply({ error: '상품과 조회 조건을 확인해 주세요.' }, 400);
    const db = createAdminClient();
    const product = await db.from('courses').select('id').eq('id', course).is('archived_at', null).maybeSingle();
    if (product.error) throw product.error;
    if (!product.data) return reply({ error: '조회할 상품을 찾지 못했습니다.' }, 404);
    if (cohort) {
      const linked = await db.from('cohorts').select('id').eq('id', cohort).eq('course_id', course).maybeSingle();
      if (linked.error) throw linked.error;
      if (!linked.data) return reply({ error: '이 상품에 연결된 기수가 아닙니다.' }, 404);
    }
    const member = 'profiles:profiles!user_id!inner(id,full_name,status)';
    const enrollment = `enrollments!inner(id,user_id,course_id,cohort_id,${member},cohorts(id,name))`;
    let query;
    if (view === 'students') {
      query = db.from('enrollments').select(`id,user_id,course_id,cohort_id,status,created_at,${member},cohorts(id,name)`, { count: 'exact' }).eq('course_id', course).neq('profiles.status', 'withdrawn');
      if (cohort) query = query.eq('cohort_id', cohort);
      query = query.order('created_at', { ascending: false });
    } else if (view === 'questions') {
      query = db.from('edu_questions').select(`id,user_id,title,status,created_at,${member}${cohort ? ',enrollments!inner(cohort_id)' : ''}`, { count: 'exact' }).eq('course_id', course).neq('profiles.status', 'withdrawn').eq('is_archived', false);
      // Questions may be scoped to a cohort only through their recorded cohort,
      // never through a member's other enrollments.
      if (cohort) query = query.eq('enrollments.cohort_id', cohort);
      if (await questionDeletionReady(db)) query = query.is('deleted_at', null);
      query = query.order('created_at', { ascending: false });
    } else {
      query = view === 'missions'
        ? db.from('mission_submissions').select(`id,status,attempt_number,submitted_at,curriculum_missions(id,title),${enrollment}`, { count: 'exact' }).order('submitted_at', { ascending: false })
        : db.from('edu_lesson_block_submissions').select(`id,lesson_id,outcome,created_at,${enrollment}`, { count: 'exact' }).order('created_at', { ascending: false });
      query = query.eq('enrollments.course_id', course).neq('enrollments.profiles.status', 'withdrawn');
      if (cohort) query = query.eq('enrollments.cohort_id', cohort);
    }
    const result = await query.order('id').range((page - 1) * pageSize, page * pageSize - 1).abortSignal(AbortSignal.timeout(15000));
    if (result.error) throw result.error;
    return reply({ rows: result.data || [], total: result.count || 0, page, pageSize });
  } catch { return reply({ error: '상품 운영 정보를 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
