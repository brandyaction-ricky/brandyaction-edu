import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

export async function GET() {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: cohorts }] = await Promise.all([
    admin.from("profiles").select("id,email,full_name,phone,role,status,created_at,enrollments:enrollments!enrollments_user_id_fkey(id,status,course_id,cohort_id,courses(title),cohorts(name)),orders(total_amount,status,payments(approved_amount,cancelled_amount))").order("created_at", { ascending: false }),
    admin.from("cohorts").select("id,name,status,courses(id,title)").neq("status", "cancelled").order("operation_start_at", { ascending: false }),
  ]);
  if (error) return NextResponse.json({ error: `회원 목록을 불러오지 못했습니다. (${error.code || "QUERY_ERROR"})` }, { status: 500 });
  return NextResponse.json({ members: profiles || [], cohorts: cohorts || [], operatorRole: operator.role });
}

export async function PATCH(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { userId?: string; role?: string; status?: string } | null;
  if (!body?.userId) return NextResponse.json({ error: "회원을 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role,status").eq("id", body.userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "회원을 찾을 수 없습니다." }, { status: 404 });
  if (operator.role === "staff" && target.role !== "student") return NextResponse.json({ error: "스태프는 다른 운영자 계정을 변경할 수 없습니다." }, { status: 403 });
  if (body.userId === operator.id && body.status && body.status !== "active") return NextResponse.json({ error: "현재 로그인한 운영자 계정은 직접 정지할 수 없습니다." }, { status: 400 });
  const removesActiveAdmin = target.role === "admin" && target.status === "active" && ((body.role && body.role !== "admin") || (body.status && body.status !== "active"));
  if (removesActiveAdmin) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
    if ((count || 0) <= 1) return NextResponse.json({ error: "마지막 활성 최고 관리자는 강등하거나 정지할 수 없습니다." }, { status: 400 });
  }
  const changes: Record<string, string> = {};
  if (body.status && ["active", "suspended", "withdrawn"].includes(body.status)) changes.status = body.status;
  if (body.role && ["student", "staff", "admin"].includes(body.role)) {
    if (operator.role !== "admin") return NextResponse.json({ error: "역할 변경은 최고 관리자만 할 수 있습니다." }, { status: 403 });
    if (body.userId === operator.id && body.role !== "admin") return NextResponse.json({ error: "현재 로그인한 최고 관리자 역할은 직접 낮출 수 없습니다." }, { status: 400 });
    changes.role = body.role;
  }
  if (!Object.keys(changes).length) return NextResponse.json({ error: "변경할 값이 없습니다." }, { status: 400 });
  const { error } = await admin.from("profiles").update(changes).eq("id", body.userId);
  if (error) return NextResponse.json({ error: "회원 상태를 저장하지 못했습니다." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "member.updated", entity_type: "profile", entity_id: body.userId, after_data: changes });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { userId?: string; cohortId?: string } | null;
  if (!body?.userId || !body.cohortId) return NextResponse.json({ error: "회원과 기수를 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { data: cohort } = await admin.from("cohorts").select("id,course_id,operation_start_at,operation_end_at").eq("id", body.cohortId).maybeSingle();
  if (!cohort) return NextResponse.json({ error: "기수를 찾을 수 없습니다." }, { status: 404 });
  const { data: existing } = await admin.from("enrollments").select("id").eq("user_id", body.userId).eq("cohort_id", body.cohortId).maybeSingle();
  const payload = { user_id: body.userId, course_id: cohort.course_id, cohort_id: cohort.id, status: "active", source: "admin_grant", granted_by: operator.id, access_starts_at: new Date().toISOString(), access_ends_at: null, revoked_at: null };
  const result = existing ? await admin.from("enrollments").update(payload).eq("id", existing.id) : await admin.from("enrollments").insert(payload);
  if (result.error) return NextResponse.json({ error: "수강권을 발급하지 못했습니다. 최신 DB 마이그레이션 적용 여부를 확인해 주세요." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "enrollment.granted", entity_type: "profile", entity_id: body.userId, after_data: { cohort_id: body.cohortId } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
