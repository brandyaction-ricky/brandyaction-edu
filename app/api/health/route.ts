import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig, hasSupabaseEnv } from "@/lib/supabase/config";

export async function GET() {
  const environment = process.env.NEXT_PUBLIC_APP_ENV ?? "production";
  const headers = { "Cache-Control": "no-store, max-age=0" };

  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, environment, service: "supabase", reason: "missing_public_environment" },
      { status: 503, headers },
    );
  }

  const { publicUrl, publishableKey } = getSupabasePublicConfig();
  const supabase = createClient(publicUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { count, error } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  if (error) {
    return NextResponse.json(
      { ok: false, environment, service: "supabase", reason: "query_failed" },
      { status: 503, headers },
    );
  }

  return NextResponse.json({
    ok: true,
    environment,
    service: "supabase",
    publishedCourses: count ?? 0,
  }, { headers });
}
