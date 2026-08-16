import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

async function highestAdmin() {
  const operator = await getAdminUser("members");
  return operator?.role === "admin" ? operator : null;
}

export async function GET() {
  const operator = await highestAdmin();
  if (!operator) return NextResponse.json({ error: "최고 관리자만 고객 태그를 관리할 수 있습니다." }, { status: 403 });
  const admin = createAdminClient();
  const [tags, memberTags, members] = await Promise.all([
    admin.from("crm_tags").select("id,name,color,description,created_at").order("name"),
    admin.from("crm_member_tags").select("member_id,tag_id"),
    admin.from("profiles").select("id", { count: "exact", head: true }).neq("status", "withdrawn"),
  ]);
  const failed = [tags, memberTags, members].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: `고객 태그를 불러오지 못했습니다. (${failed.error.code})` }, { status: 500 });
  return NextResponse.json({ tags: tags.data || [], memberTags: memberTags.data || [], totalMembers: members.count || 0 });
}

export async function PATCH(request: Request) {
  const operator = await highestAdmin();
  if (!operator) return NextResponse.json({ error: "최고 관리자만 고객 태그를 변경할 수 있습니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?:string; tagId?:string; name?:string; color?:string; description?:string } | null;
  if (!body) return NextResponse.json({ error: "요청 정보를 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  if (body.action === "save") {
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
  if (body.action === "delete") {
    if (!body.tagId) return NextResponse.json({ error: "삭제할 태그를 선택해 주세요." }, { status: 400 });
    const { error } = await admin.from("crm_tags").delete().eq("id", body.tagId);
    if (error) return NextResponse.json({ error: "고객 태그를 삭제하지 못했습니다." }, { status: 500 });
    await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "member_tag.deleted", entity_type: "crm_tag", entity_id: body.tagId });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "지원하지 않는 태그 작업입니다." }, { status: 400 });
}
