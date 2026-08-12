import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { reviewVideoEmbedUrl } from "@/lib/review-video";

type VideoInput = {
  id?: string;
  title?: string;
  reviewerName?: string;
  reviewerRole?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  isPublished?: boolean;
  displayOrder?: number;
};

function payload(body: VideoInput) {
  const title = body.title?.trim() || "";
  const reviewerName = body.reviewerName?.trim() || "";
  const videoUrl = body.videoUrl?.trim() || "";
  if (!title || !reviewerName || !reviewVideoEmbedUrl(videoUrl)) return null;
  const thumbnailUrl = body.thumbnailUrl?.trim() || null;
  if (thumbnailUrl) {
    try { if (!/^https?:$/.test(new URL(thumbnailUrl).protocol)) return null; } catch { return null; }
  }
  return {
    title,
    reviewer_name: reviewerName,
    reviewer_role: body.reviewerRole?.trim() || null,
    description: body.description?.trim() || null,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    is_published: body.isPublished === true,
    display_order: Number.isInteger(body.displayOrder) ? Number(body.displayOrder) : 0,
  };
}

export async function GET() {
  if (!await getAdminUser("products")) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const { data, error } = await createAdminClient().from("review_videos").select("*").order("display_order").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "영상 후기를 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ videos: data || [] });
}

export async function POST(request: Request) {
  if (!await getAdminUser("products")) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as VideoInput | null;
  const data = body ? payload(body) : null;
  if (!data) return NextResponse.json({ error: "제목·후기자와 올바른 YouTube 또는 Vimeo 주소를 입력해 주세요." }, { status: 400 });
  const { error } = await createAdminClient().from("review_videos").insert(data);
  if (error) return NextResponse.json({ error: "영상 후기를 저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  if (!await getAdminUser("products")) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as VideoInput | null;
  const data = body ? payload(body) : null;
  if (!body?.id || !data) return NextResponse.json({ error: "영상 후기 정보를 확인해 주세요." }, { status: 400 });
  const { error } = await createAdminClient().from("review_videos").update(data).eq("id", body.id);
  if (error) return NextResponse.json({ error: "영상 후기를 수정하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!await getAdminUser("products")) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "영상 후기를 선택해 주세요." }, { status: 400 });
  const { error } = await createAdminClient().from("review_videos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "영상 후기를 삭제하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
