import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { courseId?: string; cohortId?: string; rating?: number; body?: string; authorName?: string } | null;
  const rating = Number(body?.rating);
  const reviewBody = body?.body?.trim() || "";
  if (!body?.courseId || !body.cohortId || !Number.isInteger(rating) || rating < 1 || rating > 5 || reviewBody.length < 10 || reviewBody.length > 2000) {
    return NextResponse.json({ error: "별점과 10자 이상의 후기를 입력해 주세요." }, { status: 400 });
  }
  const supabase = await createClient();
  const [{ data: enrollment }, { data: profile }] = await Promise.all([
    supabase.from("enrollments").select("id").eq("user_id", user.id).eq("course_id", body.courseId).eq("cohort_id", body.cohortId).eq("status", "active").lte("access_starts_at", new Date().toISOString()).or(`access_ends_at.is.null,access_ends_at.gt.${new Date().toISOString()}`).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!enrollment) return NextResponse.json({ error: "해당 기수의 활성 수강권을 확인할 수 없습니다." }, { status: 403 });
  const { error } = await supabase.from("reviews").insert({
    user_id: user.id,
    course_id: body.courseId,
    cohort_id: body.cohortId,
    author_name: profile?.full_name?.trim() || body.authorName?.trim() || user.email.split("@")[0],
    rating,
    body: reviewBody,
    status: "pending",
    is_featured: false,
  });
  if (error?.code === "23505") return NextResponse.json({ error: "이 클래스에는 이미 후기를 작성했습니다." }, { status: 409 });
  if (error) return NextResponse.json({ error: "수강권을 확인할 수 없거나 후기를 저장하지 못했습니다." }, { status: 403 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
