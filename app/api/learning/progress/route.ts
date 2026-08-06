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
