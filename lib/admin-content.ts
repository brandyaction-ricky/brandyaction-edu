"use client";

import { createClient } from "@/lib/supabase/client";
import type { CurriculumWeek } from "@/app/data";
import { safeExternalUrl, safePublicHref } from "@/lib/safe-url";

export type PixelData = { meta: string; kakao: string; google: string; enabled: boolean };
export type AdminImage = { id?: string; path?: string; url: string; file?: File };
export type CourseDraft = {
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
  status: "draft" | "published" | "archived";
  metadata: Record<string, unknown>;
};
export type BannerData = {
  id?: string;
  image?: string;
  imagePath?: string;
  imageFile?: File;
  eyebrow: string;
  title: string;
  copy: string;
  link: string;
  linkLabel: string;
};
export type CohortStatus = "upcoming" | "recruiting" | "closed" | "in_progress" | "completed" | "cancelled";
export type AdminSession = { id: string; sessionNumber: number; title: string; description: string; expectedOutput: string; scheduledAt: string; liveUrl: string; replayUrl: string };
export type AdminCohort = {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  cohortCode: string;
  name: string;
  note: string;
  recruitmentStartAt: string;
  recruitmentEndAt: string;
  operationStartAt: string;
  operationEndAt: string;
  price: string;
  capacity: string;
  status: CohortStatus;
  enrolledCount: number;
  students?: Array<{ id: string; userId: string; name: string; email: string; phone: string }>;
  sessions: AdminSession[];
};
export type AdminCourseOption = { id: string; courseCode: string; title: string; listPrice: number };

const defaultPixels: PixelData = { meta: "", kakao: "", google: "", enabled: true };

function messageOf(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const base = parts.join(".").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "file";
  return `${base}${extension}`;
}

function isTracking(value: unknown): value is PixelData {
  return Boolean(value && typeof value === "object");
}

