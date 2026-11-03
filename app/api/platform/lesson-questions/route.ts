import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(error: unknown) {
  const message = (error as { message?: string })?.message || '';
  if (message.includes('QUESTION_FORBIDDEN')) return reply({ error: '현재 수강할 수 있는 본인 학습에서만 질문할 수 있습니다.' }, 403);
  if (message.includes('QUESTION_REQUEST_REUSED')) return reply({ error: '등록 요청이 변경되었습니다. 화면을 다시 열어 주세요.' }, 409);
  if (message.includes('QUESTION_IMAGE_USED')) return reply({ error: '이미 다른 질문에 등록한 이미지입니다. 새로 첨부해 주세요.' }, 409);
  if (message.includes('QUESTION_IMAGE_INVALID')) return reply({ error: '첨부 이미지가 준비되지 않았습니다. 다시 올려 주세요.' }, 400);
  if (message.includes('QUESTION_INVALID')) return reply({ error: '질문 제목과 내용을 확인해 주세요.' }, 400);
  return reply({ error: '질문을 처리하지 못했습니다. 입력한 내용을 유지한 채 다시 시도해 주세요.' }, 503);
}
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const params = new URL(request.url).searchParams;
    const enrollment = params.get('enrollment'), lesson = params.get('lesson');
    if (!validId(enrollment) || !validId(lesson)) return reply({ error: '학습 정보를 확인해 주세요.' }, 400);
    const page = Number(params.get('page') || 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) return reply({ error: '페이지를 확인해 주세요.' }, 400);
    if (process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true') {
      const result = await createAdminClient().rpc('edu_read_cohort_questions', { p_actor: user.id, p_query: '', p_enrollment: enrollment, p_lesson: lesson, p_page: page, p_include_own: true });
      if (result.error) return failure(result.error);
      return reply(result.data);
    }
    const images = process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true';
    // Authenticated client retains RLS even if a student forges the URL.
    const db = await createClient();
    const { data, error } = await db.from('edu_questions')
      .select('id,title,content,answer,status,created_at,learning_context' + (images ? ',image_id' : ''))
      .eq('user_id', user.id).eq('enrollment_id', enrollment).eq('lesson_id', lesson).eq('is_archived', false)
      .order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 20);
    if (error) return failure(error);
    return reply({ questions: (data || []).slice(0,20), hasMore: (data || []).length > 20 });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    let body;
    try { body = await request.json(); } catch { return reply({ error: '질문 형식을 확인해 주세요.' }, 400); }
    const images = process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true';
    if (!body || (body.imageId != null && (!images || !validId(body.imageId))) || ![body.enrollmentId,body.lessonId,body.requestId].every(validId) || typeof body.title !== 'string' || typeof body.content !== 'string'
      || !body.title.trim() || body.title.trim().length > 200 || (!body.content.trim() && !body.imageId) || body.content.trim().length > 10000) return reply({ error: '질문 제목과 내용을 확인해 주세요.' }, 400);
    const { data, error } = await createAdminClient().rpc(images ? 'edu_create_lesson_question_with_image' : 'edu_create_lesson_question', {
      p_actor: user.id, p_request: body.requestId, p_enrollment: body.enrollmentId, p_lesson: body.lessonId, p_title: body.title.trim(), p_content: body.content.trim(), ...(images ? { p_image: body.imageId || null } : {}),
    });
    if (error) return failure(error);
    return reply({ question: data });
  } catch (error) { return failure(error); }
}
