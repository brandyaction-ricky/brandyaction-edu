import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { safePublicHref } from "@/lib/safe-url";

function safeFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "banner";
  return `${base}.${extension}`;
}

async function operator() { return getAdminUser("settings"); }

export async function GET() {
  if (!await operator()) return NextResponse.json({ error: "배너 관리 권한이 필요합니다." }, { status: 403 });
  const admin = createAdminClient();
  const [bannerResult, courseResult] = await Promise.all([
    admin.from("site_banners").select("id,link_url,image_path,is_active,display_order").order("display_order").order("created_at"),
    admin.from("courses").select("id,title,slug,status").neq("status", "archived").order("display_order").order("created_at"),
  ]);
  if (bannerResult.error) return NextResponse.json({ error: bannerResult.error.message || "배너를 불러오지 못했습니다." }, { status: 500 });
  if (courseResult.error) return NextResponse.json({ error: courseResult.error.message || "연결할 클래스를 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ banners: (bannerResult.data || []).map((banner) => ({ ...banner, image_url: banner.image_path ? admin.storage.from("course-assets").getPublicUrl(banner.image_path).data.publicUrl : null })), courses: courseResult.data || [] });
}

export async function POST(request: Request) {
  const adminOperator = await operator();
  if (!adminOperator) return NextResponse.json({ error: "배너 관리 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "배너 저장 요청을 읽지 못했습니다." }, { status: 400 });
  const id = String(form.get("id") || "");
  const oldImagePath = String(form.get("imagePath") || "");
  const fileEntry = form.get("image");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (!id && !file) return NextResponse.json({ error: "새 배너 이미지를 업로드해 주세요." }, { status: 400 });
  if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_000_000)) return NextResponse.json({ error: "배너는 5MB 이하 JPG, PNG, WEBP만 등록할 수 있습니다." }, { status: 400 });
  const admin = createAdminClient();
  let imagePath = oldImagePath || null;
  let uploadedPath = "";
  if (file) {
    uploadedPath = `site/banners/${Date.now()}-${safeFileName(file.name)}`;
    const upload = await admin.storage.from("course-assets").upload(uploadedPath, file, { contentType: file.type, upsert: false });
    if (upload.error) return NextResponse.json({ error: upload.error.message || "배너 이미지를 업로드하지 못했습니다." }, { status: 500 });
    imagePath = uploadedPath;
  }
  const existing = id ? null : await admin.from("site_banners").select("display_order").order("display_order", { ascending: false }).limit(1).maybeSingle();
  const payload = {
    title: "이미지 배너", eyebrow: null, description: null, link_label: null,
    link_url: safePublicHref(String(form.get("link") || ""), "/classes"),
    image_path: imagePath, is_active: true,
    ...(id ? {} : { display_order: Number(existing?.data?.display_order || 0) + 1 }),
  };
  const result = id ? await admin.from("site_banners").update(payload).eq("id", id).select("id").single() : await admin.from("site_banners").insert(payload).select("id").single();
  if (result.error) {
    if (uploadedPath) await admin.storage.from("course-assets").remove([uploadedPath]);
    return NextResponse.json({ error: result.error.message || "배너를 저장하지 못했습니다." }, { status: 500 });
  }
  if (oldImagePath && oldImagePath !== imagePath) await admin.storage.from("course-assets").remove([oldImagePath]);
  await admin.from("audit_logs").insert({ actor_user_id: adminOperator.id, action: id ? "site_banner.updated" : "site_banner.created", entity_type: "site_banner", entity_id: result.data.id, after_data: payload });
  revalidatePath("/");
  return NextResponse.json({ ok: true, id: result.data.id });
}

export async function DELETE(request: Request) {
  const adminOperator = await operator();
  if (!adminOperator) return NextResponse.json({ error: "배너 관리 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "삭제할 배너를 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from("site_banners").select("image_path").eq("id", id).maybeSingle();
  const { error } = await admin.from("site_banners").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message || "배너를 삭제하지 못했습니다." }, { status: 500 });
  if (data?.image_path) await admin.storage.from("course-assets").remove([data.image_path]);
  await admin.from("audit_logs").insert({ actor_user_id: adminOperator.id, action: "site_banner.deleted", entity_type: "site_banner", entity_id: id });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
