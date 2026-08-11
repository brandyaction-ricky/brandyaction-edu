import { NextResponse } from "next/server";
import { getLearningHome } from "@/lib/learning-data";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const enrollmentId = url.searchParams.get("enrollment") || "";
  const sessionId = url.searchParams.get("session") || "";
  const kind = url.searchParams.get("kind");
  if (!enrollmentId || !sessionId || !["live", "replay"].includes(kind || "")) {
    return NextResponse.json({ error: "수업 링크 요청이 올바르지 않습니다." }, { status: 400 });
  }
  const home = await getLearningHome(enrollmentId);
  const session = home?.sessions.find((item) => item.id === sessionId);
  const destination = kind === "live" ? session?.liveUrl : session?.replayUrl;
  if (!session || !destination) return NextResponse.json({ error: "수업 링크 또는 접근 권한을 확인해 주세요." }, { status: 404 });
  if (kind === "live" && session.scheduledAt && new Date(session.scheduledAt).getTime() - Date.now() > 30 * 60 * 1000) {
    return NextResponse.json({ error: "라이브 수업은 시작 30분 전부터 입장할 수 있습니다." }, { status: 403 });
  }
  await createAdminClient().from("learning_usage_events").upsert({ enrollment_id: enrollmentId, item_type: kind === "live" ? "live_join" : "replay_view", item_id: sessionId, last_used_at: new Date().toISOString() }, { onConflict: "enrollment_id,item_type,item_id" });
  return NextResponse.redirect(destination, 302);
}
