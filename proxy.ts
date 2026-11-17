import {isCampusAdminPage} from '@/lib/oauth-callback';
import {isMemberCampusRoute} from '@/features/campus/member-route';
import {campusPrivateRelease,isCampusProtectedPath} from '@/features/campus/private-release';
import {privateCampusResponse} from '@/features/campus/private-proxy';
import { NextResponse, type NextRequest } from "next/server";
import { isAnonymousWebinarRoute, isPublicWebinarAsset } from "@/features/campus/webinar/public-route";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // The event page/APIs independently require a published event. Keep account,
  // member and operator routes behind the private release gate.
  if (isAnonymousWebinarRoute(request.nextUrl.pathname, request.method) || isPublicWebinarAsset(request.nextUrl.pathname, request.method)) return NextResponse.next({ request });
  // These two pages enforce their own verified session and scope before rendering.
  if ((request.method === 'GET' || request.method === 'HEAD') && isCampusAdminPage(request.nextUrl.pathname)) return updateSession(request);
  if(isMemberCampusRoute(request.nextUrl.pathname,request.method))return updateSession(request);
  if(campusPrivateRelease()&&isCampusProtectedPath(request.nextUrl.pathname))return privateCampusResponse(request);
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
