import {campusPrivateRelease,isCampusProtectedPath} from '@/features/campus/private-release';
import {privateCampusResponse} from '@/features/campus/private-proxy';
import { NextResponse, type NextRequest } from "next/server";
import { isAnonymousWebinarRoute } from "@/features/campus/webinar/public-route";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if(campusPrivateRelease()&&isCampusProtectedPath(request.nextUrl.pathname))return privateCampusResponse(request);
  if (isAnonymousWebinarRoute(request.nextUrl.pathname, request.method)) return NextResponse.next({ request });
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
