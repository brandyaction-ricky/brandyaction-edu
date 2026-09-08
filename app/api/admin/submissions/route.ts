import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

const REVIEW_STATUSES = new Set(["submitted", "changes_requested", "approved", "rejected"]);
const PAGE_SIZE = 20;

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

export async function GET(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const requestedPage = Number(params.get("page") || 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedStatus = params.get("status") || "submitted";
  const status = requestedStatus === "all" || REVIEW_STATUSES.has(requestedStatus) ? requestedStatus : "submitted";
  const from = (page - 1) * PAGE_SIZE;
  const admin = createAdminClient();

  let submissionsQuery = admin
    .from("mission_submissions")
    .select(
      "id,enrollment_id,mission_id,attempt_number,status,response,submitted_at,reviewed_at,reviewer_feedback,reviewed_by,enrollments(id,user_id,course_id,cohort_id,profiles!enrollments_user_id_fkey(id,full_name,email),courses(id,title),cohorts(id,name)),curriculum_missions(id,title,instructions,submission_type,curriculum_lessons(id,title,day_number,curriculum_weeks(id,title,week_number)))",
      { count: "exact" },
    )
    .order("submitted_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (status !== "all") submissionsQuery = submissionsQuery.eq("status", status);

  const [submissionsResult, submittedCount, approvedCount, rejectedCount] = await Promise.all([
    submissionsQuery,
    admin.from("mission_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    admin.from("mission_submissions").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("mission_submissions").select("id", { count: "exact", head: true }).eq("status", "rejected"),
  ]);

  if (submissionsResult.error) {
    return NextResponse.json({ error: errorMessage(submissionsResult.error, "과제 제출 목록을 불러오지 못했습니다.") }, { status: 500 });
  }
  return NextResponse.json({
    submissions: submissionsResult.data || [],
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: submissionsResult.count || 0,
      totalPages: Math.max(1, Math.ceil((submissionsResult.count || 0) / PAGE_SIZE)),
    },
    counts: {
      submitted: submittedCount.count || 0,
      approved: approvedCount.count || 0,
      rejected: rejectedCount.count || 0,
    },
  });
}

export async function PATCH(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = await request.json().catch(() => null) as { id?: unknown; decision?: unknown; feedback?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const decision = typeof body?.decision === "string" ? body.decision : "";
  const feedback = typeof body?.feedback === "string" ? body.feedback.trim() : "";
  if (!id || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "검토 대상과 승인 여부를 확인해 주세요." }, { status: 400 });
  }
  if (feedback.length > 2_000) return NextResponse.json({ error: "피드백은 2,000자 이내로 입력해 주세요." }, { status: 400 });
  if (decision === "rejected" && !feedback) return NextResponse.json({ error: "반려 사유를 입력해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("mission_submissions")
    .select("id,enrollment_id,mission_id,attempt_number,status,reviewer_feedback")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "제출 정보를 확인하지 못했습니다." }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "검토할 제출 내역을 찾을 수 없습니다." }, { status: 404 });
  if (existing.status !== "submitted") {
    return NextResponse.json({ error: "이미 검토된 제출 내역입니다. 목록을 새로고침해 주세요." }, { status: 409 });
  }

  const reviewedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("mission_submissions")
    .update({ status: decision, reviewer_feedback: feedback || null, reviewed_by: operator.id, reviewed_at: reviewedAt })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: errorMessage(updateError, "과제 검토 결과를 저장하지 못했습니다.") }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "다른 관리자가 먼저 검토했습니다. 목록을 새로고침해 주세요." }, { status: 409 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: operator.id,
    action: decision === "approved" ? "mission_submission.approved" : "mission_submission.rejected",
    entity_type: "mission_submission",
    entity_id: id,
    before_data: { status: existing.status, reviewer_feedback: existing.reviewer_feedback },
    after_data: {
      status: decision,
      reviewer_feedback: feedback || null,
      reviewed_at: reviewedAt,
      enrollment_id: existing.enrollment_id,
      mission_id: existing.mission_id,
      attempt_number: existing.attempt_number,
    },
  });
  if (auditError) {
    const { error: rollbackError } = await admin
      .from("mission_submissions")
      .update({
        status: "submitted",
        reviewer_feedback: existing.reviewer_feedback,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", id)
      .eq("reviewed_at", reviewedAt);
    return NextResponse.json(
      { error: rollbackError ? "검토 결과는 저장됐지만 감사 기록을 남기지 못했습니다." : "감사 기록 오류로 검토 결과 저장을 취소했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
