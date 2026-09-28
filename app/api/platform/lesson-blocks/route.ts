import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { assessBlockCompletion, gradeBlockQuiz, publicLessonBlocks, validateBlockAnswers, validateLessonBlocks } from '@/lib/lesson-blocks';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function requiredId(value: unknown): string { if (!uuid(value)) fail('학습과 저장 요청을 확인해 주세요.'); return value as string; }
function optionalId(value: unknown) { return value == null ? null : requiredId(value); }
async function readBody(request: Request) {
  const maximum = 2_100_000;
  if (Number(request.headers.get('content-length')) > maximum) fail('입력 내용이 너무 큽니다.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('입력 형식을 확인해 주세요.');
  const decoder = new TextDecoder(), pieces: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); fail('입력 내용이 너무 큽니다.', 413); }
      pieces.push(decoder.decode(value, { stream: true }));
    }
    pieces.push(decoder.decode());
  } finally { reader.releaseLock(); }
  try { return JSON.parse(pieces.join('')); } catch { fail('입력 형식을 확인해 주세요.'); }
}
function failure(error: unknown) {
  const e = error as { status?: number; message?: string };
  const known: Record<string, [string, number]> = {
    BLOCK_FORBIDDEN: ['이 학습에 접근할 권한이 없습니다.', 403],
    BLOCK_NOT_FOUND: ['학습 내용을 찾을 수 없습니다.', 404],
    BLOCK_CONTENT_CHANGED: ['수업 내용이 변경되었습니다. 작성한 답변은 보관하고 최신 수업을 다시 열어 주세요.', 409],
    BLOCK_DRAFT_CHANGED: ['다른 화면에서 답변을 저장했습니다. 현재 입력을 보관하고 저장된 답변을 확인해 주세요.', 409],
    BLOCK_REQUEST_REUSED: ['이미 사용한 저장 요청입니다. 내용을 확인한 뒤 다시 저장해 주세요.', 409],
    BLOCK_INVALID: ['저장할 내용을 확인해 주세요.', 400],
    BLOCK_ALREADY_SUBMITTED: ['이미 제출한 답변입니다. 제출 기록을 다시 확인해 주세요.', 409],
    BLOCK_REVIEW_CHANGED: ['제출 상태가 바뀌었습니다. 최신 답변과 검토 결과를 다시 확인해 주세요.', 409],
    BLOCK_LESSON_LOCKED: ['아직 열리지 않은 학습입니다. 이전 학습 완료 또는 운영자의 주차 공개를 기다려 주세요.', 403],
    BLOCK_PROGRESSION_DUPLICATE: ['같은 상품에 동일한 학습 종류·일차가 이미 있습니다. 학습 번호를 확인해 주세요.', 409],
    BLOCK_REQUIREMENTS_MISSING: ['필수 질문과 체크리스트를 완료해 주세요.', 422],
    BLOCK_QUIZ_NOT_PASSED: ['시험 통과 기준을 확인하고 다시 풀어 주세요.', 422],
  };
  const match = known[e.message ?? ''];
  if (match) return reply({ error: match[0], code: e.message }, match[1]);
  if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
  // Database errors can include content/keys. Never echo or log raw DB errors.
  return reply({ error: '학습 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const params = new URL(request.url).searchParams;
    const db = createAdminClient();
    if (params.get('action') === 'progression') {
      const { data, error } = await db.rpc('edu_read_lesson_progression', { p_actor: user.id, p_enrollment: requiredId(params.get('enrollment')) });
      if (error) throw error;
      return reply({ lessons: data });
    }
    if (params.has('submission')) {
      const { data, error } = await db.rpc('edu_read_block_submission', {
        p_actor: user.id, p_submission: requiredId(params.get('submission')), p_enrollment: requiredId(params.get('enrollment')),
      });
      if (error) throw error;
      return reply({ ...data, document: publicLessonBlocks(validateLessonBlocks(data.document)) });
    }
    const { data, error } = await db.rpc('edu_read_lesson_blocks', {
      p_actor: user.id, p_lesson: requiredId(params.get('lesson')), p_enrollment: optionalId(params.get('enrollment')), p_revision: optionalId(params.get('revision')),
    });
    if (error) throw error;
    if (!data) fail('학습 내용을 찾을 수 없습니다.', 404);
    const document = data.document ? validateLessonBlocks(data.document) : null;
    return reply({ ...data, document: document && (data.editable === true ? document : publicLessonBlocks(document)) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('입력 형식을 확인해 주세요.');
    const lesson = requiredId(body.lessonId), db = createAdminClient();
    if (body.action === 'document') {
      const { data, error } = await db.rpc('edu_save_lesson_blocks', {
        p_actor: user.id, p_lesson: lesson, p_expected_revision: optionalId(body.expectedRevision),
        p_new_revision: requiredId(body.requestId), p_document: validateLessonBlocks(body.document),
      });
      if (error) throw error;
      return reply(data);
    }
    if (!['draft', 'grade', 'submit', 'reopen'].includes(body.action)) fail('요청 종류를 확인해 주세요.');
    const enrollment = requiredId(body.enrollmentId), revision = requiredId(body.revision);
    const loaded = await db.rpc('edu_read_lesson_blocks', { p_actor: user.id, p_lesson: lesson, p_enrollment: enrollment, p_revision: revision });
    if (loaded.error) throw loaded.error;
    if (!loaded.data?.document) fail('학습 내용을 찾을 수 없습니다.', 404);
    if (loaded.data.currentRevision !== revision) throw new Error('BLOCK_CONTENT_CHANGED');
    const document = validateLessonBlocks(loaded.data.document);
    if (body.action === 'reopen') {
      if (loaded.data.submission?.id !== requiredId(body.submissionId)) throw new Error('BLOCK_REVIEW_CHANGED');
      const { data, error } = await db.rpc('edu_decide_lesson_blocks', {
        p_actor: user.id, p_submission: body.submissionId, p_expected_state: requiredId(body.expectedStateId),
        p_request: requiredId(body.requestId), p_decision: 'reopened', p_feedback: '',
      });
      if (error) throw error;
      return reply(data);
    }
    if (body.action === 'submit') {
      const writeId = requiredId(body.writeId), requestId = requiredId(body.requestId);
      if (loaded.data.draft?.writeId !== writeId) throw new Error('BLOCK_DRAFT_CHANGED');
      // Only the acknowledged, server-stored draft is submitted. Client scores,
      // completion flags and a different values object are never authoritative.
      const savedValues = validateBlockAnswers(loaded.data.draft.values, document);
      const assessment = assessBlockCompletion(document, savedValues);
      if (!assessment.ready) return reply({ error: '필수 항목과 시험 통과 기준을 확인해 주세요.', code: 'BLOCK_REQUIREMENTS_MISSING', assessment }, 422);
      const { data, error } = await db.rpc('edu_submit_lesson_blocks', {
        p_actor: user.id, p_lesson: lesson, p_enrollment: enrollment, p_revision: revision,
        p_write: writeId, p_request: requestId, p_values: savedValues,
      });
      if (error) throw error;
      return reply(data);
    }
    const values = validateBlockAnswers(body.values, document);
    if (body.action === 'grade') {
      const block = document.blocks.find(block => block.id === body.blockId && block.type === 'quiz');
      if (!block) fail('시험을 찾을 수 없습니다.', 404);
      const answers = values.blocks[block.id];
      return reply({ revision, blockId: block.id, result: gradeBlockQuiz(block, typeof answers === 'object' ? answers : {}) });
    }
    const { data, error } = await db.rpc('edu_save_block_draft', {
      p_actor: user.id, p_lesson: lesson, p_enrollment: enrollment, p_revision: revision,
      p_expected_write: optionalId(body.expectedWriteId), p_write: requiredId(body.requestId), p_values: values,
    });
    if (error) throw error;
    return reply(data);
  } catch (error) { return failure(error); }
}
