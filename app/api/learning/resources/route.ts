import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLearningLesson } from "@/lib/learning-data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const enrollmentId = url.searchParams.get("enrollment") || "";
  const lessonId = url.searchParams.get("lesson") || "";
  const learning = await getLearningLesson(enrollmentId, lessonId);
  if (!learning?.lesson.resourcePath) return NextResponse.json({ error: "다운로드 권한 또는 파일을 확인해 주세요." }, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("course-resources").createSignedUrl(learning.lesson.resourcePath, 60, { download: learning.lesson.resourceName || true });
  if (error || !data.signedUrl) return NextResponse.json({ error: "다운로드 링크를 만들지 못했습니다." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
