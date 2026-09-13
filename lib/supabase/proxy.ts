import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { oauthCallbackRecoveryPath } from "@/lib/oauth-callback";
import { getSupabasePublicConfig, hasSupabaseEnv } from "./config";

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next({ request });

  // Supabase falls back to the configured Site URL when an OAuth redirect URL
  // is missing from its allow list. Recover that response without accepting
  // unrelated `?code=` query parameters on the homepage.
  const recoveryPath = oauthCallbackRecoveryPath({
    pathname: request.nextUrl.pathname,
    code: request.nextUrl.searchParams.get("code"),
    cookieNames: request.cookies.getAll().map(({ name }) => name),
  });
  if (recoveryPath) {
    return NextResponse.redirect(new URL(recoveryPath, request.url));
  }

  let response = NextResponse.next({ request });
  const { publicUrl, publishableKey } = getSupabasePublicConfig();
  const supabase = createServerClient(publicUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers || {}).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set('Cache-Control', 'private, no-store');
      },
    },
  });

  // 서버 권한 판단에는 getSession()이 아니라 검증된 JWT claims를 사용합니다.
  await supabase.auth.getClaims();
  return response;
}
