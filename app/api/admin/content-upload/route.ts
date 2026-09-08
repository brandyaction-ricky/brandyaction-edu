import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN, resourceMime, RESOURCE_MAX_BYTES } from "@/lib/course-content";

export async function POST(request: Request) {
  if (!await getAdminUser("products")) return NextResponse.json({ error: "콘텐츠 관리 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || body.name.length > 255 || !UUID_PATTERN.test(body.courseId || "") || !["resource", "thumbnail", "detail"].includes(body.kind)) return NextResponse.json({ error: "파일 정보를 확인해 주세요." }, { status: 400 });
  const resource = body.kind === "resource";
  const extension = body.name.split(".").pop()?.toLowerCase();
  const contentType = resource ? resourceMime(body.name) : ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[extension || ""];
  if (!contentType || !Number.isInteger(body.size) || body.size <= 0 || body.size > (resource ? RESOURCE_MAX_BYTES : 5_000_000)) return NextResponse.json({ error: resource ? "지원되는 자료 파일(최대 50MB)을 선택해 주세요." : "JPG·PNG·WEBP 이미지(최대 5MB)를 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const course = await admin.from("courses").select("id").eq("id", body.courseId).maybeSingle();
  if (course.error || !course.data) return NextResponse.json({ error: "클래스 기본 정보를 먼저 저장해 주세요." }, { status: 404 });
  const bucket = resource ? "course-resources" : "course-assets";
  const path = `${body.courseId}/${body.kind}/${randomUUID()}.${extension}`;
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) return NextResponse.json({ error: "업로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  return NextResponse.json({ bucket, path, token: data.token, contentType }, { headers: { "Cache-Control": "no-store" } });
}
