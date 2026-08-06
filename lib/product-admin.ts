"use client";

import type { CurriculumWeek } from "@/app/data";
import { createClient } from "@/lib/supabase/client";
import { safeExternalUrl } from "@/lib/safe-url";

export type ProductStatus = "draft" | "published" | "archived";
export type ProductPixels = { meta: string; kakao: string; google: string; enabled: boolean };
export type ProductImage = { id?: string; path?: string; url: string; file?: File };
export type ProductDraft = {
  id: string;
  courseCode: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  instructorName: string;
  listPrice: string;
  durationLabel: string;
  scheduleLabel: string;
  status: ProductStatus;
  metadata: Record<string, unknown>;
};
export type ProductSummary = {
  id: string;
  slug: string;
  title: string;
  instructorName: string;
  listPrice: number;
  durationLabel: string;
  status: ProductStatus;
  imageCount: number;
  weekCount: number;
  lessonCount: number;
};
export type ProductEditorData = {
  draft: ProductDraft;
  images: ProductImage[];
  curriculum: CurriculumWeek[];
  pixels: ProductPixels;
};

const defaultPixels: ProductPixels = { meta: "", kakao: "", google: "", enabled: true };

function messageOf(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const base = parts.join(".").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "file";
  return `${base}${extension}`;
}

function trackingOf(metadata: unknown): ProductPixels {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return defaultPixels;
  const tracking = (metadata as Record<string, unknown>).tracking;
  return tracking && typeof tracking === "object" && !Array.isArray(tracking)
    ? { ...defaultPixels, ...(tracking as Partial<ProductPixels>) }
    : defaultPixels;
}

export function createEmptyProduct(): ProductEditorData {
  const stamp = Date.now();
  return {
    draft: {
      id: "",
      courseCode: `COURSE_${stamp}`,
      slug: `course-${stamp}`,
      title: "",
      summary: "",
      description: "",
      category: "실전 교육",
      instructorName: "",
      listPrice: "0",
      durationLabel: "수강기간 무제한",
      scheduleLabel: "일정 추후 안내",
      status: "draft",
      metadata: {},
    },
    images: [],
    curriculum: [],
    pixels: defaultPixels,
  };
}

export async function loadAdminProducts(): Promise<ProductSummary[]> {
  const supabase = createClient();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id,slug,title,instructor_name,list_price,duration_label,status,display_order")
    .order("display_order", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(messageOf(error, "상품 목록을 불러오지 못했습니다."));
  const ids = (courses || []).map((course) => course.id);
  if (!ids.length) return [];

  const [assetResult, weekResult] = await Promise.all([
    supabase.from("course_assets").select("id,course_id").in("course_id", ids).eq("asset_type", "detail"),
    supabase.from("curriculum_weeks").select("id,course_id,curriculum_lessons(id)").in("course_id", ids),
  ]);
  if (assetResult.error) throw new Error(messageOf(assetResult.error, "상세 이미지 수를 확인하지 못했습니다."));
  if (weekResult.error) throw new Error(messageOf(weekResult.error, "커리큘럼 수를 확인하지 못했습니다."));

  return (courses || []).map((course) => {
    const weeks = (weekResult.data || []).filter((week) => week.course_id === course.id);
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      instructorName: course.instructor_name || "브랜디액션",
      listPrice: course.list_price,
      durationLabel: course.duration_label || "기간 미정",
      status: course.status as ProductStatus,
      imageCount: (assetResult.data || []).filter((asset) => asset.course_id === course.id).length,
      weekCount: weeks.length,
      lessonCount: weeks.reduce((sum, week) => sum + (week.curriculum_lessons || []).length, 0),
    };
  });
}

