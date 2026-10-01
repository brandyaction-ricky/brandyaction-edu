import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { hubBody, hubEnabled, hubError, hubFail, hubId, hubReply } from '@/lib/question-hub-server';
import { questionCategories, questionTitle } from '@/lib/question-hub';
import { assertParticipationOpen } from '@/lib/alumni-access-server';
async function actor() { hubEnabled(); const user = await getAuthenticatedUser(); if (!user) hubFail('로그인이 필요합니다.', 401); return user; }
export async function GET(request: Request) {
  try {
    const user = await actor(), params = new URL(request.url).searchParams, db = createAdminClient();
    const mode = params.get('mode') || 'mine', page = Number(params.get('page') || 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) hubFail('페이지를 확인해 주세요.');
    if (mode === 'shared') {
      const query = params.get('q') || ''; if (query.length > 1000) hubFail('검색어가 너무 깁니다.');
      const r = await db.rpc('edu_search_shared_answers', { p_actor: user.id, p_query: query, p_enrollment: hubId(params.get('enrollment'), true), p_lesson: hubId(params.get('lesson'), true), p_page: page });
      if (r.error) throw r.error; return hubReply(r.data);
    }
    const access = await db.rpc('edu_question_contexts', { p_actor: user.id });
    if (access.error) throw access.error;
    if (mode === 'contexts') return hubReply({ contexts: (access.data || []).map((c: { enrollment_id: string; lesson_id: string; label: string; recent: boolean }) => ({ enrollmentId: c.enrollment_id, lessonId: c.lesson_id, label: c.label, recent: c.recent })) });
    if (mode !== 'mine') hubFail('조회 항목을 확인해 주세요.');
    let read = db.from('edu_questions').select('id,title,content,answer,status,is_resolved,created_at,learning_context,image_id,sharing_requested,category').eq('user_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 20);
    const target = hubId(params.get('question'), true); if (target) read = read.eq('id', target);
    const r = await read;
    if (r.error) throw r.error; return hubReply({ questions: (r.data || []).slice(0, 20), hasMore: (r.data || []).length > 20 });
  } catch (e) { return hubError(e); }
}
export async function POST(request: Request) {
  try {
    const user = await actor(), body = await hubBody(request);
    if (typeof body.content !== 'string' || body.content.length > 10000 || typeof body.title !== 'string' || body.title.length > 200 || !Object.hasOwn(questionCategories, body.category) || typeof body.share !== 'boolean') hubFail('질문 내용을 확인해 주세요.');
    if (body.imageId && process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true') hubFail('이미지 첨부를 사용할 수 없습니다.');
    if (body.enrollmentId != null) {
      const enrollmentId = hubId(body.enrollmentId);
      if (!enrollmentId) hubFail('수강권을 확인해 주세요.');
      await assertParticipationOpen(user.id, enrollmentId);
    }
    const r = await createAdminClient().rpc('edu_create_hub_question', { p_actor: user.id, p_request: hubId(body.requestId), p_enrollment: hubId(body.enrollmentId, true), p_lesson: hubId(body.lessonId, true), p_title: questionTitle(body.content, body.title), p_content: body.content, p_image: hubId(body.imageId, true), p_category: body.category, p_share: body.share });
    if (r.error) throw r.error; return hubReply({ question: r.data });
  } catch (e) { return hubError(e); }
}