export async function loadPrimaryCourseAdmin() {
  const supabase = createClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id,course_code,slug,title,summary,description,category,instructor_name,list_price,duration_label,schedule_label,status,metadata")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (courseError || !course) throw new Error(messageOf(courseError, "등록된 상품을 찾지 못했습니다."));

  const [{ data: assets, error: assetError }, { data: weeks, error: weekError }] = await Promise.all([
    supabase.from("course_assets").select("id,storage_path,alt_text,display_order").eq("course_id", course.id).eq("asset_type", "detail").order("display_order"),
    supabase.from("curriculum_weeks").select("id,week_number,title,goal,is_published,display_order,curriculum_lessons(id,day_number,title,description,content_type,duration_label,is_published,display_order,lesson_contents(vod_url,resource_name,resource_storage_path))").eq("course_id", course.id).order("display_order"),
  ]);
  if (assetError) throw new Error(messageOf(assetError, "상세 이미지를 불러오지 못했습니다."));
  if (weekError) throw new Error(messageOf(weekError, "커리큘럼을 불러오지 못했습니다."));

  const images: AdminImage[] = (assets || []).map((asset) => ({
    id: asset.id,
    path: asset.storage_path,
    url: supabase.storage.from("course-assets").getPublicUrl(asset.storage_path).data.publicUrl,
  }));

  const curriculum: CurriculumWeek[] = (weeks || []).map((week) => ({
    id: week.id,
    label: `${week.week_number}주차`,
    title: week.title,
    goal: week.goal || "",
    lessons: [...(week.curriculum_lessons || [])]
      .sort((a, b) => a.display_order - b.display_order)
      .map((lesson) => {
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
  }));

  const metadata = course.metadata && typeof course.metadata === "object" && !Array.isArray(course.metadata)
    ? course.metadata as Record<string, unknown>
    : {};
  const tracking = isTracking(metadata.tracking) ? { ...defaultPixels, ...metadata.tracking } : defaultPixels;

  const draft: CourseDraft = {
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
    status: course.status,
    metadata,
  };

  return { draft, images, curriculum, pixels: tracking };
}

export async function saveCourseAdmin(input: {
  course: CourseDraft;
  images: AdminImage[];
  curriculum: CurriculumWeek[];
  pixels: PixelData;
  resourceFiles: Map<string, File>;
}) {
  const { course, images, curriculum, pixels, resourceFiles } = input;
  const supabase = createClient();
  const listPrice = Number(course.listPrice.replace(/[^0-9]/g, ""));
  if (!course.title.trim()) throw new Error("상품명을 입력해 주세요.");
  if (!Number.isFinite(listPrice)) throw new Error("정가를 숫자로 입력해 주세요.");

  const { error: courseError } = await supabase.from("courses").update({
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
  }).eq("id", course.id);
  if (courseError) throw new Error(messageOf(courseError, "상품 기본 정보를 저장하지 못했습니다."));

  const { data: currentAssets, error: currentAssetError } = await supabase
    .from("course_assets")
    .select("id,storage_path")
    .eq("course_id", course.id)
    .eq("asset_type", "detail");
  if (currentAssetError) throw new Error(messageOf(currentAssetError, "기존 상세 이미지를 확인하지 못했습니다."));

  const retainedIds = new Set(images.flatMap((image) => image.id ? [image.id] : []));
  const removedAssets = (currentAssets || []).filter((asset) => !retainedIds.has(asset.id));
  if (removedAssets.length) {
    const { error: removeStorageError } = await supabase.storage.from("course-assets").remove(removedAssets.map((asset) => asset.storage_path));
    if (removeStorageError) throw new Error(messageOf(removeStorageError, "삭제한 상세 이미지 파일을 정리하지 못했습니다."));
    const { error: removeRowsError } = await supabase.from("course_assets").delete().in("id", removedAssets.map((asset) => asset.id));
    if (removeRowsError) throw new Error(messageOf(removeRowsError, "삭제한 상세 이미지 정보를 정리하지 못했습니다."));
  }

  for (const [index, image] of images.entries()) {
    if (image.id) {
      const { error } = await supabase.from("course_assets").update({ display_order: index }).eq("id", image.id);
      if (error) throw new Error(messageOf(error, "상세 이미지 순서를 저장하지 못했습니다."));
      continue;
    }
    if (!image.file) continue;
    const path = `${course.id}/details/${Date.now()}-${index}-${safeFileName(image.file.name)}`;
    const { error: uploadError } = await supabase.storage.from("course-assets").upload(path, image.file, { upsert: false, contentType: image.file.type });
    if (uploadError) throw new Error(messageOf(uploadError, "상세 이미지를 업로드하지 못했습니다."));
    const { error: assetInsertError } = await supabase.from("course_assets").insert({
      course_id: course.id,
      asset_type: "detail",
      storage_bucket: "course-assets",
      storage_path: path,
      alt_text: `${course.title} 상세 이미지 ${index + 1}`,
      display_order: index,
    });
    if (assetInsertError) {
      await supabase.storage.from("course-assets").remove([path]);
      throw new Error(messageOf(assetInsertError, "상세 이미지 정보를 저장하지 못했습니다."));
    }
  }

  const { data: oldContents } = await supabase
    .from("lesson_contents")
    .select("resource_storage_path,curriculum_lessons!inner(curriculum_weeks!inner(course_id))")
    .eq("curriculum_lessons.curriculum_weeks.course_id", course.id);
  const oldResourcePaths = (oldContents || []).flatMap((row) => row.resource_storage_path ? [row.resource_storage_path] : []);
  const newResourcePaths = new Set<string>();

  for (const week of curriculum) {
    for (const lesson of week.lessons) {
      const file = resourceFiles.get(lesson.id);
      if (!file && lesson.resourcePath) newResourcePaths.add(lesson.resourcePath);
      if (file) {
        const path = `${course.id}/curriculum/${Date.now()}-${safeFileName(file.name)}`;
        const { error } = await supabase.storage.from("course-resources").upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (error) throw new Error(messageOf(error, `${file.name} 업로드에 실패했습니다.`));
        lesson.resourcePath = path;
        lesson.resourceName = file.name;
        newResourcePaths.add(path);
      }
    }
  }

  const { error: deleteWeeksError } = await supabase.from("curriculum_weeks").delete().eq("course_id", course.id);
  if (deleteWeeksError) throw new Error(messageOf(deleteWeeksError, "기존 커리큘럼을 교체하지 못했습니다."));

  let nextDay = 1;
  for (const [weekIndex, week] of curriculum.entries()) {
    const { data: insertedWeek, error: weekInsertError } = await supabase.from("curriculum_weeks").insert({
      course_id: course.id,
      week_number: weekIndex + 1,
      title: week.title.trim() || `새 ${weekIndex + 1}주차`,
      goal: week.goal.trim() || null,
      is_published: true,
      display_order: weekIndex,
    }).select("id").single();
    if (weekInsertError || !insertedWeek) throw new Error(messageOf(weekInsertError, "주차 커리큘럼을 저장하지 못했습니다."));

    for (const [lessonIndex, lesson] of week.lessons.entries()) {
      const kind = lesson.kind === "자료" ? "material" : "vod";
      const { data: insertedLesson, error: lessonInsertError } = await supabase.from("curriculum_lessons").insert({
        week_id: insertedWeek.id,
        day_number: nextDay++,
        title: lesson.title.trim() || "새 세부 커리큘럼",
        description: lesson.description.trim() || null,
        content_type: kind,
        duration_label: lesson.duration.trim() || null,
        is_preview: false,
        is_published: true,
        display_order: lessonIndex,
      }).select("id").single();
      if (lessonInsertError || !insertedLesson) throw new Error(messageOf(lessonInsertError, "세부 커리큘럼을 저장하지 못했습니다."));

      const content: { lesson_id: string; vod_url: string | null; resource_name: string | null; resource_storage_path: string | null } = kind === "vod"
        ? { lesson_id: insertedLesson.id, vod_url: lesson.contentUrl?.trim() || null, resource_name: null, resource_storage_path: null }
        : { lesson_id: insertedLesson.id, vod_url: null, resource_name: lesson.resourceName || null, resource_storage_path: lesson.resourcePath || null };
      if ((kind === "vod" && content.vod_url) || (kind === "material" && content.resource_storage_path)) {
        const { error: contentError } = await supabase.from("lesson_contents").insert(content);
        if (contentError) throw new Error(messageOf(contentError, "VOD·자료 연결 정보를 저장하지 못했습니다."));
      }
    }
  }

  const obsoletePaths = oldResourcePaths.filter((path) => !newResourcePaths.has(path));
  if (obsoletePaths.length) await supabase.storage.from("course-resources").remove(obsoletePaths);
}

export async function loadAdminBanner(): Promise<BannerData> {
  const supabase = createClient();
  const { data, error } = await supabase.from("site_banners").select("id,eyebrow,title,description,link_url,link_label,image_path").order("display_order").limit(1).maybeSingle();
  if (error) throw new Error(messageOf(error, "메인 배너를 불러오지 못했습니다."));
  return {
    id: data?.id,
    imagePath: data?.image_path || undefined,
    image: data?.image_path ? supabase.storage.from("course-assets").getPublicUrl(data.image_path).data.publicUrl : undefined,
    eyebrow: data?.eyebrow || "BRANDYACTION EDU · LIVE",
    title: data?.title || "배운 것을 실행으로\n바꾸는 실전 클래스",
    copy: data?.description || "모집 중인 클래스와 일정을 확인하세요.",
    link: data?.link_url || "/classes",
    linkLabel: data?.link_label || "클래스 자세히 보기",
  };
}

export async function saveAdminBanner(banner: BannerData) {
  const form = new FormData();
  form.append("id", banner.id || "");
  form.append("eyebrow", banner.eyebrow);
  form.append("title", banner.title);
  form.append("copy", banner.copy);
  form.append("link", safePublicHref(banner.link, "/classes"));
  form.append("linkLabel", banner.linkLabel || "클래스 자세히 보기");
  form.append("imagePath", banner.imagePath || "");
  form.append("removeImage", String(!banner.image && Boolean(banner.imagePath)));
  if (banner.imageFile) form.append("image", banner.imageFile);
  const response = await fetch("/api/admin/banner", { method: "POST", body: form });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || "메인 배너를 저장하지 못했습니다.");
}

async function cohortApi<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/cohorts", { cache: "no-store", ...init });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "기수 요청을 처리하지 못했습니다.");
  return result;
}

