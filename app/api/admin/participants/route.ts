import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { UUID_PATTERN } from "@/lib/course-content";

export async function GET(request: Request) {
  if (!await getAdminUser("members")) return NextResponse.json({ error: "참가자 관리 권한이 필요합니다." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const cohort = params.get("cohort");
  if (cohort && !UUID_PATTERN.test(cohort)) return NextResponse.json({ error: "기수를 확인해 주세요." }, { status: 400 });
  const level = Number(params.get("level"));
  const { data, error } = await createAdminClient().rpc("admin_participant_report", { p_cohort: cohort, p_search: (params.get("q") || "").trim().slice(0, 100), p_level: Number.isInteger(level) && level >= 1 && level <= 5 ? level : null, p_attention: params.get("status") === "attention" ? true : params.get("status") === "normal" ? false : null, p_page: Math.max(1, Math.min(100000, Math.floor(Number(params.get("page")) || 1))) });
  if (error) return NextResponse.json({ error: "참가자 현황을 불러오지 못했습니다." }, { status: 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
