import { NextResponse, type NextRequest } from "next/server";
import { isAnonymousWebinarRoute } from "@/features/campus/webinar/public-route";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (isAnonymousWebinarRoute(request.nextUrl.pathname, request.method)) return NextResponse.next({ request });
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