export async function loadAdminCohorts():Promise<{courses:AdminCourseOption[];cohorts:AdminCohort[]}>{
  return cohortApi<{courses:AdminCourseOption[];cohorts:AdminCohort[]}>();
}

export async function createAdminCohort(input:{course:AdminCourseOption;name:string;status:CohortStatus;capacity:number;price:number;recruitmentStartAt:string;recruitmentEndAt:string;operationStartAt:string;operationEndAt:string;firstSessionAt:string;sessionCount:number}){
  if(!input.name.trim())throw new Error("기수명을 입력해 주세요.");
  if(!Number.isInteger(input.capacity)||input.capacity<=0)throw new Error("모집 정원은 1명 이상으로 입력해 주세요.");
  if(!Number.isInteger(input.price)||input.price<=0)throw new Error("판매가는 1원 이상으로 입력해 주세요.");
  if(!input.operationStartAt||!input.operationEndAt)throw new Error("기수 운영 시작일과 종료일을 입력해 주세요.");
  if(!input.firstSessionAt)throw new Error("첫 라이브 수업일과 시간을 입력해 주세요.");
  if(new Date(input.operationStartAt).getTime()>new Date(input.operationEndAt).getTime())throw new Error("운영 종료일은 시작일보다 빠를 수 없습니다.");
  if(input.recruitmentStartAt&&input.recruitmentEndAt&&new Date(input.recruitmentStartAt).getTime()>new Date(input.recruitmentEndAt).getTime())throw new Error("모집 종료일은 시작일보다 빠를 수 없습니다.");
  await cohortApi({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseId:input.course.id,name:input.name,status:input.status,capacity:input.capacity,price:input.price,recruitmentStartAt:input.recruitmentStartAt,recruitmentEndAt:input.recruitmentEndAt,operationStartAt:input.operationStartAt,operationEndAt:input.operationEndAt,firstSessionAt:input.firstSessionAt,sessionCount:input.sessionCount})});
}

