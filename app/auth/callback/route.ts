import { safeNext } from "@/lib/platform";
import { NextResponse } from "next/server";
import { createClient, type ServerCookieMutation } from "@/lib/supabase/server";
import { syncKakaoConsent } from "@/lib/kakao-sync-server";

function redirectWithCookies(url: string, cookies: ServerCookieMutation[]) {
  const response = NextResponse.redirect(url);
  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") || "/my";
  const next = safeNext(requestedNext);

  if (code) {
    const cookies: ServerCookieMutation[] = [];
    const supabase = await createClient(nextCookies => cookies.push(...nextCookies));
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: userData } = await supabase.auth.getUser();
      const metadata = userData.user?.user_metadata || {};
      if (userData.user && next === '/auth/reset-password') {
        return redirectWithCookies(`${origin}/auth/reset-password`, cookies);
      }
      const syncAgreed = searchParams.get("provider") === "kakao" && userData.user
        ? await syncKakaoConsent(userData.user, sessionData.session?.provider_token)
        : false;
      if (!syncAgreed && (!metadata.terms_version || !metadata.privacy_version)) {
        return redirectWithCookies(`${origin}/auth/consent?next=${encodeURIComponent(next)}`, cookies);
      }
      return redirectWithCookies(`${origin}${next}`, cookies);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
