import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN, validateCurriculum } from "@/lib/course-content";
import type { MissionWorkspace } from "@/lib/admin-missions";
import type { CurriculumWeek } from "@/app/data";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  if (!await getAdminUser("products")) return NextResponse.json({ error: "미션 관리 권한이 필요합니다." }, { status: 403 });
  const courseId = new URL(request.url).searchParams.get("course") || null;
  if (courseId && !UUID_PATTERN.test(courseId)) return NextResponse.json({ error: "클래스를 확인해 주세요." }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("admin_mission_workspace", { p_course_id: courseId });
  if (error) return NextResponse.json({ error: "미션 목록을 불러오지 못했습니다." }, { status: 503 });
  return NextResponse.json(data, { headers });
}

export async function PUT(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "미션 관리 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!UUID_PATTERN.test(body?.courseId || "") || typeof body?.revision !== "string" || !/^[a-f0-9]{32}$/.test(body.revision)) return NextResponse.json({ error: "클래스와 편집 상태를 확인해 주세요." }, { status: 400 });
  const invalid = validateCurriculum(body.weeks, body.courseId);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const weeks = body.weeks as CurriculumWeek[];
  if (weeks.some((week) => !UUID_PATTERN.test(week.id) || week.lessons.some((lesson) => !UUID_PATTERN.test(lesson.id)))) return NextResponse.json({ error: "콘텐츠 ID를 확인해 주세요." }, { status: 400 });
  if (weeks.some((week) => week.isPublished !== false && week.lessons.some((lesson) => lesson.isPublished !== false && lesson.accessMode === "member" && lesson.kind === "자료" && !lesson.resourcePath))) return NextResponse.json({ error: "무료 자료 파일을 먼저 업로드해 주세요." }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("save_admin_mission_workspace", { p_course_id: body.courseId, p_actor: operator.id, p_weeks: weeks, p_revision: body.revision });
  if (error) return NextResponse.json({ error: error.code === "40001" ? error.message : "저장하지 못했습니다. 이용 기록이 있는 미션은 삭제 대신 비공개로 전환해 주세요.", conflict: error.code === "40001" }, { status: 409 });
  const workspace = data as MissionWorkspace;
  const course = workspace.courses.find((item) => item.id === body.courseId);
  if (course) { revalidatePath(`/classes/${course.slug}`); revalidatePath(`/resources/${course.slug}`); }
  revalidatePath("/admin/missions");
  revalidatePath("/admin/quizzes");
  return NextResponse.json(workspace, { headers });
}
