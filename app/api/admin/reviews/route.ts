import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

export async function GET() {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const { data, error } = await createAdminClient().from("reviews").select("id,author_name,author_nickname,rating,body,status,is_featured,created_at,profiles(email,phone),courses(title),cohorts(name)").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "리뷰 목록을 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ reviews: data || [] });
}

export async function PATCH(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string; status?: string; featured?: boolean } | null;
  if (!body?.id) return NextResponse.json({ error: "리뷰를 선택해 주세요." }, { status: 400 });
  const changes: Record<string, unknown> = {};
  if (body.status && ["pending", "published", "hidden"].includes(body.status)) { changes.status = body.status; changes.published_at = body.status === "published" ? new Date().toISOString() : null; }
  if (typeof body.featured === "boolean") {
    changes.is_featured = body.featured;
    if (body.featured && body.status !== "published") {
      changes.status = "published";
      changes.published_at = new Date().toISOString();
    }
  }
  if (!Object.keys(changes).length) return NextResponse.json({ error: "변경할 리뷰 상태가 없습니다." }, { status: 400 });
  const { error } = await createAdminClient().from("reviews").update(changes).eq("id", body.id);
  if (error) return NextResponse.json({ error: "리뷰 상태를 저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "리뷰를 선택해 주세요." }, { status: 400 });
  const { error } = await createAdminClient().from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "리뷰를 삭제하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
