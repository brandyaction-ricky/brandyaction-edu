import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCodeSettings } from "@/lib/code-settings";
import { emptyCodeSettings, type CodeSettings } from "@/lib/code-settings-shared";
import { getAdminUser } from "@/lib/server-auth";

async function highestAdmin() {
  const operator = await getAdminUser();
  return operator?.role === "admin" ? operator : null;
}

export async function GET() {
  if (!await highestAdmin()) return NextResponse.json({ error: "최고 관리자만 접근할 수 있습니다." }, { status: 403 });
  return NextResponse.json({ settings: await loadCodeSettings() });
}

export async function PUT(request: Request) {
  const operator = await highestAdmin();
  if (!operator) return NextResponse.json({ error: "최고 관리자만 코드를 저장할 수 있습니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as Partial<CodeSettings> | null;
  if (!body) return NextResponse.json({ error: "저장할 코드를 확인해 주세요." }, { status: 400 });
  const settings = Object.fromEntries(Object.keys(emptyCodeSettings).map((key) => [key, typeof body[key as keyof CodeSettings] === "string" ? body[key as keyof CodeSettings] : ""])) as CodeSettings;
  if (Object.values(settings).some((value) => value.length > 100_000)) return NextResponse.json({ error: "각 코드 영역은 100KB 이하로 입력해 주세요." }, { status: 400 });
  if (Object.values(settings).some((value) => /<(?:html|body)(?:\s|>)/i.test(value) || /<\/body\s*>/i.test(value))) return NextResponse.json({ error: "html·body 태그 자체는 입력하지 말고 내부 코드만 입력해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { data: before } = await admin.from("site_settings").select("value").eq("key", "search_code_settings").maybeSingle();
  const { error } = await admin.from("site_settings").upsert({ key: "search_code_settings", value: settings, is_public: false, updated_by: operator.id }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "검색·코드 설정을 저장하지 못했습니다." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "search_code_settings.updated", entity_type: "site_setting", entity_id: "search_code_settings", before_data: before?.value || emptyCodeSettings, after_data: settings });
  return NextResponse.json({ ok: true });
}
