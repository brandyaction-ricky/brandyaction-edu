import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";

const names = new Set(["page_view","click","article_view","article_click","class_view","checkout_view","application_click","order_complete"]);
const safeText = (value: unknown, max: number) => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") return new NextResponse(null, { status: 204 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventName = safeText(body?.eventName, 40);
  const path = safeText(body?.path, 500);
  if (!body || !names.has(eventName) || !path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/api")) return new NextResponse(null, { status: 204 });
  const cookieHeader = request.headers.get("cookie") || "";
  const existing = cookieHeader.match(/(?:^|;\s*)ba_journey=([^;]+)/)?.[1];
  const sessionId = existing && /^[a-zA-Z0-9-]{8,80}$/.test(existing) ? existing : randomUUID();
  const metadataInput = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  const metadata = Object.fromEntries(Object.entries(metadataInput).slice(0, 12).map(([key, value]) => [safeText(key, 40), safeText(value, 180)]));
  try {
    const user = await getAuthenticatedUser();
    await createAdminClient().from("customer_journey_events").insert({
      session_id: sessionId,
      user_id: user?.id || null,
      event_name: eventName,
      path,
      target_path: safeText(body.targetPath, 500) || null,
      element_label: safeText(body.elementLabel, 160) || null,
      metadata,
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const response = new NextResponse(null, { status: 204 });
  if (!existing) response.cookies.set("ba_journey", sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 });
  return response;
}
