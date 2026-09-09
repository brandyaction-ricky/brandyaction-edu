import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/course-content";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  if (!await getAdminUser("members")) return NextResponse.json({ error: "회원 그룹 관리 권한이 필요합니다." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const admin = createAdminClient();
  const search = params.get("search");
  if (search != null) {
    const query = search.replace(/[,%_().\\]/g, " ").trim().slice(0, 100);
    if (query.length < 2) return NextResponse.json({ members: [] }, { headers });
    const { data, error } = await admin.from("profiles").select("id,full_name,email").eq("status", "active").or(`full_name.ilike.%${query}%,email.ilike.%${query}%`).order("full_name").limit(20);
    if (error) return NextResponse.json({ error: "회원을 검색하지 못했습니다." }, { status: 503 });
    return NextResponse.json({ members: data }, { headers });
  }
  const group = params.get("group");
  if (group) {
    if (!UUID_PATTERN.test(group)) return NextResponse.json({ error: "그룹을 확인해 주세요." }, { status: 400 });
    const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
    const { data, count, error } = await admin.from("member_group_members").select("member_id,profiles!member_group_members_member_id_fkey(id,full_name,email)", { count: "exact" }).eq("group_id", group).order("added_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
    if (error) return NextResponse.json({ error: "그룹 회원을 불러오지 못했습니다." }, { status: 503 });
    return NextResponse.json({ members: (data || []).map((item) => Array.isArray(item.profiles) ? item.profiles[0] : item.profiles), total: count }, { headers });
  }
  const { data, error } = await admin.from("member_groups").select("id,name,description,created_at,member_group_members(count)").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "그룹 목록을 불러오지 못했습니다." }, { status: 503 });
  return NextResponse.json({ groups: (data || []).map((group) => ({ id: group.id, name: group.name, description: group.description, count: group.member_group_members?.[0]?.count || 0 })) }, { headers });
}

export async function POST(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "회원 그룹 관리 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.name !== "string" || !body.name.trim() || body.name.length > 80 || typeof body.description !== "string" || body.description.length > 1000 || (body.id && !UUID_PATTERN.test(body.id))) return NextResponse.json({ error: "그룹 이름·설명을 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const value = { name: body.name.trim(), description: body.description.trim() };
  const result = body.id ? await admin.from("member_groups").update(value).eq("id", body.id).select("id").single() : await admin.from("member_groups").insert({ ...value, created_by: operator.id }).select("id").single();
  if (result.error) return NextResponse.json({ error: "그룹을 저장하지 못했습니다." }, { status: 409 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "member_group.saved", entity_type: "member_group", entity_id: result.data.id });
  return NextResponse.json({ id: result.data.id }, { headers });
}

export async function PATCH(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "회원 그룹 관리 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!UUID_PATTERN.test(body?.groupId || "") || !["add", "remove"].includes(body?.action) || !Array.isArray(body.memberIds) || !body.memberIds.length || body.memberIds.length > 50 || body.memberIds.some((id: unknown) => typeof id !== "string" || !UUID_PATTERN.test(id))) return NextResponse.json({ error: "그룹과 회원을 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const ids = [...new Set<string>(body.memberIds)];
  const result = body.action === "add" ? await admin.from("member_group_members").upsert(ids.map((memberId) => ({ group_id: body.groupId, member_id: memberId })), { onConflict: "group_id,member_id", ignoreDuplicates: true }) : await admin.from("member_group_members").delete().eq("group_id", body.groupId).in("member_id", ids);
  if (result.error) return NextResponse.json({ error: "그룹 회원을 변경하지 못했습니다." }, { status: 409 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: `member_group.${body.action}`, entity_type: "member_group", entity_id: body.groupId, after_data: { memberIds: ids } });
  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request) {
  const operator = await getAdminUser("members");
  if (!operator) return NextResponse.json({ error: "회원 그룹 관리 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "그룹을 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("member_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "그룹을 삭제하지 못했습니다." }, { status: 409 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "member_group.deleted", entity_type: "member_group", entity_id: id });
  return NextResponse.json({ ok: true }, { headers });
}
