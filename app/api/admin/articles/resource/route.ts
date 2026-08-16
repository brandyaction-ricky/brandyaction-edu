import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

const allowedExtensions = new Set(["pdf", "zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"]);

function safeName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9가-힣_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "resource";
  return { extension, fileName: `${base}.${extension}` };
}

export async function POST(request: Request) {
  const operator = await getAdminUser("articles");
  if (!operator) return NextResponse.json({ error: "아티클 관리 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const entry = form?.get("file");
  if (!(entry instanceof File) || entry.size <= 0) return NextResponse.json({ error: "업로드할 자료를 선택해 주세요." }, { status: 400 });
  const { extension, fileName } = safeName(entry.name);
  if (!allowedExtensions.has(extension)) return NextResponse.json({ error: "PDF, ZIP, 문서, 스프레드시트, 프레젠테이션 파일만 등록할 수 있습니다." }, { status: 400 });
  if (entry.size > 20_000_000) return NextResponse.json({ error: "관련 자료는 파일당 20MB 이하만 등록할 수 있습니다." }, { status: 400 });
  const path = `resources/${Date.now()}-${randomUUID().slice(0, 8)}-${fileName}`;
  const admin = createAdminClient();
  const upload = await admin.storage.from("article-resources").upload(path, entry, { contentType: entry.type || "application/octet-stream", upsert: false });
  if (upload.error) return NextResponse.json({ error: upload.error.message || "관련 자료를 업로드하지 못했습니다." }, { status: 500 });
  const url = admin.storage.from("article-resources").getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ id: randomUUID(), name: entry.name.slice(0, 180), path, url, size: entry.size });
}