export async function loadAdminProduct(courseId: string): Promise<ProductEditorData> {
  const supabase = createClient();
  const { data: course, error } = await supabase
    .from("courses")
    .select("id,course_code,slug,title,summary,description,category,instructor_name,list_price,duration_label,schedule_label,status,metadata")
    .eq("id", courseId)
    .single();
  if (error || !course) throw new Error(messageOf(error, "상품을 불러오지 못했습니다."));

  const [assetResult, weekResult] = await Promise.all([
    supabase.from("course_assets").select("id,storage_path,display_order").eq("course_id", courseId).eq("asset_type", "detail").order("display_order"),
    supabase.from("curriculum_weeks").select("id,week_number,title,goal,display_order,curriculum_lessons(id,day_number,title,description,content_type,duration_label,display_order,lesson_contents(vod_url,resource_name,resource_storage_path))").eq("course_id", courseId).order("display_order"),
  ]);
  if (assetResult.error) throw new Error(messageOf(assetResult.error, "상세 이미지를 불러오지 못했습니다."));
  if (weekResult.error) throw new Error(messageOf(weekResult.error, "커리큘럼을 불러오지 못했습니다."));

  const metadata = course.metadata && typeof course.metadata === "object" && !Array.isArray(course.metadata)
    ? course.metadata as Record<string, unknown>
    : {};
  return {
    draft: {
      id: course.id,
      courseCode: course.course_code,
      slug: course.slug,
      title: course.title,
      summary: course.summary || "",
      description: course.description || "",
      category: course.category || "",
      instructorName: course.instructor_name || "",
      listPrice: String(course.list_price),
      durationLabel: course.duration_label || "",
      scheduleLabel: course.schedule_label || "",
      status: course.status as ProductStatus,
      metadata,
    },
    images: (assetResult.data || []).map((asset) => ({
      id: asset.id,
      path: asset.storage_path,
      url: supabase.storage.from("course-assets").getPublicUrl(asset.storage_path).data.publicUrl,
    })),
    curriculum: (weekResult.data || []).map((week) => ({
      id: week.id,
      label: `${week.week_number}주차`,
      title: week.title,
      goal: week.goal || "",
      lessons: [...(week.curriculum_lessons || [])].sort((a, b) => a.display_order - b.display_order).map((lesson) => {
        const content = Array.isArray(lesson.lesson_contents) ? lesson.lesson_contents[0] : lesson.lesson_contents;
        return {
          id: lesson.id,
          day: lesson.day_number,
          title: lesson.title,
          description: lesson.description || "",
          kind: lesson.content_type === "material" ? "자료" as const : "VOD" as const,
          duration: lesson.duration_label || "",
          contentUrl: content?.vod_url || "",
          resourceName: content?.resource_name || undefined,
          resourcePath: content?.resource_storage_path || undefined,
        };
      }),
    })),
    pixels: trackingOf(metadata),
  };
}

async function assertLessonsCanBeRemoved(lessonIds: string[]) {
  if (!lessonIds.length) return;
  const supabase = createClient();
  const { data, error } = await supabase.from("lesson_progress").select("lesson_id").in("lesson_id", lessonIds).limit(1);
  if (error) throw new Error(messageOf(error, "수강 진도 연결 여부를 확인하지 못했습니다."));
  if (data?.length) throw new Error("수강 진도가 기록된 강의는 삭제할 수 없습니다. 보관 처리하거나 콘텐츠만 수정해 주세요.");
}

