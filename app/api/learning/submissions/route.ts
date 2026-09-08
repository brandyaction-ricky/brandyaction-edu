import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type SubmissionRequest = {
  enrollmentId?: unknown;
  missionId?: unknown;
  answerText?: unknown;
  evidenceUrl?: unknown;
};

type SubmissionType = "text" | "link" | "mixed";

const MAX_ANSWER_LENGTH = 10_000;
const MAX_EVIDENCE_URL_LENGTH = 2_048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEvidenceUrl(value: string) {
  if (!value || value.length > MAX_EVIDENCE_URL_LENGTH) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateEvidence(submissionType: SubmissionType, answerText: string, evidenceUrl: string) {
  if (answerText.length > MAX_ANSWER_LENGTH) return "과제 답변은 10,000자 이내로 입력해 주세요.";
  if (evidenceUrl && !isValidEvidenceUrl(evidenceUrl)) return "증빙 링크는 https 주소로 입력해 주세요.";
  if (submissionType === "text" && !answerText) return "과제 답변을 입력해 주세요.";
  if (submissionType === "link" && !evidenceUrl) return "과제 증빙 링크를 입력해 주세요.";
  if (submissionType === "mixed" && !answerText && !evidenceUrl) return "과제 답변 또는 증빙 링크를 입력해 주세요.";
  return null;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => null) as SubmissionRequest | null;
  const enrollmentId = readTrimmedString(body?.enrollmentId);
  const missionId = readTrimmedString(body?.missionId);
  const answerText = readTrimmedString(body?.answerText);
  const evidenceUrl = readTrimmedString(body?.evidenceUrl);
  if (!UUID_PATTERN.test(enrollmentId) || !UUID_PATTERN.test(missionId)) {
    return NextResponse.json({ error: "수강권과 과제 정보를 확인해 주세요." }, { status: 400 });
  }

  const supabase = await createClient();
  const now = new Date();
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id,user_id,course_id,status,access_starts_at,access_ends_at")
    .eq("id", enrollmentId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    return NextResponse.json({ error: "활성 수강권을 확인해 주세요." }, { status: 403 });
  }
  if (
    (enrollment.access_starts_at && new Date(enrollment.access_starts_at) > now) ||
    (enrollment.access_ends_at && new Date(enrollment.access_ends_at) <= now)
  ) {
    return NextResponse.json({ error: "현재 수강 가능한 기간이 아닙니다." }, { status: 403 });
  }

  const submissionContext = await Promise.all([
    supabase
      .from("curriculum_missions")
      .select("id,lesson_id,submission_type,is_published")
      .eq("id", missionId)
      .eq("is_published", true)
      .maybeSingle(),
    supabase
      .from("mission_submissions")
      .select("id,attempt_number,status")
      .eq("enrollment_id", enrollmentId)
      .eq("mission_id", missionId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mission_submissions")
      .select("id,attempt_number,status")
      .eq("enrollment_id", enrollmentId)
      .eq("mission_id", missionId)
      .in("status", ["submitted", "approved"])
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const [
    { data: mission, error: missionError },
    { data: latest, error: latestError },
    { data: blockingSubmission, error: blockingError },
  ] = submissionContext;
  if (missionError || !mission) {
    return NextResponse.json({ error: "과제 정보를 확인할 수 없습니다." }, { status: 404 });
  }
  if (latestError || blockingError) {
    return NextResponse.json({ error: "기존 제출 이력을 확인할 수 없습니다." }, { status: 500 });
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("curriculum_lessons")
    .select("id,week_id,is_published")
    .eq("id", mission.lesson_id)
    .eq("is_published", true)
    .maybeSingle();
  if (lessonError || !lesson) {
    return NextResponse.json({ error: "공개된 과제가 아닙니다." }, { status: 404 });
  }

  const { data: week, error: weekError } = await supabase
    .from("curriculum_weeks")
    .select("id,course_id,is_published")
    .eq("id", lesson.week_id)
    .eq("course_id", enrollment.course_id)
    .eq("is_published", true)
    .maybeSingle();
  if (weekError || !week) {
    return NextResponse.json({ error: "이 수강권으로 제출할 수 없는 과제입니다." }, { status: 403 });
  }

  const submissionType = mission.submission_type as SubmissionType;
  if (!["text", "link", "mixed"].includes(submissionType)) {
    return NextResponse.json({ error: "지원하지 않는 과제 제출 형식입니다." }, { status: 400 });
  }
  const evidenceError = validateEvidence(submissionType, answerText, evidenceUrl);
  if (evidenceError) return NextResponse.json({ error: evidenceError }, { status: 400 });

  if (blockingSubmission) {
    const message = blockingSubmission.status === "approved" ? "이미 승인된 과제입니다." : "검토 중인 과제입니다.";
    return NextResponse.json({ error: message, submission: blockingSubmission }, { status: 409 });
  }
  if (latest && !["rejected", "changes_requested"].includes(latest.status)) {
    return NextResponse.json({ error: "현재 과제 상태에서는 재제출할 수 없습니다." }, { status: 409 });
  }

  const attemptNumber = (latest?.attempt_number ?? 0) + 1;
  const submittedAt = now.toISOString();
  const { data: submission, error: insertError } = await createAdminClient()
    .from("mission_submissions")
    .insert({
      enrollment_id: enrollmentId,
      mission_id: missionId,
      attempt_number: attemptNumber,
      status: "submitted",
      response: {
        answerText: answerText || null,
        evidenceUrl: evidenceUrl || null,
      },
      submitted_at: submittedAt,
    })
    .select("id,enrollment_id,mission_id,attempt_number,status,response,submitted_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "동일한 과제가 이미 제출되었습니다." }, { status: 409 });
    }
    if (insertError.code === "23514") {
      return NextResponse.json({ error: "이 수강권으로 제출할 수 없는 과제입니다." }, { status: 403 });
    }
    return NextResponse.json({ error: "과제를 제출할 수 없습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, submission }, { status: 201 });
}
