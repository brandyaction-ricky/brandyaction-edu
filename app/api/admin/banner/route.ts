import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { safePublicHref } from "@/lib/safe-url";

function safeFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "banner";
  return `${base}.${extension}`;
}

export async function POST(request: Request) {
  const operator = await getAdminUser("settings");
  if (!operator) return NextResponse.json({ error: "사이트 설정 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "배너 저장 요청을 읽지 못했습니다." }, { status: 400 });
  const id = String(form.get("id") || "");
  const title = String(form.get("title") || "").trim().slice(0, 160);
  const oldImagePath = String(form.get("imagePath") || "");
  const removeImage = String(form.get("removeImage") || "false") === "true";
  if (!title) return NextResponse.json({ error: "메인 배너 문구를 입력해 주세요." }, { status: 400 });
  const fileEntry = form.get("image");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_000_000)) return NextResponse.json({ error: "배너는 5MB 이하 JPG, PNG, WEBP만 등록할 수 있습니다." }, { status: 400 });
  const admin = createAdminClient();
  let imagePath = removeImage ? null : oldImagePath || null;
  let uploadedPath = "";
  if (file) {
    uploadedPath = `site/banners/${Date.now()}-${safeFileName(file.name)}`;
    const upload = await admin.storage.from("course-assets").upload(uploadedPath, file, { contentType: file.type, upsert: false });
    if (upload.error) return NextResponse.json({ error: upload.error.message || "대표 이미지를 업로드하지 못했습니다." }, { status: 500 });
    imagePath = uploadedPath;
  }
  const payload = {
    eyebrow: String(form.get("eyebrow") || "").trim().slice(0, 80) || null,
    title,
    description: String(form.get("copy") || "").trim().slice(0, 300) || null,
    link_url: safePublicHref(String(form.get("link") || ""), "/classes"),
    link_label: String(form.get("linkLabel") || "").trim().slice(0, 40) || "클래스 자세히 보기",
    image_path: imagePath,
    is_active: true,
    display_order: 0,
  };
  const result = id
    ? await admin.from("site_banners").update(payload).eq("id", id).select("id").single()
    : await admin.from("site_banners").insert(payload).select("id").single();
  if (result.error) {
    if (uploadedPath) await admin.storage.from("course-assets").remove([uploadedPath]);
    return NextResponse.json({ error: result.error.message || "메인 배너를 저장하지 못했습니다." }, { status: 500 });
  }
  if (oldImagePath && oldImagePath !== imagePath) await admin.storage.from("course-assets").remove([oldImagePath]);
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: id ? "site_banner.updated" : "site_banner.created", entity_type: "site_banner", entity_id: result.data.id, after_data: payload });
  return NextResponse.json({ ok: true, id: result.data.id });
}
