import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") || "/my";
  const consentVersion = searchParams.get("consent");
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/my";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (consentVersion === "2026-08-06") {
        await supabase.auth.updateUser({ data: { terms_version: consentVersion, privacy_version: consentVersion, consented_at: new Date().toISOString() } });
      }
      const forwardedHost = request.headers.get("x-forwarded-host");
      if (process.env.NODE_ENV !== "development" && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
