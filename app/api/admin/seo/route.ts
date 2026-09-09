import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultSeoSettings } from "@/lib/seo-settings-shared";
import { httpsUrl } from "@/lib/course-content";
export async function GET() {
  if (!await getAdminUser("settings")) return NextResponse.json({ error: "관리자 설정 권한이 필요합니다." }, { status: 403 });
  const { data, error } = await createAdminClient().from("site_settings").select("value").eq("key", "seo_settings").maybeSingle();
  if (error) return NextResponse.json({ error: "SEO 설정을 불러오지 못했습니다." }, { status: 503 });
  return NextResponse.json({ settings: data?.value || defaultSeoSettings }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  const operator = await getAdminUser("settings");
  if (!operator) return NextResponse.json({ error: "관리자 설정 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.title !== "string" || !body.title.trim() || body.title.length > 120 || typeof body.description !== "string" || !body.description.trim() || body.description.length > 300 || typeof body.image !== "string" || (body.image && !httpsUrl(body.image))) return NextResponse.json({ error: "제목 120자·설명 300자 이내, 이미지 HTTPS 주소를 확인해 주세요." }, { status: 400 });
  const settings = { title: body.title.trim(), description: body.description.trim(), image: body.image.trim() };
  const admin = createAdminClient();
  const { error } = await admin.from("site_settings").upsert({ key: "seo_settings", value: settings, is_public: false, updated_by: operator.id }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "SEO 설정을 저장하지 못했습니다." }, { status: 503 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "seo.updated", entity_type: "site_setting", entity_id: "seo_settings" });
  revalidateTag("seo-settings", { expire: 0 }); revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
