import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeExternalUrl } from "@/lib/safe-url";

type StoredImage = { id?: string; path?: string };
type LessonInput = { id: string; title: string; description: string; kind: "VOD" | "자료"; duration: string; contentUrl?: string; resourceName?: string; resourcePath?: string };
type WeekInput = { id: string; title: string; goal: string; lessons: LessonInput[] };
type SaveInput = {
  course: { id: string; courseCode: string; slug: string; title: string; summary: string; description: string; category: string; instructorName: string; listPrice: string; durationLabel: string; scheduleLabel: string; programType: "free" | "paid"; status: "draft" | "published" | "archived"; metadata: Record<string, unknown> };
  thumbnail: StoredImage | null;
  images: StoredImage[];
  curriculum: WeekInput[];
  pixels: { meta: string; kakao: string; google: string; enabled: boolean };
};

function messageOf(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const base = parts.join(".").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "file";
  return `${base}${extension}`;
}

function uploadedFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}

export async function GET(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "상품 관리 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "조회할 상품을 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const [courseResult, assetResult, weekResult] = await Promise.all([
    admin.from("courses").select("id,course_code,slug,title,summary,description,category,instructor_name,list_price,duration_label,schedule_label,status,metadata").eq("id", id).single(),
    admin.from("course_assets").select("id,asset_type,storage_path,display_order").eq("course_id", id).order("display_order"),
    admin.from("curriculum_weeks").select("id,week_number,title,goal,display_order,curriculum_lessons(id,day_number,title,description,content_type,duration_label,display_order,lesson_contents(vod_url,resource_name,resource_storage_path))").eq("course_id", id).order("display_order"),
  ]);
  if (courseResult.error || !courseResult.data) return NextResponse.json({ error: messageOf(courseResult.error, "상품을 불러오지 못했습니다.") }, { status: 404 });
  if (assetResult.error) return NextResponse.json({ error: messageOf(assetResult.error, "상품 이미지를 불러오지 못했습니다.") }, { status: 500 });
  if (weekResult.error) return NextResponse.json({ error: messageOf(weekResult.error, "상품 커리큘럼을 불러오지 못했습니다.") }, { status: 500 });
  return NextResponse.json({ course: courseResult.data, assets: assetResult.data || [], weeks: weekResult.data || [] });
}

