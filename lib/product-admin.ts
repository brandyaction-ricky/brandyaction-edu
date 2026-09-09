"use client";

import { validateCurriculum } from "@/lib/course-content";
import type { QuizDefinition } from "@/lib/mission-quiz";
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
  productKind: "class" | "digital";
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
type ProductMissionRecord = { title:string; instructions:string|null; is_required:boolean; submission_type:string; is_published:boolean; mission_quizzes:{questions:QuizDefinition["questions"];pass_percent:number}[]|{questions:QuizDefinition["questions"];pass_percent:number}|null };
type ProductLessonRecord = { id:string; day_number:number; title:string; description:string|null; content_type:string; is_published:boolean; access_mode:"enrolled"|"member"; duration_label:string|null; display_order:number; lesson_contents:Array<{vod_url:string|null;resource_name:string|null;resource_storage_path:string|null;body_text:string|null;external_url:string|null}>|{vod_url:string|null;resource_name:string|null;resource_storage_path:string|null;body_text:string|null;external_url:string|null}|null; curriculum_missions:ProductMissionRecord[]|ProductMissionRecord|null };
type ProductWeekRecord = { id:string; week_number:number; title:string; goal:string|null; is_published:boolean; display_order:number; curriculum_lessons:ProductLessonRecord[] };
type ProductRecruitmentRecord = { id:string; status:string; recruitment_start_at:string|null; recruitment_end_at:string|null };

const defaultPixels: ProductPixels = { meta: "", kakao: "", google: "", enabled: true };

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
  const result = await productRequest<{ products: ProductSummary[] }>("/api/admin/products");
  return result.products;
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
      isPublished: week.is_published,
      lessons: [...(week.curriculum_lessons || [])].sort((a, b) => a.display_order - b.display_order).map((lesson) => {
        const content = Array.isArray(lesson.lesson_contents) ? lesson.lesson_contents[0] : lesson.lesson_contents;
        const mission = Array.isArray(lesson.curriculum_missions) ? lesson.curriculum_missions[0] : lesson.curriculum_missions;
        const quiz = Array.isArray(mission?.mission_quizzes) ? mission.mission_quizzes[0] : mission?.mission_quizzes;
        return {
          id: lesson.id,
          day: lesson.day_number,
          title: lesson.title,
          description: lesson.description || "",
          kind: ({ material: "자료", text: "텍스트", link: "링크", vod: "VOD" } as const)[lesson.content_type as "material" | "text" | "link" | "vod"] || "VOD",
          isPublished: lesson.is_published,
          accessMode: lesson.access_mode,
          bodyText: content?.body_text || "",
          duration: lesson.duration_label || "",
          contentUrl: content?.vod_url || content?.external_url || "",
          resourceName: content?.resource_name || undefined,
          resourcePath: content?.resource_storage_path || undefined,
          mission: mission ? {
            title: mission.title,
            instructions: mission.instructions || "",
            required: mission.is_required,
            submissionType: mission.submission_type === "quiz" ? "quiz" as const : mission.submission_type === "link" ? "link" as const : mission.submission_type === "mixed" ? "mixed" as const : "text" as const,
            isPublished: mission.is_published,
            quiz: quiz ? { questions: quiz.questions, passPercent: quiz.pass_percent } : undefined,
          } : undefined,
        };
      }),
    })),
    pixels: trackingOf(metadata),
  };
}

async function productRequest<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const responseText = await response.text();
  let result = {} as T & { error?: string };
  try { result = responseText ? JSON.parse(responseText) as T & { error?: string } : result; }
  catch { /* A proxy/runtime error may return HTML instead of the API JSON body. */ }
  if (!response.ok) throw new Error(result.error || `상품 요청을 처리하지 못했습니다. (HTTP ${response.status})`);
  return result;
}

export async function directUpload(courseId: string, file: File, kind: "resource" | "thumbnail" | "detail") {
  const upload = await productRequest<{ bucket: string; path: string; token: string; contentType: string }>("/api/admin/content-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, name: file.name, size: file.size, kind }) });
  const { error } = await createClient().storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, { contentType: upload.contentType });
  if (error) throw new Error(`${file.name}: 업로드하지 못했습니다. ${error.message}`);
  return upload.path;
}

export async function saveAdminProduct(input: {
  course: ProductDraft; thumbnail: ProductImage | null; images: ProductImage[];
  curriculum: CurriculumWeek[]; pixels: ProductPixels; resourceFiles: Map<string, File>;
  onDraftCreated?: (id: string) => void;
}): Promise<string> {
  const invalid = validateCurriculum(input.curriculum, input.course.id);
  if (invalid) throw new Error(invalid);
  const persist = async (payload: Record<string, unknown>) => {
    const form = new FormData(); form.append("payload", JSON.stringify(payload));
    return productRequest<{ courseId: string }>("/api/admin/products", { method: "POST", body: form });
  };
  let courseId = input.course.id;
  if (!courseId) {
    // Establish a private draft before uploading. A failed upload can never publish an empty offer.
    const draft = await persist({ course: { ...input.course, status: "draft", recruitmentStatus: "preparing" }, thumbnail: null, images: [], curriculum: [], pixels: input.pixels });
    courseId = draft.courseId;
    input.onDraftCreated?.(courseId);
  }
  const uploadImage = async (image: ProductImage, kind: "thumbnail" | "detail") => ({ id: image.file ? undefined : image.id, path: image.file ? await directUpload(courseId, image.file, kind) : image.path });
  const thumbnail = input.thumbnail ? await uploadImage(input.thumbnail, "thumbnail") : null;
  const images: { id?: string; path?: string }[] = [];
  // Bound parallel uploads, and keep file bodies out of the Vercel API request.
  for (let i = 0; i < input.images.length; i += 3) images.push(...await Promise.all(input.images.slice(i, i + 3).map((image) => uploadImage(image, "detail"))));
  const curriculum: CurriculumWeek[] = [];
  for (const week of input.curriculum) {
    const lessons = [];
    for (const lesson of week.lessons) {
      const file = lesson.kind === "자료" ? input.resourceFiles.get(lesson.id) : undefined;
      lessons.push(file ? { ...lesson, resourceName: file.name, resourcePath: await directUpload(courseId, file, "resource") } : lesson);
    }
    curriculum.push({ ...week, lessons });
  }
  const result = await persist({ course: { ...input.course, id: courseId }, thumbnail, images, curriculum, pixels: input.pixels });
  return result.courseId;
}

export async function deleteAdminProduct(courseId: string) {
  await productRequest(`/api/admin/products?id=${encodeURIComponent(courseId)}`, { method: "DELETE" });
}
