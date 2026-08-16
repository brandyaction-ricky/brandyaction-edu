import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

export async function GET() {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: cohorts }, { data: tags }, { data: memberTags }] = await Promise.all([
    admin.from("profiles").select("id,email,full_name,phone,role,status,marketing_consent,created_at,enrollments:enrollments!enrollments_user_id_fkey(id,status,source,course_id,cohort_id,courses(id,title),cohorts(id,name)),orders(total_amount,status,payments(approved_amount,cancelled_amount))").order("created_at", { ascending: false }),
    admin.from("cohorts").select("id,course_id,name,status,courses(id,title)").neq("status", "cancelled").order("operation_start_at", { ascending: false }),
    admin.from("crm_tags").select("id,name,color,description").order("name"),
    admin.from("crm_member_tags").select("member_id,tag_id"),
  ]);
  if (error) return NextResponse.json({ error: `회원 목록을 불러오지 못했습니다. (${error.code || "QUERY_ERROR"})` }, { status: 500 });
  return NextResponse.json({ members: profiles || [], cohorts: cohorts || [], tags: tags || [], memberTags: memberTags || [], operatorRole: operator.role });
}

export async function PATCH(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: string; userId?: string; role?: string; status?: string; enrollmentId?: string; tagIds?: string[]; tagId?: string; name?: string; color?: string; description?: string } | null;
  if (!body) return NextResponse.json({ error: "요청 정보를 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  if (body.action === "saveTag") {
    if (operator.role !== "admin") return NextResponse.json({ error: "고객 태그 등록·수정은 최고 관리자만 할 수 있습니다." }, { status: 403 });
    const name = String(body.name || "").trim().slice(0, 40);
    const color = /^#[0-9a-fA-F]{6}$/.test(String(body.color || "")) ? String(body.color) : "#A10D12";
    if (!name) return NextResponse.json({ error: "태그 이름을 입력해 주세요." }, { status: 400 });
    const payload = { name, color, description: String(body.description || "").trim().slice(0, 200) || null, created_by: operator.id };
    const result = body.tagId
      ? await admin.from("crm_tags").update(payload).eq("id", body.tagId).select("id").single()
      : await admin.from("crm_tags").insert(payload).select("id").single();
    if (result.error) return NextResponse.json({ error: result.error.code === "23505" ? "같은 이름의 태그가 이미 있습니다." : "고객 태그를 저장하지 못했습니다." }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: body.tagId ? "member_tag.updated" : "member_tag.created", entity_type: "crm_tag", entity_id: result.data.id, after_data: payload });
    return NextResponse.json({ ok: true, id: result.data.id });
  }
  if (body.action === "deleteTag") {
    if (operator.role !== "admin") return NextResponse.json({ error: "고객 태그 삭제는 최고 관리자만 할 수 있습니다." }, { status: 403 });
    if (!body.tagId) return NextResponse.json({ error: "삭제할 태그를 선택해 주세요." }, { status: 400 });
    const { error } = await admin.from("crm_tags").delete().eq("id", body.tagId);
    if (error) return NextResponse.json({ error: "고객 태그를 삭제하지 못했습니다." }, { status: 500 });
    await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "member_tag.deleted", entity_type: "crm_tag", entity_id: body.tagId });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "enrollment") {
    if (!body.enrollmentId || !body.status || !["active", "expired", "revoked", "refunded"].includes(body.status)) return NextResponse.json({ error: "수강권과 변경 상태를 확인해 주세요." }, { status: 400 });
    const { data: enrollment } = await admin.from("enrollments").select("id,user_id,status").eq("id", body.enrollmentId).maybeSingle();
    if (!enrollment) return NextResponse.json({ error: "수강권을 찾을 수 없습니다." }, { status: 404 });
    const { error } = await admin.from("enrollments").update({ status: body.status, revoked_at: body.status === "revoked" ? new Date().toISOString() : null, access_ends_at: null }).eq("id", body.enrollmentId);
    if (error) return NextResponse.json({ error: "수강권 상태를 저장하지 못했습니다." }, { status: 500 });
    await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: `enrollment.${body.status}`, entity_type: "enrollment", entity_id: body.enrollmentId, after_data: { previous_status: enrollment.status, status: body.status } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "tags") {
    if (operator.role !== "admin") return NextResponse.json({ error: "고객 태그 변경은 최고 관리자만 할 수 있습니다." }, { status: 403 });
    if (!body.userId || !Array.isArray(body.tagIds)) return NextResponse.json({ error: "회원과 태그를 확인해 주세요." }, { status: 400 });
    await admin.from("crm_member_tags").delete().eq("member_id", body.userId);
    if (body.tagIds.length) {
      const { error } = await admin.from("crm_member_tags").insert(body.tagIds.map((tagId) => ({ member_id: body.userId, tag_id: tagId, assigned_by: operator.id })));
      if (error) return NextResponse.json({ error: "회원 태그를 저장하지 못했습니다." }, { status: 500 });
    }
    await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "member.tags_updated", entity_type: "profile", entity_id: body.userId, after_data: { tag_ids: body.tagIds } });
    return NextResponse.json({ ok: true });
  }
  if (!body.userId) return NextResponse.json({ error: "회원을 선택해 주세요." }, { status: 400 });
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
