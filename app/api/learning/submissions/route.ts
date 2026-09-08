import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN, httpsUrl } from "@/lib/course-content";
import { gradeQuiz, type QuizDefinition } from "@/lib/mission-quiz";

const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !UUID_PATTERN.test(body.enrollmentId || "") || !UUID_PATTERN.test(body.missionId || "")) return NextResponse.json({ error: "수강권과 미션을 확인해 주세요." }, { status: 400 });
  const answerText = typeof body.answerText === "string" ? body.answerText.trim() : "";
  const evidenceUrl = typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim() : "";
  if (answerText.length > 10000 || (evidenceUrl && !httpsUrl(evidenceUrl))) return NextResponse.json({ error: "답변은 10,000자 이내, 증빙은 HTTPS 링크로 입력해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { data: enrollment, error: enrollmentError } = await admin.from("enrollments").select("course_id,access_starts_at,access_ends_at,profiles!enrollments_user_id_fkey(status)").eq("id", body.enrollmentId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (enrollmentError || !enrollment || one(enrollment.profiles)?.status !== "active" || Date.parse(enrollment.access_starts_at) > Date.now() || (enrollment.access_ends_at && Date.parse(enrollment.access_ends_at) <= Date.now())) return NextResponse.json({ error: "현재 이용할 수 있는 수강권이 필요합니다." }, { status: 403 });
  const { data: mission, error } = await admin.from("curriculum_missions").select("id,submission_type,curriculum_lessons!inner(is_published,curriculum_weeks!inner(course_id,is_published)),mission_quizzes(revision,questions,pass_percent)").eq("id", body.missionId).eq("is_published", true).eq("curriculum_lessons.is_published", true).eq("curriculum_lessons.curriculum_weeks.is_published", true).eq("curriculum_lessons.curriculum_weeks.course_id", enrollment.course_id).maybeSingle();
  if (error || !mission) return NextResponse.json({ error: "이 수강권으로 제출할 수 없는 미션입니다." }, { status: 404 });
  const type = mission.submission_type;
  if ((type === "text" && !answerText) || (type === "link" && !evidenceUrl) || (type === "mixed" && !answerText && !evidenceUrl)) return NextResponse.json({ error: "필요한 과제 답변 또는 증빙 링크를 입력해 주세요." }, { status: 400 });
  const storedQuiz = one(mission.mission_quizzes);
  const revision = typeof body.quizRevision === "string" && UUID_PATTERN.test(body.quizRevision) ? body.quizRevision : null;
  if ((storedQuiz && revision !== storedQuiz.revision) || (!storedQuiz && revision)) return NextResponse.json({ error: "퀴즈가 변경되었습니다. 새로고침 후 다시 응시해 주세요." }, { status: 409 });
  if (type === "quiz" && !storedQuiz) return NextResponse.json({ error: "퀴즈가 준비 중입니다. 운영자에게 문의해 주세요." }, { status: 409 });
  let result = null;
  let snapshot = null;
  if (storedQuiz) {
    const quiz = { questions: storedQuiz.questions, passPercent: storedQuiz.pass_percent } as QuizDefinition;
    try { result = gradeQuiz(quiz, body.quizAnswers); } catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : "퀴즈 응답을 확인해 주세요." }, { status: 400 }); }
    snapshot = { score: result.score, passPercent: quiz.passPercent, correct: result.correct, total: result.total, questions: quiz.questions.map((q) => ({ prompt: q.prompt, selectedOption: q.options[body.quizAnswers[q.id]], correct: !result!.wrongQuestionIds.includes(q.id) })) };
  }
  const saved = await admin.rpc("submit_learning_mission", {
    p_user: user.id, p_enrollment: body.enrollmentId, p_mission: body.missionId,
    p_response: { answerText: answerText || null, evidenceUrl: evidenceUrl || null, ...(snapshot ? { quiz: snapshot } : {}) },
    p_revision: revision, p_result: result,
  });
  if (saved.error) return NextResponse.json({ error: saved.error.code === "P0001" ? saved.error.message : "제출을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요." }, { status: saved.error.message.includes("응시 횟수") ? 429 : 409 });
  return NextResponse.json({ ok: true, passed: saved.data.passed, quiz: result, submissionId: saved.data.submissionId }, { status: saved.data.passed ? 201 : 200 });
}
