import { safeNext } from "@/lib/platform";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncKakaoConsent } from "@/lib/kakao-sync-server";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") || "/my";
  const next = safeNext(requestedNext);

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: userData } = await supabase.auth.getUser();
      const metadata = userData.user?.user_metadata || {};
      const syncAgreed = searchParams.get("provider") === "kakao" && userData.user
        ? await syncKakaoConsent(userData.user, sessionData.session?.provider_token)
        : false;
      if (!syncAgreed && (!metadata.terms_version || !metadata.privacy_version)) {
        return NextResponse.redirect(`${origin}/auth/consent?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
