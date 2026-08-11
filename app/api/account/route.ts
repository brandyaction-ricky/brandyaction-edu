import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== "회원탈퇴") return NextResponse.json({ error: "확인 문구를 정확히 입력해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ error: enrollmentError }, { error: reviewError }, { error: profileError }] = await Promise.all([
    admin.from("enrollments").update({ status: "revoked", revoked_at: now }).eq("user_id", user.id).eq("status", "active"),
    admin.from("reviews").update({ author_name: "탈퇴 회원", author_nickname: "탈퇴 회원" }).eq("user_id", user.id),
    admin.from("profiles").update({ full_name: null, phone: null, avatar_url: null, status: "withdrawn", updated_at: now }).eq("id", user.id),
  ]);
  if (enrollmentError || reviewError || profileError) return NextResponse.json({ error: "회원 탈퇴 정보를 처리하지 못했습니다. 고객지원에 문의해 주세요." }, { status: 500 });

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: `withdrawn+${user.id}@invalid.brandyaction.local`,
    user_metadata: { withdrawn_at: now },
    ban_duration: "876000h",
  });
  if (authError) return NextResponse.json({ error: "탈퇴 처리는 완료됐지만 인증정보 정리가 지연되고 있습니다. 로그인은 차단되었습니다." }, { status: 202 });
  return NextResponse.json({ ok: true });
}
