import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { enrollmentId?: string; lessonId?: string; progress?: number; position?: number } | null;
  const progress = Math.max(0, Math.min(100, Math.round(Number(body?.progress))));
  const position = Math.max(0, Math.round(Number(body?.position) || 0));
  if (!body?.enrollmentId || !body.lessonId || !Number.isFinite(progress)) return NextResponse.json({ error: "진도 정보가 올바르지 않습니다." }, { status: 400 });
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id,course_id")
    .eq("id", body.enrollmentId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .lte("access_starts_at", now)
    .or("access_ends_at.is.null,access_ends_at.gt." + now)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "현재 이용할 수 있는 수강권이 아닙니다." }, { status: 403 });

  const { data: lesson } = await supabase
    .from("curriculum_lessons")
    .select("id,curriculum_weeks!inner(course_id,is_published)")
    .eq("id", body.lessonId)
    .eq("is_published", true)
    .eq("curriculum_weeks.course_id", enrollment.course_id)
    .eq("curriculum_weeks.is_published", true)
    .maybeSingle();
  if (!lesson) return NextResponse.json({ error: "현재 수강할 수 있는 강의가 아닙니다." }, { status: 403 });

  const { error } = await supabase.from("lesson_progress").upsert({
    enrollment_id: body.enrollmentId,
    lesson_id: body.lessonId,
    progress_percent: progress,
    last_position_seconds: position,
    completed_at: progress === 100 ? new Date().toISOString() : null,
  }, { onConflict: "enrollment_id,lesson_id" });
  if (error) return NextResponse.json({ error: "진도를 저장할 수 없습니다." }, { status: 403 });
  return NextResponse.json({ ok: true, progress });
}
