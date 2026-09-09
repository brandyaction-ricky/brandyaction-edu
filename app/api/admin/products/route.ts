import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { CurriculumWeek } from "@/app/data";
import { UUID_PATTERN, validateCurriculum } from "@/lib/course-content";

type StoredImage = { id?: string; path?: string };
type SaveInput = {
  course: { id: string; courseCode: string; slug: string; title: string; summary: string; description: string; category: string; instructorName: string; listPrice: string; durationLabel: string; scheduleLabel: string; programType: "free" | "paid"; status: "draft" | "published" | "archived"; recruitmentStatus: "preparing" | "recruiting" | "closed"; recruitmentStartAt: string; recruitmentEndAt: string; hasLinkedCohort: boolean; metadata: Record<string, unknown> };
  thumbnail: StoredImage | null;
  images: StoredImage[];
  curriculum: CurriculumWeek[];
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

function nullableDate(value: unknown) {
  const text = String(value || "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null;
}

function selectRecruitmentCohort<T extends { status:string; operation_start_at?:string|null; recruitment_start_at?:string|null; recruitment_end_at?:string|null }>(rows: T[]) {
  const now = Date.now();
  const rank = (item: T) => {
    const startsAt = Date.parse(item.recruitment_start_at || "") || null;
    const endsAt = Date.parse(item.recruitment_end_at || "") || null;
    const isOpen = item.status === "recruiting" && (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
    if (isOpen) return 0;
    if (item.status === "upcoming") return 1;
    if (item.status === "recruiting") return 2;
    if (item.status === "closed") return 3;
    return 9;
  };
  return [...rows].sort((a, b) => {
    const statusOrder = rank(a) - rank(b);
    if (statusOrder) return statusOrder;
    const aDate = Date.parse(a.operation_start_at || a.recruitment_end_at || "") || 0;
    const bDate = Date.parse(b.operation_start_at || b.recruitment_end_at || "") || 0;
    return bDate - aDate;
  })[0] || null;
}

export async function GET(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "상품 관리 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const admin = createAdminClient();
  if (!id) {
    const courses = await admin.from("courses").select("id,slug,title,instructor_name,list_price,duration_label,status,metadata").order("display_order", { ascending: false }).order("created_at", { ascending: false });
    if (courses.error) return NextResponse.json({ error: "클래스 목록을 불러오지 못했습니다." }, { status: 500 });
    const ids = (courses.data || []).map((course) => course.id);
    if (!ids.length) return NextResponse.json({ products: [] });
    const [assets, weeks] = await Promise.all([
      admin.from("course_assets").select("course_id,asset_type,storage_path").in("course_id", ids),
      admin.from("curriculum_weeks").select("course_id,curriculum_lessons(id)").in("course_id", ids),
    ]);
    if (assets.error || weeks.error) return NextResponse.json({ error: "클래스 콘텐츠 정보를 불러오지 못했습니다." }, { status: 500 });
    const counts = new Map(ids.map((courseId) => [courseId, { imageCount: 0, weekCount: 0, lessonCount: 0, thumbnailUrl: undefined as string | undefined }]));
    for (const asset of assets.data || []) { const count = counts.get(asset.course_id); if (!count) continue; if (asset.asset_type === "detail") count.imageCount++; if (asset.asset_type === "thumbnail") count.thumbnailUrl = admin.storage.from("course-assets").getPublicUrl(asset.storage_path).data.publicUrl; }
    for (const week of weeks.data || []) { const count = counts.get(week.course_id); if (!count) continue; count.weekCount++; count.lessonCount += week.curriculum_lessons?.length || 0; }
    return NextResponse.json({ products: (courses.data || []).map((course) => ({ id: course.id, slug: course.slug, title: course.title, instructorName: course.instructor_name || "브랜디액션", listPrice: course.list_price, durationLabel: course.duration_label || "기간 미정", status: course.status, programType: course.metadata?.programType === "free" ? "free" : "paid", productKind: course.metadata?.productKind === "digital" ? "digital" : "class", ...counts.get(course.id) })) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "클래스 ID를 확인해 주세요." }, { status: 400 });
  const [courseResult, assetResult, weekResult, cohortResult] = await Promise.all([
    admin.from("courses").select("id,course_code,slug,title,summary,description,category,instructor_name,list_price,duration_label,schedule_label,status,metadata").eq("id", id).single(),
    admin.from("course_assets").select("id,asset_type,storage_path,display_order").eq("course_id", id).order("display_order"),
    admin.from("curriculum_weeks").select("id,week_number,title,goal,is_published,display_order,curriculum_lessons(id,day_number,title,description,content_type,duration_label,is_published,access_mode,display_order,lesson_contents(vod_url,resource_name,resource_storage_path,body_text,external_url),curriculum_missions(title,instructions,is_required,submission_type,is_published,mission_quizzes(questions,pass_percent)))").eq("course_id", id).order("display_order"),
    admin.from("cohorts").select("id,status,recruitment_start_at,recruitment_end_at,operation_start_at").eq("course_id", id).in("status", ["upcoming", "recruiting", "closed"]),
  ]);
  if (courseResult.error || !courseResult.data) return NextResponse.json({ error: messageOf(courseResult.error, "상품을 불러오지 못했습니다.") }, { status: 404 });
  if (assetResult.error) return NextResponse.json({ error: messageOf(assetResult.error, "상품 이미지를 불러오지 못했습니다.") }, { status: 500 });
  if (weekResult.error) return NextResponse.json({ error: messageOf(weekResult.error, "상품 커리큘럼을 불러오지 못했습니다.") }, { status: 500 });
  if (cohortResult.error) return NextResponse.json({ error: messageOf(cohortResult.error, "연결 기수의 모집 상태를 불러오지 못했습니다.") }, { status: 500 });
  return NextResponse.json({ course: courseResult.data, assets: assetResult.data || [], weeks: weekResult.data || [], recruitment: selectRecruitmentCohort(cohortResult.data || []) });
}

export async function POST(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "상품 관리 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "상품 저장 요청을 읽지 못했습니다." }, { status: 400 });
  let input: SaveInput;
  try { input = JSON.parse(String(form.get("payload") || "")) as SaveInput; }
  catch { return NextResponse.json({ error: "상품 저장 데이터가 올바르지 않습니다." }, { status: 400 }); }
  if (!input || typeof input !== "object") return NextResponse.json({ error: "상품 저장 데이터를 확인해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const { course, thumbnail, images, curriculum, pixels } = input;
  if (!course || !Array.isArray(images) || images.length > 20 || !pixels || !Array.isArray(curriculum)) return NextResponse.json({ error: "상품 저장 데이터를 확인해 주세요." }, { status: 400 });
  const curriculumError = validateCurriculum(curriculum, course.id);
  if (curriculumError) return NextResponse.json({ error: curriculumError }, { status: 400 });
  if (curriculum.some((week) => week.isPublished !== false && week.lessons.some((lesson) => lesson.isPublished !== false && lesson.accessMode === "member" && lesson.kind === "자료" && !lesson.resourcePath))) return NextResponse.json({ error: "무료 자료 파일을 업로드한 뒤 공개해 주세요." }, { status: 400 });
  if (course.id && !UUID_PATTERN.test(course.id)) return NextResponse.json({ error: "클래스 ID를 확인해 주세요." }, { status: 400 });
  if (!["draft","published","archived"].includes(course.status) || !["free","paid"].includes(course.programType) || !["preparing","recruiting","closed"].includes(course.recruitmentStatus)) return NextResponse.json({ error: "공개·모집 상태를 확인해 주세요." }, { status: 400 });
  for (const key of ["title","slug","courseCode","summary","description","category","instructorName","durationLabel","scheduleLabel"] as const) {
    if (typeof course[key] !== "string" || course[key].length > 50000) return NextResponse.json({ error: "상품 입력값을 확인해 주세요." }, { status: 400 });
  }
  const assetPaths = [thumbnail, ...images].flatMap((asset) => asset?.path ? [asset.path] : []);
  if (assetPaths.some((path) => !course.id || !path.startsWith(`${course.id}/`) || path.includes(".."))) return NextResponse.json({ error: "이 클래스에 업로드한 이미지만 연결할 수 있습니다." }, { status: 400 });
  const isFreeCourse = course.programType === "free";
  const listPrice = isFreeCourse ? 0 : Number(String(course.listPrice).replace(/[^0-9]/g, ""));
  if (!course.title?.trim() || !course.slug?.trim() || !course.courseCode?.trim()) return NextResponse.json({ error: "상품명·URL·상품 코드를 입력해 주세요." }, { status: 400 });
  if (!Number.isFinite(listPrice) || (!isFreeCourse && listPrice <= 0)) return NextResponse.json({ error: "유료 클래스 정가는 1원 이상으로 입력해 주세요." }, { status: 400 });
  if (course.recruitmentStatus === "recruiting" && course.status !== "published") return NextResponse.json({ error: "모집 진행 상품은 판매 상태를 ‘판매 중’으로 설정해 주세요." }, { status: 400 });
  const recruitmentStartAt = nullableDate(course.recruitmentStartAt);
  const recruitmentEndAt = nullableDate(course.recruitmentEndAt);
  const now = Date.now();
  if (course.recruitmentStatus === "recruiting" && recruitmentEndAt && Date.parse(recruitmentEndAt) <= now) return NextResponse.json({ error: "모집 진행 상태의 모집 마감일은 현재 시각 이후여야 합니다." }, { status: 400 });
  if (recruitmentStartAt && recruitmentEndAt && Date.parse(recruitmentStartAt) >= Date.parse(recruitmentEndAt)) return NextResponse.json({ error: "모집 마감일은 모집 시작일보다 뒤여야 합니다." }, { status: 400 });
  let recruitmentCohort: { id:string; status:string; recruitment_start_at:string|null; recruitment_end_at:string|null; operation_start_at:string|null } | null = null;
  if (course.id) {
    const currentCohorts = await admin.from("cohorts").select("id,status,recruitment_start_at,recruitment_end_at,operation_start_at").eq("course_id", course.id).in("status", ["upcoming", "recruiting", "closed"]);
    if (currentCohorts.error) return NextResponse.json({ error: messageOf(currentCohorts.error, "연결 기수의 모집 상태를 확인하지 못했습니다.") }, { status: 500 });
    recruitmentCohort = selectRecruitmentCohort(currentCohorts.data || []);
  }
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

  const mappedStatus = course.recruitmentStatus === "recruiting" ? "recruiting" : course.recruitmentStatus === "closed" ? "closed" : "upcoming";
  if (!recruitmentCohort) {
    const cohortCount = await admin.from("cohorts").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    if (cohortCount.error) return NextResponse.json({ error: messageOf(cohortCount.error, "기수 순서를 확인하지 못했습니다.") }, { status: 500 });
    const cohortNumber = (cohortCount.count || 0) + 1;
    const createdCohort = await admin.from("cohorts").insert({
      course_id: courseId,
      cohort_code: `${course.courseCode.trim()}_${Date.now()}`,
      name: `${cohortNumber}기`,
      note: "상품 등록 시 자동 생성",
      recruitment_start_at: recruitmentStartAt,
      recruitment_end_at: recruitmentEndAt,
      operation_start_at: null,
      operation_end_at: null,
      price: listPrice,
      capacity: null,
      status: mappedStatus,
    }).select("id,status,recruitment_start_at,recruitment_end_at,operation_start_at").single();
    if (createdCohort.error || !createdCohort.data) return NextResponse.json({ error: messageOf(createdCohort.error, "상품은 저장했지만 모집 기수를 생성하지 못했습니다.") }, { status: 500 });
    recruitmentCohort = createdCohort.data;
  } else {
    const cohortUpdate = await admin.from("cohorts").update({ status: mappedStatus, recruitment_start_at: recruitmentStartAt, recruitment_end_at: recruitmentEndAt }).eq("id", recruitmentCohort.id);
    if (cohortUpdate.error) return NextResponse.json({ error: messageOf(cohortUpdate.error, "연결 기수의 모집 상태를 저장하지 못했습니다.") }, { status: 500 });
  }

  const { data: currentAssets, error: assetLoadError } = await admin.from("course_assets").select("id,asset_type,storage_path").eq("course_id", courseId);
  if (assetLoadError) return NextResponse.json({ error: messageOf(assetLoadError, "기존 상품 이미지를 확인하지 못했습니다.") }, { status: 500 });
  const ownedAssetIds = new Set((currentAssets || []).map((asset) => asset.id));
  if ([thumbnail, ...images].some((asset) => asset?.id && !ownedAssetIds.has(asset.id))) return NextResponse.json({ error: "이미지 정보가 변경되었습니다. 새로고침 후 다시 저장해 주세요." }, { status: 409 });
  const currentThumbnails = (currentAssets || []).filter((asset) => asset.asset_type === "thumbnail");
  const currentDetails = (currentAssets || []).filter((asset) => asset.asset_type === "detail");
  let retainedThumbnailId = thumbnail?.id;
  const thumbnailFile = uploadedFile(form.get("thumbnail"));
  if (thumbnail?.id) {
    const { error } = await admin.from("course_assets").update({ alt_text: `${course.title} 썸네일`, display_order: 0 }).eq("id", thumbnail.id).eq("course_id", courseId);
    if (error) return NextResponse.json({ error: messageOf(error, "썸네일 정보를 저장하지 못했습니다.") }, { status: 500 });
  } else if (thumbnail?.path) {
    const inserted = await admin.from("course_assets").insert({ course_id: courseId, asset_type: "thumbnail", storage_bucket: "course-assets", storage_path: thumbnail.path, alt_text: `${course.title} 썸네일`, display_order: 0 }).select("id").single();
    if (inserted.error || !inserted.data) return NextResponse.json({ error: "썸네일 연결에 실패했습니다." }, { status: 500 });
    retainedThumbnailId = inserted.data.id;
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
      const { error } = await admin.from("course_assets").update({ display_order: index, alt_text: `${course.title} 상세 이미지 ${index + 1}` }).eq("id", image.id).eq("course_id", courseId);
      if (error) return NextResponse.json({ error: messageOf(error, "상세 이미지 순서를 저장하지 못했습니다.") }, { status: 500 });
      continue;
    }
    if (image.path) {
      const inserted = await admin.from("course_assets").insert({ course_id: courseId, asset_type: "detail", storage_bucket: "course-assets", storage_path: image.path, alt_text: `${course.title} 상세 이미지 ${index + 1}`, display_order: index }).select("id").single();
      if (inserted.error || !inserted.data) return NextResponse.json({ error: "상세 이미지 연결에 실패했습니다." }, { status: 500 });
      retainedAssetIds.add(inserted.data.id);
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

  // Stable IDs and one transaction preserve learner history during reorder/edit.
  const normalized = curriculum.map((week) => ({
    ...week, id: UUID_PATTERN.test(week.id) ? week.id : randomUUID(),
    lessons: week.lessons.map((lesson) => ({ ...lesson, id: UUID_PATTERN.test(lesson.id) ? lesson.id : randomUUID() })),
  }));
  const savedCurriculum = await admin.rpc("save_course_curriculum", { p_course_id: courseId, p_actor: operator.id, p_weeks: normalized });
  if (savedCurriculum.error) return NextResponse.json({ error: `기본 정보는 저장했지만 콘텐츠 저장은 취소되었습니다. ${savedCurriculum.error.message}`, courseId }, { status: 409 });
  revalidatePath(`/classes/${course.slug}`);
  revalidatePath(`/resources/${course.slug}`);
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
