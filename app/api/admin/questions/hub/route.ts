import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { hubBody, hubEnabled, hubError, hubFail, hubId, hubReply } from '@/lib/question-hub-server';
import { assistInstructions, type QuestionAssistPackage } from '@/lib/question-hub';
import { loadQuestionAiContext } from '@/lib/question-ai-context';
async function actor() { hubEnabled(); const user = await getOperatorUser('members'); if (!user) hubFail('질문 관리 권한이 필요합니다.', 403); return user; }
export async function GET(request: Request) {
  try {
    await actor(); const id = hubId(new URL(request.url).searchParams.get('question')), db = createAdminClient();
    const [question, shared, jobs] = await Promise.all([
      db.from('edu_questions').select('id,category,sharing_requested,lesson_id,enrollment_id').eq('id', id).eq('is_archived', false).maybeSingle(),
      db.from('edu_shared_answers').select('id,title,answer,published').eq('source_question_id', id).maybeSingle(),
      db.from('edu_question_assist_jobs').select('id,status,draft,expected_head,created_at').eq('question_id', id).order('created_at', { ascending: false }).limit(1),
    ]);
    if (question.error || shared.error || jobs.error) throw question.error || shared.error || jobs.error;
    if (!question.data) hubFail('질문을 찾을 수 없습니다.', 404);
    return hubReply({ question: question.data, shared: shared.data, job: jobs.data?.[0] || null });
  } catch (e) { return hubError(e); }
}
export async function POST(request: Request) {
  try {
    const user = await actor(), body = await hubBody(request), questionId = hubId(body.questionId), db = createAdminClient();
    if (body.action === 'publish') {
      if (body.reviewed !== true || typeof body.title !== 'string' || typeof body.answer !== 'string' || body.title.length > 200 || body.answer.length > 10000 || typeof body.published !== 'boolean') hubFail('공유할 내용을 검토해 주세요.');
      const r = await db.rpc('edu_publish_shared_answer', { p_actor: user.id, p_question: questionId, p_title: body.title, p_answer: body.answer, p_publish: body.published });
      if (r.error) throw r.error; return hubReply(r.data);
    }
    if (!['export','import'].includes(body.action)) hubFail('요청을 확인해 주세요.');
    if (body.action === 'import' && (typeof body.draft !== 'string' || !body.draft.trim() || body.draft.length > 10000)) hubFail('가져올 답변 초안을 확인해 주세요.');
    const job = await db.rpc('edu_question_assist', { p_actor: user.id, p_question: questionId, p_request: hubId(body.requestId), p_draft: body.action === 'import' ? body.draft : null });
    if (job.error) throw job.error;
    if (body.action === 'import') return hubReply({ job: job.data });
    const question = await db.from('edu_questions').select('id,title,content,course_id,lesson_id,user_id,enrollment_id').eq('id', questionId).eq('is_archived', false).single();
    if (question.error) throw question.error;
    const loaded = await loadQuestionAiContext(db, user.id, question.data);
    // Recheck after fetching the context; an enrollment may have expired or an
    // operator may have answered meanwhile. Never export locked curriculum.
    const checked = await db.rpc('edu_question_assist', { p_actor: user.id, p_question: questionId, p_request: job.data.id, p_draft: null });
    if (checked.error) throw checked.error;
    if (loaded.reference.revision !== checked.data.lessonRevision) hubFail('수업 내용이 바뀌었습니다. 자료를 다시 준비해 주세요.', 409);
    const handoff: QuestionAssistPackage = { schemaVersion: 1, jobId: job.data.id, question: { title: question.data.title, content: question.data.content }, lesson: { title: loaded.reference.lessonTitle, revision: loaded.reference.revision, text: loaded.context }, instructions: assistInstructions };
    return hubReply({ job: checked.data, handoff });
  } catch (e) { return hubError(e); }
}
