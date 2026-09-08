import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/course-content";
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
    .order("submitted_at", { ascending: status === "submitted" })
    .range(from, from + PAGE_SIZE - 1);
  if (status !== "all") submissionsQuery = status === "rejected" ? submissionsQuery.in("status", ["rejected", "changes_requested"]) : submissionsQuery.eq("status", status);

  const [submissionsResult, submittedCount, approvedCount, rejectedCount] = await Promise.all([
    submissionsQuery,
    admin.from("mission_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    admin.from("mission_submissions").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("mission_submissions").select("id", { count: "exact", head: true }).in("status", ["rejected", "changes_requested"]),
  ]);

  if (submissionsResult.error || submittedCount.error || approvedCount.error || rejectedCount.error) {
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
  if (!operator) return NextResponse.json({ error: "미션 검토 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const ids: unknown[] = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : [];
  const decision = body?.decision;
  const feedback = typeof body?.feedback === "string" ? body.feedback.trim() : "";
  if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) || !["approved", "rejected"].includes(decision)) return NextResponse.json({ error: "검토 대상(최대 50건)과 승인 여부를 확인해 주세요." }, { status: 400 });
  if (feedback.length > 2000 || (decision === "rejected" && !feedback)) return NextResponse.json({ error: "반려 시 사유가 필요하며, 피드백은 2,000자 이내입니다." }, { status: 400 });
  const result = await createAdminClient().rpc("review_mission_submissions", { p_actor: operator.id, p_ids: ids, p_decision: decision, p_feedback: feedback });
  if (result.error) return NextResponse.json({ error: result.error.code === "P0001" ? result.error.message : "검토 결과를 저장하지 못했습니다." }, { status: 409 });
  return NextResponse.json({ ok: true, reviewed: result.data });
}
