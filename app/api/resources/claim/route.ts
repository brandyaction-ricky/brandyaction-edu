import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { UUID_PATTERN, httpsUrl } from "@/lib/course-content";
import { safeEmbedUrl } from "@/lib/learning-data";
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "가입 또는 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!UUID_PATTERN.test(body?.lessonId || "")) return NextResponse.json({ error: "콘텐츠를 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const profile = await admin.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (profile.error || profile.data?.status !== "active") return NextResponse.json({ error: "활성 회원 계정으로 이용해 주세요." }, { status: 403 });
  const { data: lesson, error } = await admin.from("curriculum_lessons").select("id,content_type,lesson_contents(vod_url,resource_name,resource_storage_path,body_text,external_url),curriculum_weeks!inner(course_id,is_published,courses!inner(status))").eq("id", body.lessonId).eq("access_mode", "member").eq("is_published", true).eq("curriculum_weeks.is_published", true).eq("curriculum_weeks.courses.status", "published").maybeSingle();
  if (error || !lesson) return NextResponse.json({ error: "현재 제공되지 않는 콘텐츠입니다." }, { status: 404 });
  const content = one(lesson.lesson_contents);
  if (!content) return NextResponse.json({ error: "콘텐츠를 준비 중입니다." }, { status: 404 });
  let delivery: { kind: string; url?: string; name?: string; body?: string; embedUrl?: string | null } = { kind: lesson.content_type };
  if (lesson.content_type === "material" && content.resource_storage_path) {
    const courseId = one(lesson.curriculum_weeks)?.course_id;
    if (!courseId || !content.resource_storage_path.startsWith(`${courseId}/`) || content.resource_storage_path.includes("..")) return NextResponse.json({ error: "자료 연결을 확인해 주세요." }, { status: 409 });
    const signed = await admin.storage.from("course-resources").createSignedUrl(content.resource_storage_path, 300, { download: content.resource_name || true });
    if (signed.error || !signed.data) return NextResponse.json({ error: "자료를 준비하지 못했습니다. 운영자에게 문의해 주세요." }, { status: 503 });
    delivery = { ...delivery, url: signed.data.signedUrl, name: content.resource_name || "무료 자료" };
  } else if (lesson.content_type === "text" && content.body_text) delivery.body = content.body_text;
  else {
    const url = httpsUrl(lesson.content_type === "vod" ? content.vod_url : content.external_url);
    if (!url) return NextResponse.json({ error: "콘텐츠 링크를 준비 중입니다." }, { status: 404 });
    delivery = { ...delivery, url, embedUrl: lesson.content_type === "vod" ? safeEmbedUrl(url) : null };
  }
  const tag = (key: string) => typeof body[key] === "string" ? body[key].trim().slice(0, 200) || null : null;
  const claim = await admin.from("course_content_claims").upsert({ user_id: user.id, lesson_id: lesson.id, source: tag("utm_source"), medium: tag("utm_medium"), campaign: tag("utm_campaign") }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });
  if (claim.error) return NextResponse.json({ error: "이용 내역을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 503 });
  return NextResponse.json({ content: delivery }, { headers: { "Cache-Control": "private, no-store" } });
}
