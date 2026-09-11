import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { type ClassItem, type CurriculumWeek, type Session } from "@/app/data";
import { getSupabasePublicConfig, hasSupabaseEnv } from "@/lib/supabase/config";
import { safePublicHref } from "@/lib/safe-url";
import { publicReviewerName } from "@/lib/review-display";
import { reviewVideoEmbedUrl, reviewVideoThumbnail } from "@/lib/review-video";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  instructor_name: string | null;
  list_price: number;
  duration_label: string | null;
  schedule_label: string | null;
  display_order: number;
  metadata: Record<string, unknown> | null;
};

type CohortRow = {
  id: string;
  course_id: string;
  name: string;
  recruitment_start_at: string | null;
  recruitment_end_at: string | null;
  operation_start_at: string | null;
  operation_end_at: string | null;
  price: number;
  capacity: number | null;
  status: "upcoming" | "recruiting" | "closed" | "in_progress" | "completed" | "cancelled";
};

type SessionRow = {
  cohort_id: string;
  session_number: number;
  title: string;
  description: string | null;
  expected_output: string | null;
  scheduled_at: string | null;
};

type CurriculumWeekRow = { id: string; course_id: string; week_number: number; title: string; goal: string | null; display_order: number };
type CurriculumLessonRow = { id: string; week_id: string; day_number: number; title: string; description: string | null; content_type: "vod" | "material" | "text" | "link"; access_mode: "enrolled" | "member"; duration_label: string | null; display_order: number };
type CourseThumbnailRow = { course_id: string; storage_path: string };

export type PublicBanner = { image?: string; eyebrow?: string; title?: string; copy?: string; link?: string; linkLabel?: string };
export type PublicCourseAppearance = { images: string[]; pixels: { meta?: string; kakao?: string; google?: string; enabled?: boolean } };
export type PublicReview = { id: string; name: string; className: string; cohortName: string; rating: number; quote: string; publishedAt: string };
export type PublicReviewVideo = { id: string; title: string; reviewerName: string; reviewerRole: string; description: string; embedUrl: string; thumbnailUrl: string };
export type PublicSupport = { supportEmail: string; refundEmail: string };

const cohortPriority: Record<CohortRow["status"], number> = {
  recruiting: 0,
  upcoming: 1,
  in_progress: 2,
  closed: 3,
  completed: 4,
  cancelled: 5,
};

