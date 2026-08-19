"use client";

import type { CurriculumWeek } from "@/app/data";
import { createClient } from "@/lib/supabase/client";

export type ProductStatus = "draft" | "published" | "archived";
export type ProductRecruitmentStatus = "preparing" | "recruiting" | "closed";
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
  programType: "free" | "paid";
  status: ProductStatus;
  recruitmentStatus: ProductRecruitmentStatus;
  recruitmentStartAt: string;
  recruitmentEndAt: string;
  hasLinkedCohort: boolean;
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
  programType: "free" | "paid";
  thumbnailUrl?: string;
  imageCount: number;
  weekCount: number;
  lessonCount: number;
};
export type ProductEditorData = {
  draft: ProductDraft;
  thumbnail: ProductImage | null;
  images: ProductImage[];
  curriculum: CurriculumWeek[];
  pixels: ProductPixels;
};
type ProductCourseRecord = { id:string; course_code:string; slug:string; title:string; summary:string|null; description:string|null; category:string|null; instructor_name:string|null; list_price:number; duration_label:string|null; schedule_label:string|null; status:ProductStatus; metadata:Record<string,unknown>|null };
type ProductAssetRecord = { id:string; asset_type:string; storage_path:string; display_order:number };
type ProductLessonRecord = { id:string; day_number:number; title:string; description:string|null; content_type:string; duration_label:string|null; display_order:number; lesson_contents:Array<{vod_url:string|null;resource_name:string|null;resource_storage_path:string|null}>|{vod_url:string|null;resource_name:string|null;resource_storage_path:string|null}|null };
type ProductWeekRecord = { id:string; week_number:number; title:string; goal:string|null; display_order:number; curriculum_lessons:ProductLessonRecord[] };
type ProductRecruitmentRecord = { id:string; status:string; recruitment_start_at:string|null; recruitment_end_at:string|null };

const defaultPixels: ProductPixels = { meta: "", kakao: "", google: "", enabled: true };

function messageOf(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

function trackingOf(metadata: unknown): ProductPixels {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return defaultPixels;
  const tracking = (metadata as Record<string, unknown>).tracking;
  return tracking && typeof tracking === "object" && !Array.isArray(tracking)
    ? { ...defaultPixels, ...(tracking as Partial<ProductPixels>) }
    : defaultPixels;
}

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
      programType: "paid",
      status: "draft",
      recruitmentStatus: "preparing",
      recruitmentStartAt: "",
      recruitmentEndAt: "",
      hasLinkedCohort: false,
      metadata: {},
    },
    thumbnail: null,
    images: [],
    curriculum: [],
    pixels: defaultPixels,
  };
}

export async function loadAdminProducts(): Promise<ProductSummary[]> {
  const supabase = createClient();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id,slug,title,instructor_name,list_price,duration_label,status,display_order,metadata")
    .order("display_order", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(messageOf(error, "상품 목록을 불러오지 못했습니다."));
  const ids = (courses || []).map((course) => course.id);
  if (!ids.length) return [];

  const [assetResult, weekResult] = await Promise.all([
    supabase.from("course_assets").select("id,course_id,asset_type,storage_path").in("course_id", ids),
    supabase.from("curriculum_weeks").select("id,course_id,curriculum_lessons(id)").in("course_id", ids),
  ]);
  if (assetResult.error) throw new Error(messageOf(assetResult.error, "상세 이미지 수를 확인하지 못했습니다."));
  if (weekResult.error) throw new Error(messageOf(weekResult.error, "커리큘럼 수를 확인하지 못했습니다."));

  return (courses || []).map((course) => {
    const weeks = (weekResult.data || []).filter((week) => week.course_id === course.id);
    const courseAssets = (assetResult.data || []).filter((asset) => asset.course_id === course.id);
    const thumbnail = courseAssets.find((asset) => asset.asset_type === "thumbnail");
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      instructorName: course.instructor_name || "브랜디액션",
      listPrice: course.list_price,
      durationLabel: course.duration_label || "기간 미정",
      status: course.status as ProductStatus,
      programType: course.metadata && typeof course.metadata === "object" && !Array.isArray(course.metadata) && (course.metadata as Record<string, unknown>).programType === "free" ? "free" : "paid",
      thumbnailUrl: thumbnail ? supabase.storage.from("course-assets").getPublicUrl(thumbnail.storage_path).data.publicUrl : undefined,
      imageCount: courseAssets.filter((asset) => asset.asset_type === "detail").length,
      weekCount: weeks.length,
      lessonCount: weeks.reduce((sum, week) => sum + (week.curriculum_lessons || []).length, 0),
    };
  });
}

export async function loadAdminProduct(courseId: string): Promise<ProductEditorData> {
  const supabase = createClient();
  const result = await productRequest<{ course: ProductCourseRecord; assets: ProductAssetRecord[]; weeks: ProductWeekRecord[]; recruitment: ProductRecruitmentRecord | null }>(`/api/admin/products?id=${encodeURIComponent(courseId)}`);
  const course = result.course;
  const assets = result.assets || [];
  const weeks = result.weeks || [];

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
      programType: metadata.programType === "free" ? "free" : "paid",
      status: course.status as ProductStatus,
      recruitmentStatus: result.recruitment?.status === "recruiting" ? "recruiting" : result.recruitment?.status === "closed" ? "closed" : "preparing",
      recruitmentStartAt: localDateTime(result.recruitment?.recruitment_start_at),
      recruitmentEndAt: localDateTime(result.recruitment?.recruitment_end_at),
      hasLinkedCohort: Boolean(result.recruitment?.id),
      metadata,
    },
    thumbnail: (() => {
      const asset = assets.find((item) => item.asset_type === "thumbnail");
      return asset ? {
        id: asset.id,
        path: asset.storage_path,
        url: supabase.storage.from("course-assets").getPublicUrl(asset.storage_path).data.publicUrl,
      } : null;
    })(),
    images: assets.filter((asset) => asset.asset_type === "detail").map((asset) => ({
      id: asset.id,
      path: asset.storage_path,
      url: supabase.storage.from("course-assets").getPublicUrl(asset.storage_path).data.publicUrl,
    })),
    curriculum: weeks.map((week) => ({
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

async function productRequest<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "상품 요청을 처리하지 못했습니다.");
  return result;
}

export async function saveAdminProduct(input: {
  course: ProductDraft;
  thumbnail: ProductImage | null;
  images: ProductImage[];
  curriculum: CurriculumWeek[];
  pixels: ProductPixels;
  resourceFiles: Map<string, File>;
}): Promise<string> {
  const form = new FormData();
  form.append("payload", JSON.stringify({
    course: input.course,
    thumbnail: input.thumbnail ? { id: input.thumbnail.id, path: input.thumbnail.path } : null,
    images: input.images.map((image) => ({ id: image.id, path: image.path })),
    curriculum: input.curriculum,
    pixels: input.pixels,
  }));
  if (input.thumbnail?.file) form.append("thumbnail", input.thumbnail.file);
  input.images.forEach((image, index) => { if (image.file) form.append(`detail-${index}`, image.file); });
  input.curriculum.forEach((week, weekIndex) => week.lessons.forEach((lesson, lessonIndex) => {
    const file = input.resourceFiles.get(lesson.id);
    if (file) form.append(`resource-${weekIndex}-${lessonIndex}`, file);
  }));
  const result = await productRequest<{ courseId: string }>("/api/admin/products", { method: "POST", body: form });
  return result.courseId;
}

export async function deleteAdminProduct(courseId: string) {
  await productRequest(`/api/admin/products?id=${encodeURIComponent(courseId)}`, { method: "DELETE" });
}