export async function POST(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "상품 관리 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "상품 저장 요청을 읽지 못했습니다." }, { status: 400 });
  let input: SaveInput;
  try { input = JSON.parse(String(form.get("payload") || "")) as SaveInput; }
  catch { return NextResponse.json({ error: "상품 저장 데이터가 올바르지 않습니다." }, { status: 400 }); }
  const admin = createAdminClient();
  const { course, thumbnail, images, curriculum, pixels } = input;
  const isFreeCourse = course.programType === "free";
  const listPrice = isFreeCourse ? 0 : Number(String(course.listPrice).replace(/[^0-9]/g, ""));
  if (!course.title?.trim() || !course.slug?.trim() || !course.courseCode?.trim()) return NextResponse.json({ error: "상품명·URL·상품 코드를 입력해 주세요." }, { status: 400 });
  if (!Number.isFinite(listPrice) || (!isFreeCourse && listPrice <= 0)) return NextResponse.json({ error: "유료 클래스 정가는 1원 이상으로 입력해 주세요." }, { status: 400 });
  const coursePayload = {
    course_code: course.courseCode.trim(), slug: course.slug.trim(), title: course.title.trim(), summary: course.summary.trim() || null,
    description: course.description.trim() || null, category: course.category.trim() || null, instructor_name: course.instructorName.trim() || null,
    list_price: listPrice, duration_label: course.durationLabel.trim() || null, schedule_label: course.scheduleLabel.trim() || null,
    status: course.status, published_at: course.status === "published" ? new Date().toISOString() : null,
    metadata: { ...(course.metadata || {}), programType: isFreeCourse ? "free" : "paid", tracking: pixels },
  };

  let courseId = course.id;
  if (courseId) {
    const { error } = await admin.from("courses").update(coursePayload).eq("id", courseId);
    if (error) return NextResponse.json({ error: messageOf(error, "상품 기본 정보를 저장하지 못했습니다.") }, { status: 500 });
  } else {
    const { data, error } = await admin.from("courses").insert(coursePayload).select("id").single();
    if (error || !data) return NextResponse.json({ error: messageOf(error, "새 상품을 등록하지 못했습니다. URL이나 코드 중복을 확인해 주세요.") }, { status: 400 });
    courseId = data.id;
  }

  const { data: currentAssets, error: assetLoadError } = await admin.from("course_assets").select("id,asset_type,storage_path").eq("course_id", courseId);
  if (assetLoadError) return NextResponse.json({ error: messageOf(assetLoadError, "기존 상품 이미지를 확인하지 못했습니다.") }, { status: 500 });
  const currentThumbnails = (currentAssets || []).filter((asset) => asset.asset_type === "thumbnail");
  const currentDetails = (currentAssets || []).filter((asset) => asset.asset_type === "detail");
  let retainedThumbnailId = thumbnail?.id;
  const thumbnailFile = uploadedFile(form.get("thumbnail"));
  if (thumbnail?.id) {
    const { error } = await admin.from("course_assets").update({ alt_text: `${course.title} 썸네일`, display_order: 0 }).eq("id", thumbnail.id);
    if (error) return NextResponse.json({ error: messageOf(error, "썸네일 정보를 저장하지 못했습니다.") }, { status: 500 });
  } else if (thumbnailFile) {
    const path = `${courseId}/thumbnail/${Date.now()}-${safeFileName(thumbnailFile.name)}`;
    const upload = await admin.storage.from("course-assets").upload(path, thumbnailFile, { contentType: thumbnailFile.type, upsert: false });
    if (upload.error) return NextResponse.json({ error: messageOf(upload.error, "썸네일 업로드에 실패했습니다.") }, { status: 500 });
    const inserted = await admin.from("course_assets").insert({ course_id: courseId, asset_type: "thumbnail", storage_bucket: "course-assets", storage_path: path, alt_text: `${course.title} 썸네일`, display_order: 0 }).select("id").single();
    if (inserted.error || !inserted.data) { await admin.storage.from("course-assets").remove([path]); return NextResponse.json({ error: messageOf(inserted.error, "썸네일 정보를 저장하지 못했습니다.") }, { status: 500 }); }
    retainedThumbnailId = inserted.data.id;
  }
  const removedThumbnails = currentThumbnails.filter((asset) => asset.id !== retainedThumbnailId);
  if (removedThumbnails.length) {
    await admin.from("course_assets").delete().in("id", removedThumbnails.map((asset) => asset.id));
    await admin.storage.from("course-assets").remove(removedThumbnails.map((asset) => asset.storage_path));
  }

  const retainedAssetIds = new Set(images.flatMap((image) => image.id ? [image.id] : []));
  for (const [index, image] of images.entries()) {
    if (image.id) {
      const { error } = await admin.from("course_assets").update({ display_order: index, alt_text: `${course.title} 상세 이미지 ${index + 1}` }).eq("id", image.id);
      if (error) return NextResponse.json({ error: messageOf(error, "상세 이미지 순서를 저장하지 못했습니다.") }, { status: 500 });
      continue;
    }
    const file = uploadedFile(form.get(`detail-${index}`));
    if (!file) continue;
    const path = `${courseId}/details/${Date.now()}-${index}-${safeFileName(file.name)}`;
    const upload = await admin.storage.from("course-assets").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return NextResponse.json({ error: messageOf(upload.error, "상세 이미지 업로드에 실패했습니다.") }, { status: 500 });
    const inserted = await admin.from("course_assets").insert({ course_id: courseId, asset_type: "detail", storage_bucket: "course-assets", storage_path: path, alt_text: `${course.title} 상세 이미지 ${index + 1}`, display_order: index }).select("id").single();
    if (inserted.error || !inserted.data) { await admin.storage.from("course-assets").remove([path]); return NextResponse.json({ error: messageOf(inserted.error, "상세 이미지 정보를 저장하지 못했습니다.") }, { status: 500 }); }
    retainedAssetIds.add(inserted.data.id);
  }
  const removedDetails = currentDetails.filter((asset) => !retainedAssetIds.has(asset.id));
  if (removedDetails.length) {
    await admin.from("course_assets").delete().in("id", removedDetails.map((asset) => asset.id));
    await admin.storage.from("course-assets").remove(removedDetails.map((asset) => asset.storage_path));
  }

  const { data: currentWeeks, error: weeksError } = await admin.from("curriculum_weeks").select("id,curriculum_lessons(id,lesson_contents(resource_storage_path))").eq("course_id", courseId);
  if (weeksError) return NextResponse.json({ error: messageOf(weeksError, "기존 커리큘럼을 확인하지 못했습니다.") }, { status: 500 });
  const existingWeekIds = new Set((currentWeeks || []).map((week) => week.id));
  const existingLessons = (currentWeeks || []).flatMap((week) => (week.curriculum_lessons || []).map((lesson) => ({ ...lesson, weekId: week.id })));
  const retainedWeekIds = new Set(curriculum.filter((week) => existingWeekIds.has(week.id)).map((week) => week.id));
  const existingLessonIds = new Set(existingLessons.map((lesson) => lesson.id));
  const retainedLessonIds = new Set(curriculum.flatMap((week) => week.lessons.map((lesson) => lesson.id)).filter((id) => existingLessonIds.has(id)));
  const removedLessonIds = existingLessons.filter((lesson) => !retainedWeekIds.has(lesson.weekId) || !retainedLessonIds.has(lesson.id)).map((lesson) => lesson.id);
  if (removedLessonIds.length) {
    const progress = await admin.from("lesson_progress").select("lesson_id").in("lesson_id", removedLessonIds).limit(1);
    if (progress.data?.length) return NextResponse.json({ error: "수강 진도가 기록된 강의는 삭제할 수 없습니다. 콘텐츠만 수정해 주세요." }, { status: 409 });
  }
  const oldResourcePaths = existingLessons.flatMap((lesson) => { const content = Array.isArray(lesson.lesson_contents) ? lesson.lesson_contents[0] : lesson.lesson_contents; return content?.resource_storage_path ? [content.resource_storage_path] : []; });
  const retainedResourcePaths = new Set<string>();
  const removedWeeks = (currentWeeks || []).filter((week) => !retainedWeekIds.has(week.id));
  if (removedWeeks.length) await admin.from("curriculum_weeks").delete().in("id", removedWeeks.map((week) => week.id));
  const removedStandalone = existingLessons.filter((lesson) => retainedWeekIds.has(lesson.weekId) && !retainedLessonIds.has(lesson.id));
  if (removedStandalone.length) await admin.from("curriculum_lessons").delete().in("id", removedStandalone.map((lesson) => lesson.id));
  for (const [index, week] of curriculum.entries()) if (existingWeekIds.has(week.id)) await admin.from("curriculum_weeks").update({ week_number: 10000 + index, display_order: index }).eq("id", week.id);

  let dayNumber = 1;
  for (const [weekIndex, week] of curriculum.entries()) {
    let weekId = week.id;
    const weekPayload = { course_id: courseId, week_number: weekIndex + 1, title: week.title.trim() || `${weekIndex + 1}주차`, goal: week.goal.trim() || null, is_published: true, display_order: weekIndex };
    if (existingWeekIds.has(week.id)) {
      const result = await admin.from("curriculum_weeks").update(weekPayload).eq("id", week.id);
      if (result.error) return NextResponse.json({ error: messageOf(result.error, "주차 정보를 수정하지 못했습니다.") }, { status: 500 });
    } else {
      const result = await admin.from("curriculum_weeks").insert(weekPayload).select("id").single();
      if (result.error || !result.data) return NextResponse.json({ error: messageOf(result.error, "새 주차를 추가하지 못했습니다.") }, { status: 500 });
      weekId = result.data.id;
    }
    const currentWeekLessonIds = new Set(existingLessons.filter((lesson) => lesson.weekId === week.id).map((lesson) => lesson.id));
    for (const [index, lesson] of week.lessons.entries()) if (currentWeekLessonIds.has(lesson.id)) await admin.from("curriculum_lessons").update({ day_number: 10000 + index }).eq("id", lesson.id);
    for (const [lessonIndex, lesson] of week.lessons.entries()) {
      const kind = lesson.kind === "자료" ? "material" : "vod";
      const lessonPayload = { week_id: weekId, day_number: dayNumber++, title: lesson.title.trim() || "새 강의", description: lesson.description.trim() || null, content_type: kind, duration_label: lesson.duration.trim() || null, is_preview: false, is_published: true, display_order: lessonIndex };
      let lessonId = lesson.id;
      if (currentWeekLessonIds.has(lesson.id)) {
        const result = await admin.from("curriculum_lessons").update(lessonPayload).eq("id", lesson.id);
        if (result.error) return NextResponse.json({ error: messageOf(result.error, "강의 정보를 수정하지 못했습니다.") }, { status: 500 });
      } else {
        const result = await admin.from("curriculum_lessons").insert(lessonPayload).select("id").single();
        if (result.error || !result.data) return NextResponse.json({ error: messageOf(result.error, "새 강의를 추가하지 못했습니다.") }, { status: 500 });
        lessonId = result.data.id;
      }
      if (kind === "vod") {
        const vodUrl = lesson.contentUrl?.trim();
        if (vodUrl && !safeExternalUrl(vodUrl)) return NextResponse.json({ error: "VOD 링크는 https:// 주소로 입력해 주세요." }, { status: 400 });
        if (vodUrl) await admin.from("lesson_contents").upsert({ lesson_id: lessonId, vod_url: vodUrl, resource_name: null, resource_storage_path: null }, { onConflict: "lesson_id" });
        else await admin.from("lesson_contents").delete().eq("lesson_id", lessonId);
        continue;
      }
      let resourcePath = lesson.resourcePath;
      let resourceName = lesson.resourceName;
      const file = uploadedFile(form.get(`resource-${weekIndex}-${lessonIndex}`));
      if (file) {
        resourcePath = `${courseId}/curriculum/${Date.now()}-${safeFileName(file.name)}`;
        resourceName = file.name;
        const upload = await admin.storage.from("course-resources").upload(resourcePath, file, { contentType: file.type || undefined, upsert: false });
        if (upload.error) return NextResponse.json({ error: messageOf(upload.error, `${file.name} 업로드에 실패했습니다.`) }, { status: 500 });
      }
      if (resourcePath) {
        retainedResourcePaths.add(resourcePath);
        const result = await admin.from("lesson_contents").upsert({ lesson_id: lessonId, vod_url: null, resource_name: resourceName || "학습 자료", resource_storage_path: resourcePath }, { onConflict: "lesson_id" });
        if (result.error) return NextResponse.json({ error: messageOf(result.error, "학습 자료를 연결하지 못했습니다.") }, { status: 500 });
      } else await admin.from("lesson_contents").delete().eq("lesson_id", lessonId);
    }
  }
  const obsoletePaths = oldResourcePaths.filter((path) => !retainedResourcePaths.has(path));
  if (obsoletePaths.length) await admin.storage.from("course-resources").remove(obsoletePaths);
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: course.id ? "course.updated" : "course.created", entity_type: "course", entity_id: courseId, after_data: { title: course.title, status: course.status } });
  return NextResponse.json({ courseId });
}