export async function saveAdminCohort(cohort:AdminCohort){
  const price=Number(cohort.price.replace(/[^0-9]/g,""));
  if(!Number.isInteger(price)||price<=0)throw new Error("판매가는 1원 이상으로 입력해 주세요.");
  if(!cohort.operationStartAt||!cohort.operationEndAt)throw new Error("기수 운영 시작일과 종료일을 입력해 주세요.");
  if(new Date(cohort.operationStartAt).getTime()>new Date(cohort.operationEndAt).getTime())throw new Error("운영 종료일은 시작일보다 빠를 수 없습니다.");
  for(const session of cohort.sessions){
    if(session.liveUrl.trim()&&!safeExternalUrl(session.liveUrl))throw new Error("라이브 링크는 https:// 주소로 입력해 주세요.");
    if(session.replayUrl.trim()&&!safeExternalUrl(session.replayUrl))throw new Error("다시보기 링크는 https:// 주소로 입력해 주세요.");
  }
  await cohortApi({method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...cohort,price,capacity:Number(cohort.capacity.replace(/[^0-9]/g,""))||null})});
}

export async function deleteAdminCohort(id:string){
  const response=await fetch(`/api/admin/cohorts?id=${encodeURIComponent(id)}`,{method:"DELETE"});
  const result=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(result.error||"기수를 삭제하지 못했습니다.");
}
