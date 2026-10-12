import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { hubBody } from '@/lib/question-hub-server';
import { lessonQaAnchors, qaPlainText } from '@/lib/lesson-qa';
import { validateAuthorPayload } from '@/lib/lesson-author-drafts';
import { revalidateTag } from 'next/cache';
import { PUBLIC_CACHE_TAG } from '@/lib/public-platform-plan';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
async function actor() {
  const user = await getOperatorUser('products');
  if (!user?.permissions.members) throw Object.assign(new Error('상품과 회원 관리 권한이 필요합니다.'), { status: 403 });
  return user;
}
function failure(error: unknown) {
  const e = error as { message?: string; status?: number };
  const known: Record<string, string> = {
    QA_CHANGED: '질문·답변·수업 버전이 바뀌었습니다. 최신 내용을 다시 확인해 주세요.',
    QA_ANCHOR_CHANGED: '삽입할 설명 단락이 바뀌었습니다. 위치를 다시 선택해 주세요.',
    QA_DUPLICATE: '이 질문은 이미 수업에 반영했습니다. 같은 질문을 중복 게시하지 않습니다.',
    QA_DRAFT_PENDING: '이 수업에는 다른 편집 초안이 있습니다. 기존 초안을 확인한 뒤 진행해 주세요.',
    QA_NOT_FOUND: '공개된 수업에 연결된 질문인지 확인해 주세요.',
    QA_INVALID: '공개할 내용과 삽입 위치를 확인해 주세요.',
    QA_FORBIDDEN: '상품과 회원 관리 권한이 필요합니다.',
    AUTHOR_CHANGED: '다른 수업 초안이 저장됐습니다. 최신 상태를 확인해 주세요.',
    AUTHOR_PUBLIC_CHANGED: '학생 공개본이 바뀌었습니다. 다시 검토해 주세요.',
    QUESTION_CHANGED: '새 답변이 등록됐습니다. 질문을 다시 확인해 주세요.',
  };
  if (e.status) return reply({ error: e.message }, e.status);
  if (e.message && known[e.message]) return reply({ error: known[e.message] }, e.message === 'QA_FORBIDDEN' ? 403 : 409);
  return reply({ error: '검토 기능 연결을 확인하지 못했습니다. 작성한 내용을 보관하고 다시 확인해 주세요.' }, 503);
}
export async function GET(request: Request) {
  try {
    const user = await actor(), q = new URL(request.url).searchParams;
    if (!uuid(q.get('question'))) return reply({ error: '질문을 확인해 주세요.' }, 400);
    const { data, error } = await createAdminClient().rpc('edu_read_lesson_qa', { p_actor: user.id, p_question: q.get('question') });
    if (error) throw error;
    return reply({ lessonId: data.lessonId, lessonTitle: data.payload.form.basic.title, questionStamp: data.questionStamp,
      publicStamp: data.publicStamp, authorHead: data.authorHead, draftPending: data.draftPending, applied: data.applied,
      cohorts: data.cohorts, cohortStamp: data.cohortStamp, anchors: lessonQaAnchors(data.payload), canPublish: process.env.EDU_LESSON_QA_PUBLICATION_ENABLED === 'true' });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await actor(), body = await hubBody(request), db = createAdminClient();
    if (body.action === 'prepare') {
      if (!uuid(body.questionId) || !uuid(body.requestId) || !hash(body.questionStamp) || !hash(body.publicStamp) || !hash(body.cohortStamp) || (body.authorHead !== null && !uuid(body.authorHead)) || typeof body.blockId !== 'string' || body.blockId.length > 100 || !Number.isInteger(body.node) || body.node < -1 || body.node > 20000) return reply({ error: '질문 버전과 삽입 위치를 확인해 주세요.' }, 400);
      let title: string, answer: string;
      try { title = qaPlainText(body.title, 200); answer = qaPlainText(body.answer, 10000); }
      catch (error) { return reply({ error: (error as Error).message }, 400); }
      const { data, error } = await db.rpc('edu_prepare_lesson_qa', { p_actor: user.id, p_question: body.questionId, p_request: body.requestId,
        p_question_stamp: body.questionStamp, p_public_stamp: body.publicStamp, p_cohort_stamp: body.cohortStamp, p_author_head: body.authorHead,
        p_block: body.blockId, p_node: body.node, p_title: title, p_answer: answer });
      if (error) throw error;
      return reply(data);
    }
    if (body.action !== 'approve' || !uuid(body.planId) || !hash(body.digest) || body.privacyReviewed !== true || body.allCohortsReviewed !== true) return reply({ error: '고정된 검토본과 개인정보·모든 기수 영향 확인이 필요합니다.' }, 400);
    if (process.env.EDU_LESSON_QA_PUBLICATION_ENABLED !== 'true') return reply({ error: '검토본 준비까지 사용할 수 있습니다. 실제 답변·수업 반영은 별도 승인 후 열립니다.' }, 409);
    const plan = await db.from('edu_lesson_qa_plans').select('payload,digest,created_by').eq('id', body.planId).maybeSingle();
    if (plan.error) throw plan.error;
    if (!plan.data || plan.data.created_by !== user.id || plan.data.digest !== body.digest) return reply({ error: '검토본을 다시 확인해 주세요.' }, 409);
    try { validateAuthorPayload(plan.data.payload, true); } catch (error) { return reply({ error: (error as Error).message }, 400); }
    const { data, error } = await db.rpc('edu_apply_lesson_qa', { p_actor: user.id, p_plan: body.planId, p_digest: body.digest });
    if (error) throw error;
    revalidateTag(PUBLIC_CACHE_TAG, { expire: 0 });
    return reply(data);
  } catch (error) { return failure(error); }
}