function publicClient() {
  const { publicUrl, publishableKey } = getSupabasePublicConfig();
  return createClient(publicUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function emailValue(value: unknown, fallback: string) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim() : fallback;
}

export async function getPublicSupport(): Promise<PublicSupport> {
  const fallback = "edu@brandyaction.co.kr";
  if (!hasSupabaseEnv()) return { supportEmail: fallback, refundEmail: fallback };
  const { data, error } = await publicClient().from("site_settings").select("key,value").in("key", ["site_basic", "payment_refund", "support_email"]);
  if (error) return { supportEmail: fallback, refundEmail: fallback };
  const values = new Map((data || []).map((row) => [row.key, row.value]));
  const basic = values.get("site_basic");
  const commerce = values.get("payment_refund");
  const supportCandidate = basic && typeof basic === "object" && !Array.isArray(basic) ? (basic as Record<string, unknown>).supportEmail : values.get("support_email");
  const supportEmail = emailValue(supportCandidate, fallback);
  const refundCandidate = commerce && typeof commerce === "object" && !Array.isArray(commerce) ? (commerce as Record<string, unknown>).refundContact : null;
  return { supportEmail, refundEmail: emailValue(refundCandidate, supportEmail) };
}

function formatDate(value: string | null) {
  if (!value) return "일정 추후 안내";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "운영기간 추후 안내";
  if (!end) return formatDate(start);
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function formatSessionDate(value: string | null) {
  if (!value) return "일정 추후 안내";
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} ${timePart}`;
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function cohortPresentation(cohort?: CohortRow) {
  if (!cohort) return { status: "모집 예정", statusTone: "blue" as const, applicationOpen: false };
  const generation = cohort.name.match(/\d+기/)?.[0];
  const now = Date.now();
  const startsAt = cohort.recruitment_start_at ? new Date(cohort.recruitment_start_at).getTime() : null;
  const endsAt = cohort.recruitment_end_at ? new Date(cohort.recruitment_end_at).getTime() : null;
  const dateWindowOpen = (startsAt === null || startsAt <= now) && (endsAt === null || endsAt > now);
  const applicationOpen = cohort.status === "recruiting" && dateWindowOpen;
  if (applicationOpen) {
    return { status: `${generation ? `${generation} ` : ""}모집 중`, statusTone: "red" as const, applicationOpen: true };
  }
  if (cohort.status === "recruiting") {
    if (cohort.recruitment_start_at && new Date(cohort.recruitment_start_at).getTime() > now) return { status: "모집 예정", statusTone: "blue" as const, applicationOpen: false };
    if (cohort.recruitment_end_at && new Date(cohort.recruitment_end_at).getTime() <= now) return { status: "모집 마감", statusTone: "gray" as const, applicationOpen: false };
    return { status: "모집 예정", statusTone: "blue" as const, applicationOpen: false };
  }
  if (cohort.status === "upcoming") return { status: "모집 예정", statusTone: "blue" as const, applicationOpen: false };
  if (cohort.status === "in_progress") return { status: "진행 중", statusTone: "blue" as const, applicationOpen: false };
  if (cohort.status === "completed") return { status: "종료", statusTone: "gray" as const, applicationOpen: false };
  return { status: "모집 마감", statusTone: "gray" as const, applicationOpen: false };
}

function mapSession(row: SessionRow): Session {
  return {
    title: row.title,
    output: row.expected_output || "실행 결과물",
    date: formatSessionDate(row.scheduled_at),
    description: row.description || "회차별 상세 내용은 수강 홈에서 확인할 수 있습니다.",
  };
}

function mapCurriculum(courseId: string, weeks: CurriculumWeekRow[], lessons: CurriculumLessonRow[]): CurriculumWeek[] {
  return weeks.filter((week)=>week.course_id===courseId).sort((a,b)=>a.display_order-b.display_order).map((week)=>({
    id:week.id,
    label:`${week.week_number}주차`,
    title:week.title,
    goal:week.goal||"",
    lessons:lessons.filter((lesson)=>lesson.week_id===week.id).sort((a,b)=>a.display_order-b.display_order).map((lesson)=>({
      id:lesson.id,
      day:lesson.day_number,
      title:lesson.title,
      description:lesson.description||"",
      kind:({material:"자료",text:"텍스트",link:"링크",vod:"VOD"} as const)[lesson.content_type],
      accessMode:lesson.access_mode,
      duration:lesson.duration_label||"",
    })),
  }));
}

function mapCourse(course: CourseRow, cohorts: CohortRow[], sessions: SessionRow[], weeks: CurriculumWeekRow[], lessons: CurriculumLessonRow[], thumbnailUrl?: string): ClassItem {
  const cohort = cohorts
    .filter((item) => item.course_id === course.id && item.status !== "cancelled")
    .sort((a, b) => {
      const toneScore = (item: CohortRow) => cohortPresentation(item).statusTone === "red" ? 0 : cohortPresentation(item).statusTone === "blue" ? 1 : 2;
      return toneScore(a) - toneScore(b) || cohortPriority[a.status] - cohortPriority[b.status];
    })[0];
  const presentation = cohortPresentation(cohort);
  const sessionRows = cohort
    ? sessions.filter((item) => item.cohort_id === cohort.id).sort((a, b) => a.session_number - b.session_number)
    : [];

  return {
    slug: course.slug,
    productKind: course.metadata?.productKind === "digital" ? "digital" : "class",
    programType: course.metadata?.programType === "free" || course.list_price === 0 ? "free" : "paid",
    cohortId: cohort?.id,
    title: course.title,
    summary: course.summary || "현장에서 바로 적용하는 브랜디액션 실전 클래스입니다.",
    category: course.category || "실전 교육",
    status: presentation.status,
    statusTone: presentation.statusTone,
    startDate: formatDate(cohort?.operation_start_at || null),
    operationPeriod: formatPeriod(cohort?.operation_start_at || null, cohort?.operation_end_at || null),
    schedule: course.schedule_label || "일정 추후 안내",
    duration: `${course.duration_label || "기간 추후 안내"}${sessionRows.length ? " LIVE" : ""}`,
    price: formatPrice(cohort?.price ?? course.list_price),
    seats: cohort?.capacity ? `정원 ${cohort.capacity}명` : "정원 제한 없음",
    applicationOpen: presentation.applicationOpen,
    recruitmentEndAt: cohort?.recruitment_end_at || undefined,
    capacity: cohort?.capacity ?? null,
    instructor: course.instructor_name || "브랜디액션",
    accent: "red",
    thumbnailUrl,
    sessions: sessionRows.map(mapSession),
    curriculum: mapCurriculum(course.id,weeks,lessons),
  };
}

async function queryPublishedClasses(): Promise<ClassItem[]> {
  if (!hasSupabaseEnv()) return [];

  try {
    const supabase = publicClient();
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,slug,title,summary,category,instructor_name,list_price,duration_label,schedule_label,display_order,metadata")
      .eq("status", "published")
      .order("display_order", { ascending: false });
    if (courseError || !courseData?.length) return [];

    const courseIds = courseData.map((course) => course.id);
    const [cohortResult, thumbnailResult] = await Promise.all([
      supabase
        .from("cohorts")
        .select("id,course_id,name,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at,price,capacity,status")
        .in("course_id", courseIds),
      supabase
        .from("course_assets")
        .select("course_id,storage_path")
        .in("course_id", courseIds)
        .eq("asset_type", "thumbnail")
        .order("display_order"),
    ]);
    const { data: cohortData, error: cohortError } = cohortResult;
    if (cohortError) return [];

    const cohorts = (cohortData || []) as CohortRow[];
    const thumbnails = thumbnailResult.error ? [] : (thumbnailResult.data || []) as CourseThumbnailRow[];
    return (courseData as CourseRow[]).map((course) => {
      const thumbnail = thumbnails.find((asset) => asset.course_id === course.id);
      const thumbnailUrl = thumbnail ? supabase.storage.from("course-assets").getPublicUrl(thumbnail.storage_path).data.publicUrl : undefined;
      return mapCourse(course, cohorts, [], [], [], thumbnailUrl);
    });
  } catch {
    return [];
  }
}

const getPublishedClassesCached = unstable_cache(queryPublishedClasses, ["published-class-list"], {
  revalidate: 60,
});

export async function getPublishedClasses() {
  return getPublishedClassesCached();
}

async function queryPublishedClass(slug: string): Promise<ClassItem | undefined> {
  if (!hasSupabaseEnv()) return undefined;
  try {
    const supabase = publicClient();
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,slug,title,summary,category,instructor_name,list_price,duration_label,schedule_label,display_order,metadata")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (courseError || !courseData) return undefined;

    const course = courseData as CourseRow;
    const [cohortResult, thumbnailResult, weekResult] = await Promise.all([
      supabase
        .from("cohorts")
        .select("id,course_id,name,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at,price,capacity,status")
        .eq("course_id", course.id),
      supabase
        .from("course_assets")
        .select("course_id,storage_path")
        .eq("course_id", course.id)
        .eq("asset_type", "thumbnail")
        .order("display_order")
        .limit(1),
      supabase
        .from("curriculum_weeks")
        .select("id,course_id,week_number,title,goal,display_order")
        .eq("course_id", course.id)
        .eq("is_published", true),
    ]);
    if (cohortResult.error) return undefined;

    const cohorts = (cohortResult.data || []) as CohortRow[];
    const cohortIds = cohorts.map((cohort) => cohort.id);
    const weeks = weekResult.error ? [] : (weekResult.data || []) as CurriculumWeekRow[];
    const weekIds = weeks.map((week) => week.id);
    const [sessionResult, lessonResult] = await Promise.all([
      cohortIds.length
        ? supabase
            .from("cohort_sessions")
            .select("cohort_id,session_number,title,description,expected_output,scheduled_at")
            .in("cohort_id", cohortIds)
        : Promise.resolve({ data: [] as SessionRow[], error: null }),
      weekIds.length
        ? supabase
            .from("curriculum_lessons")
            .select("id,week_id,day_number,title,description,content_type,access_mode,duration_label,display_order")
            .in("week_id", weekIds)
            .eq("is_published", true)
        : Promise.resolve({ data: [] as CurriculumLessonRow[], error: null }),
    ]);

    const thumbnail = thumbnailResult.error ? undefined : (thumbnailResult.data?.[0] as CourseThumbnailRow | undefined);
    const thumbnailUrl = thumbnail
      ? supabase.storage.from("course-assets").getPublicUrl(thumbnail.storage_path).data.publicUrl
      : undefined;
    return mapCourse(
      course,
      cohorts,
      sessionResult.error ? [] : (sessionResult.data || []) as SessionRow[],
      weeks,
      lessonResult.error ? [] : (lessonResult.data || []) as CurriculumLessonRow[],
      thumbnailUrl,
    );
  } catch {
    return undefined;
  }
}

const getPublishedClassCached = unstable_cache(queryPublishedClass, ["published-class-detail"], {
  revalidate: 60,
});

export async function getPublishedClass(slug: string) {
  return getPublishedClassCached(slug);
}

async function queryPublicBanners():Promise<PublicBanner[]>{
  if(!hasSupabaseEnv())return [];
  try{
    const supabase=publicClient();
    const {data,error}=await supabase.from("site_banners").select("link_url,image_path").eq("is_active",true).not("image_path","is",null).order("display_order").limit(10);
    if(error||!data)return [];
    return data.flatMap((banner) => banner.image_path ? [{ link: banner.link_url ? safePublicHref(banner.link_url,"/classes") : "/classes", image: supabase.storage.from("course-assets").getPublicUrl(banner.image_path).data.publicUrl }] : []);
  }catch{return []}
}

const getPublicBannersCached = unstable_cache(queryPublicBanners, ["public-banners"], {
  revalidate: 60,
});

export async function getPublicBanners() {
  return getPublicBannersCached();
}

async function queryPublicCourseAppearance(slug:string):Promise<PublicCourseAppearance>{
  const fallback={images:[] as string[],pixels:{enabled:false}};
  if(!hasSupabaseEnv())return fallback;
  try{
    const supabase=publicClient();
    const {data:course,error}=await supabase.from("courses").select("id,metadata").eq("slug",slug).eq("status","published").maybeSingle();
    if(error||!course)return fallback;
    const {data:assets}=await supabase.from("course_assets").select("storage_path").eq("course_id",course.id).eq("asset_type","detail").order("display_order");
    const metadata=course.metadata&&typeof course.metadata==="object"&&!Array.isArray(course.metadata)?course.metadata as Record<string,unknown>:{};
    const tracking=metadata.tracking&&typeof metadata.tracking==="object"&&!Array.isArray(metadata.tracking)?metadata.tracking as PublicCourseAppearance["pixels"]:{};
    return {images:(assets||[]).map(asset=>supabase.storage.from("course-assets").getPublicUrl(asset.storage_path).data.publicUrl),pixels:tracking};
  }catch{return fallback}
}

const getPublicCourseAppearanceCached = unstable_cache(queryPublicCourseAppearance, ["public-course-appearance"], {
  revalidate: 60,
});

export async function getPublicCourseAppearance(slug: string) {
  return getPublicCourseAppearanceCached(slug);
}

async function queryPublishedReviews(courseSlug?: string): Promise<PublicReview[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = publicClient();
    let query = supabase.from("reviews").select("id,author_name,author_nickname,rating,body,published_at,created_at,courses!inner(title,slug),cohorts(name)").eq("status", "published").order("is_featured", { ascending: false }).order("display_order").order("published_at", { ascending: false }).limit(100);
    if (courseSlug) query = query.eq("courses.slug", courseSlug);
    const { data, error } = await query;
    if (error) return [];
    return (data || []).map((review) => {
      const course = Array.isArray(review.courses) ? review.courses[0] : review.courses;
      const cohort = Array.isArray(review.cohorts) ? review.cohorts[0] : review.cohorts;
      return { id: review.id, name: publicReviewerName(review.author_name, review.author_nickname), className: course?.title || "브랜디액션 클래스", cohortName: cohort?.name || "수강생", rating: Number(review.rating), quote: review.body, publishedAt: review.published_at || review.created_at };
    });
  } catch { return []; }
}

const getPublishedReviewsCached = unstable_cache(queryPublishedReviews, ["published-reviews"], {
  revalidate: 60,
});

export async function getPublishedReviews(courseSlug?: string) {
  return getPublishedReviewsCached(courseSlug);
}

async function queryPublishedReviewVideos(): Promise<PublicReviewVideo[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const { data, error } = await publicClient().from("review_videos").select("id,title,reviewer_name,reviewer_role,description,video_url,thumbnail_url").eq("is_published", true).order("display_order").order("created_at", { ascending: false }).limit(12);
    if (error) return [];
    return (data || []).flatMap((video) => {
      const embedUrl = reviewVideoEmbedUrl(video.video_url);
      if (!embedUrl) return [];
      return [{ id: video.id, title: video.title, reviewerName: video.reviewer_name, reviewerRole: video.reviewer_role || "수강생", description: video.description || "", embedUrl, thumbnailUrl: video.thumbnail_url || reviewVideoThumbnail(video.video_url) || "" }];
    });
  } catch { return []; }
}

const getPublishedReviewVideosCached = unstable_cache(queryPublishedReviewVideos, ["published-review-videos"], {
  revalidate: 60,
});

export async function getPublishedReviewVideos() {
  return getPublishedReviewVideosCached();
}