export async function DELETE(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "상품 관리 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "삭제할 상품을 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const [assets, contents] = await Promise.all([
    admin.from("course_assets").select("storage_path").eq("course_id", id),
    admin.from("lesson_contents").select("resource_storage_path,curriculum_lessons!inner(curriculum_weeks!inner(course_id))").eq("curriculum_lessons.curriculum_weeks.course_id", id),
  ]);
  const result = await admin.from("courses").delete().eq("id", id);
  if (result.error) return NextResponse.json({ error: result.error.code === "23503" ? "주문·수강권·후기가 연결된 상품은 삭제할 수 없습니다. 판매 상태를 ‘보관’으로 변경해 주세요." : messageOf(result.error, "상품을 삭제하지 못했습니다.") }, { status: result.error.code === "23503" ? 409 : 500 });
  const assetPaths = (assets.data || []).map((row) => row.storage_path);
  const resourcePaths = (contents.data || []).flatMap((row) => row.resource_storage_path ? [row.resource_storage_path] : []);
  if (assetPaths.length) await admin.storage.from("course-assets").remove(assetPaths);
  if (resourcePaths.length) await admin.storage.from("course-resources").remove(resourcePaths);
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "course.deleted", entity_type: "course", entity_id: id });
  return NextResponse.json({ ok: true });
}