export async function saveAdminProduct(input: {
  course: ProductDraft;
  images: ProductImage[];
  curriculum: CurriculumWeek[];
  pixels: ProductPixels;
  resourceFiles: Map<string, File>;
}): Promise<string> {
  const supabase = createClient();
  const { course, images, curriculum, pixels, resourceFiles } = input;
  const listPrice = Number(course.listPrice.replace(/[^0-9]/g, ""));
  if (!course.title.trim()) throw new Error("상품명을 입력해 주세요.");
  if (!course.slug.trim()) throw new Error("상품 URL을 입력해 주세요.");
  if (!Number.isFinite(listPrice)) throw new Error("정가를 숫자로 입력해 주세요.");

  const payload = {
    course_code: course.courseCode.trim(),
    slug: course.slug.trim(),
    title: course.title.trim(),
    summary: course.summary.trim() || null,
    description: course.description.trim() || null,
    category: course.category.trim() || null,
    instructor_name: course.instructorName.trim() || null,
    list_price: listPrice,
    duration_label: course.durationLabel.trim() || null,
    schedule_label: course.scheduleLabel.trim() || null,
    status: course.status,
    published_at: course.status === "published" ? new Date().toISOString() : null,
    metadata: { ...course.metadata, tracking: pixels },
  };

  let courseId = course.id;
  if (courseId) {
    const { error } = await supabase.from("courses").update(payload).eq("id", courseId);
    if (error) throw new Error(messageOf(error, "상품 기본 정보를 저장하지 못했습니다."));
  } else {
    const { data, error } = await supabase.from("courses").insert(payload).select("id").single();
    if (error || !data) throw new Error(messageOf(error, "새 상품을 등록하지 못했습니다. 상품 URL이나 코드가 중복되지 않았는지 확인해 주세요."));
    courseId = data.id;
  }

  const { data: currentAssets, error: assetLoadError } = await supabase.from("course_assets").select("id,storage_path").eq("course_id", courseId).eq("asset_type", "detail");
  if (assetLoadError) throw new Error(messageOf(assetLoadError, "기존 상세 이미지를 확인하지 못했습니다."));
  const retainedAssetIds = new Set(images.flatMap((image) => image.id ? [image.id] : []));

  for (const [index, image] of images.entries()) {
    if (image.id) {
      const { error } = await supabase.from("course_assets").update({ display_order: index, alt_text: `${course.title} 상세 이미지 ${index + 1}` }).eq("id", image.id);
      if (error) throw new Error(messageOf(error, "상세 이미지 순서를 저장하지 못했습니다."));
      continue;
    }
    if (!image.file) continue;
    const path = `${courseId}/details/${Date.now()}-${index}-${safeFileName(image.file.name)}`;
    const { error: uploadError } = await supabase.storage.from("course-assets").upload(path, image.file, { contentType: image.file.type, upsert: false });
    if (uploadError) throw new Error(messageOf(uploadError, "상세 이미지 업로드에 실패했습니다."));
    const { error: insertError } = await supabase.from("course_assets").insert({ course_id: courseId, asset_type: "detail", storage_bucket: "course-assets", storage_path: path, alt_text: `${course.title} 상세 이미지 ${index + 1}`, display_order: index });
    if (insertError) {
      await supabase.storage.from("course-assets").remove([path]);
      throw new Error(messageOf(insertError, "상세 이미지 정보를 저장하지 못했습니다."));
    }
  }

  const removedAssets = (currentAssets || []).filter((asset) => !retainedAssetIds.has(asset.id));
  if (removedAssets.length) {
    const { error } = await supabase.from("course_assets").delete().in("id", removedAssets.map((asset) => asset.id));
    if (error) throw new Error(messageOf(error, "삭제한 상세 이미지 정보를 정리하지 못했습니다."));
    await supabase.storage.from("course-assets").remove(removedAssets.map((asset) => asset.storage_path));
  }

  const { data: currentWeeks, error: weeksError } = await supabase
    .from("curriculum_weeks")
    .select("id,curriculum_lessons(id,lesson_contents(resource_storage_path))")
    .eq("course_id", courseId);
  if (weeksError) throw new Error(messageOf(weeksError, "기존 커리큘럼을 확인하지 못했습니다."));
  const existingWeekIds = new Set((currentWeeks || []).map((week) => week.id));
  const existingLessons = (currentWeeks || []).flatMap((week) => (week.curriculum_lessons || []).map((lesson) => ({ ...lesson, weekId: week.id })));
  const retainedWeekIds = new Set(curriculum.filter((week) => existingWeekIds.has(week.id)).map((week) => week.id));
  const retainedLessonIds = new Set(curriculum.flatMap((week) => week.lessons.map((lesson) => lesson.id)).filter((id) => existingLessons.some((lesson) => lesson.id === id)));
  const removedLessonIds = existingLessons.filter((lesson) => !retainedWeekIds.has(lesson.weekId) || !retainedLessonIds.has(lesson.id)).map((lesson) => lesson.id);
  await assertLessonsCanBeRemoved(removedLessonIds);

  const oldResourcePaths = existingLessons.flatMap((lesson) => {
    const content = Array.isArray(lesson.lesson_contents) ? lesson.lesson_contents[0] : lesson.lesson_contents;
    return content?.resource_storage_path ? [content.resource_storage_path] : [];
  });
  const retainedResourcePaths = new Set<string>();

  const removedWeeks = (currentWeeks || []).filter((week) => !retainedWeekIds.has(week.id));
  if (removedWeeks.length) {
    const { error } = await supabase.from("curriculum_weeks").delete().in("id", removedWeeks.map((week) => week.id));
    if (error) throw new Error(messageOf(error, "삭제한 주차를 정리하지 못했습니다."));
  }
  const removedStandaloneLessons = existingLessons.filter((lesson) => retainedWeekIds.has(lesson.weekId) && !retainedLessonIds.has(lesson.id));
  if (removedStandaloneLessons.length) {
    const { error } = await supabase.from("curriculum_lessons").delete().in("id", removedStandaloneLessons.map((lesson) => lesson.id));
    if (error) throw new Error(messageOf(error, "삭제한 강의를 정리하지 못했습니다."));
  }

  for (const [index, week] of curriculum.entries()) {
    if (existingWeekIds.has(week.id)) await supabase.from("curriculum_weeks").update({ week_number: 10000 + index, display_order: index }).eq("id", week.id);
  }

  let dayNumber = 1;
  for (const [weekIndex, week] of curriculum.entries()) {
    let weekId = week.id;
    const weekPayload = { course_id: courseId, week_number: weekIndex + 1, title: week.title.trim() || `${weekIndex + 1}주차`, goal: week.goal.trim() || null, is_published: true, display_order: weekIndex };
    if (existingWeekIds.has(week.id)) {
      const { error } = await supabase.from("curriculum_weeks").update(weekPayload).eq("id", week.id);
      if (error) throw new Error(messageOf(error, "주차 정보를 수정하지 못했습니다."));
    } else {
      const { data, error } = await supabase.from("curriculum_weeks").insert(weekPayload).select("id").single();
      if (error || !data) throw new Error(messageOf(error, "새 주차를 추가하지 못했습니다."));
      weekId = data.id;
    }

    const currentWeekLessonIds = new Set(existingLessons.filter((lesson) => lesson.weekId === week.id).map((lesson) => lesson.id));
    for (const [lessonIndex, lesson] of week.lessons.entries()) {
      if (currentWeekLessonIds.has(lesson.id)) await supabase.from("curriculum_lessons").update({ day_number: 10000 + lessonIndex }).eq("id", lesson.id);
    }

    for (const [lessonIndex, lesson] of week.lessons.entries()) {
      const kind = lesson.kind === "자료" ? "material" : "vod";
      const lessonPayload = { week_id: weekId, day_number: dayNumber++, title: lesson.title.trim() || "새 강의", description: lesson.description.trim() || null, content_type: kind, duration_label: lesson.duration.trim() || null, is_preview: false, is_published: true, display_order: lessonIndex };
      let lessonId = lesson.id;
      if (currentWeekLessonIds.has(lesson.id)) {
        const { error } = await supabase.from("curriculum_lessons").update(lessonPayload).eq("id", lesson.id);
        if (error) throw new Error(messageOf(error, "강의 정보를 수정하지 못했습니다."));
      } else {
        const { data, error } = await supabase.from("curriculum_lessons").insert(lessonPayload).select("id").single();
        if (error || !data) throw new Error(messageOf(error, "새 강의를 추가하지 못했습니다."));
        lessonId = data.id;
      }

      if (kind === "vod") {
        const vodUrl = lesson.contentUrl?.trim();
        if (vodUrl && !safeExternalUrl(vodUrl)) throw new Error("VOD 링크는 https:// 주소로 입력해 주세요.");
        if (vodUrl) {
          const { error } = await supabase.from("lesson_contents").upsert({ lesson_id: lessonId, vod_url: vodUrl, resource_name: null, resource_storage_path: null }, { onConflict: "lesson_id" });
          if (error) throw new Error(messageOf(error, "VOD 링크를 저장하지 못했습니다."));
        } else {
          await supabase.from("lesson_contents").delete().eq("lesson_id", lessonId);
        }
        continue;
      }

      let resourcePath = lesson.resourcePath;
      let resourceName = lesson.resourceName;
      const file = resourceFiles.get(lesson.id);
      if (file) {
        resourcePath = `${courseId}/curriculum/${Date.now()}-${safeFileName(file.name)}`;
        resourceName = file.name;
        const { error } = await supabase.storage.from("course-resources").upload(resourcePath, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw new Error(messageOf(error, `${file.name} 업로드에 실패했습니다.`));
      }
      if (resourcePath) {
        retainedResourcePaths.add(resourcePath);
        const { error } = await supabase.from("lesson_contents").upsert({ lesson_id: lessonId, vod_url: null, resource_name: resourceName || "학습 자료", resource_storage_path: resourcePath }, { onConflict: "lesson_id" });
        if (error) throw new Error(messageOf(error, "학습 자료를 연결하지 못했습니다."));
      } else {
        await supabase.from("lesson_contents").delete().eq("lesson_id", lessonId);
      }
    }
  }

  const obsoletePaths = oldResourcePaths.filter((path) => !retainedResourcePaths.has(path));
  if (obsoletePaths.length) await supabase.storage.from("course-resources").remove(obsoletePaths);
  return courseId;
}

export async function deleteAdminProduct(courseId: string) {
  const supabase = createClient();
  const [assetsResult, contentsResult] = await Promise.all([
    supabase.from("course_assets").select("storage_path").eq("course_id", courseId),
    supabase
      .from("lesson_contents")
      .select("resource_storage_path,curriculum_lessons!inner(curriculum_weeks!inner(course_id))")
      .eq("curriculum_lessons.curriculum_weeks.course_id", courseId),
  ]);
  if (assetsResult.error || contentsResult.error) throw new Error("삭제할 상품 파일을 확인하지 못했습니다.");

  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) {
    if (error.code === "23503") throw new Error("주문·수강권·후기가 연결된 상품은 삭제할 수 없습니다. 판매 상태를 ‘보관’으로 변경해 주세요.");
    throw new Error(messageOf(error, "상품을 삭제하지 못했습니다."));
  }

  const assetPaths = (assetsResult.data || []).map((row) => row.storage_path);
  const resourcePaths = (contentsResult.data || []).flatMap((row) => row.resource_storage_path ? [row.resource_storage_path] : []);
  const cleanup = await Promise.all([
    assetPaths.length ? supabase.storage.from("course-assets").remove(assetPaths) : Promise.resolve({ error: null }),
    resourcePaths.length ? supabase.storage.from("course-resources").remove(resourcePaths) : Promise.resolve({ error: null }),
  ]);
  if (cleanup.some((result) => result.error)) throw new Error("상품은 삭제됐지만 일부 저장 파일 정리에 실패했습니다. Storage를 확인해 주세요.");
}
