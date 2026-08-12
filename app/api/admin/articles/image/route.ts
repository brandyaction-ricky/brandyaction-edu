import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

export async function POST(request: Request) {
  const operator = await getAdminUser("articles");
  if (!operator) return NextResponse.json({ error: "아티클 관리 권한이 필요합니다." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "이미지 파일을 선택해 주세요." }, { status: 400 });
    if (!signatures[file.type] || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "10MB 이하 JPG, PNG, WebP 이미지만 업로드할 수 있습니다." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!signatures[file.type](bytes)) return NextResponse.json({ error: "파일 내용과 이미지 형식이 일치하지 않습니다." }, { status: 400 });
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `articles/${operator.id}/${crypto.randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { error } = await admin.storage.from("article-assets").upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;
    const url = admin.storage.from("article-assets").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ path, url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "이미지를 업로드하지 못했습니다." }, { status: 500 });
  }
}
