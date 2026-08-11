import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig, hasSupabaseEnv } from "@/lib/supabase/config";

export async function GET() {
  const environment = process.env.NEXT_PUBLIC_APP_ENV ?? "production";

  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, environment, service: "supabase", reason: "missing_public_environment" },
      { status: 503 },
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
      { ok: false, service: "supabase", reason: "query_failed" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    environment,
    service: "supabase",
    publishedCourses: count ?? 0,
  });
}
