import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLearningLesson } from "@/lib/learning-data";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const enrollmentId = url.searchParams.get("enrollment") || "";
  const lessonId = url.searchParams.get("lesson") || "";
  const learning = await getLearningLesson(enrollmentId, lessonId);
  if (!learning?.lesson.resourcePath) return NextResponse.json({ error: "다운로드 권한 또는 파일을 확인해 주세요." }, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("course-resources").createSignedUrl(learning.lesson.resourcePath, 60, { download: learning.lesson.resourceName || true });
  if (error || !data.signedUrl) return NextResponse.json({ error: "다운로드 링크를 만들지 못했습니다." }, { status: 500 });
  await createAdminClient().from("learning_usage_events").upsert({ enrollment_id: enrollmentId, item_type: "material_download", item_id: lessonId, last_used_at: new Date().toISOString() }, { onConflict: "enrollment_id,item_type,item_id" });
  return NextResponse.redirect(data.signedUrl, 302);
}
