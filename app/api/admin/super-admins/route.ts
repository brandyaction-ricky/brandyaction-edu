import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

async function superAdmin() {
  const operator = await getAdminUser();
  return operator?.role === "admin" ? operator : null;
}

export async function GET() {
  const operator = await superAdmin();
  if (!operator) return NextResponse.json({ error: "최고 관리자만 접근할 수 있습니다." }, { status: 403 });
  const { data, error } = await createAdminClient().from("profiles").select("id,email,full_name,phone,status,created_at").eq("role", "admin").order("created_at");
  if (error) return NextResponse.json({ error: "최고 관리자 목록을 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ admins: data || [], currentUserId: operator.id });
}

export async function POST(request: Request) {
  const operator = await superAdmin();
  if (!operator) return NextResponse.json({ error: "최고 관리자만 등록할 수 있습니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "가입된 회원의 이메일을 정확히 입력해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id,email,role,status").ilike("email", email).maybeSingle();
  if (!target) return NextResponse.json({ error: "해당 이메일로 가입된 회원을 찾을 수 없습니다." }, { status: 404 });
  if (target.role === "admin" && target.status === "active") return NextResponse.json({ error: "이미 최고 관리자로 등록된 회원입니다." }, { status: 409 });
  const { error } = await admin.from("profiles").update({ role: "admin", status: "active" }).eq("id", target.id);
  if (error) return NextResponse.json({ error: "최고 관리자로 등록하지 못했습니다." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "super_admin.granted", entity_type: "profile", entity_id: target.id, before_data: { role: target.role, status: target.status }, after_data: { role: "admin", status: "active" } });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const operator = await superAdmin();
  if (!operator) return NextResponse.json({ error: "최고 관리자만 권한을 해제할 수 있습니다." }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "최고 관리자를 선택해 주세요." }, { status: 400 });
  if (userId === operator.id) return NextResponse.json({ error: "현재 로그인한 자신의 최고 관리자 권한은 해제할 수 없습니다." }, { status: 400 });
  const admin = createAdminClient();
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
  if ((count || 0) <= 1) return NextResponse.json({ error: "마지막 최고 관리자의 권한은 해제할 수 없습니다." }, { status: 400 });
  const { data: target } = await admin.from("profiles").select("role,status").eq("id", userId).maybeSingle();
  if (!target || target.role !== "admin") return NextResponse.json({ error: "최고 관리자 계정을 찾을 수 없습니다." }, { status: 404 });
  const { error } = await admin.from("profiles").update({ role: "staff" }).eq("id", userId);
  if (error) return NextResponse.json({ error: "최고 관리자 권한을 해제하지 못했습니다." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "super_admin.revoked", entity_type: "profile", entity_id: userId, before_data: target, after_data: { role: "staff", status: target.status } });
  return NextResponse.json({ ok: true });
}
