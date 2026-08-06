import { createClient } from "@supabase/supabase-js";
import { classes as fallbackClasses, defaultCurriculum, type ClassItem, type CurriculumWeek, type Session } from "@/app/data";
import { getSupabasePublicConfig, hasSupabaseEnv } from "@/lib/supabase/config";

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
type CurriculumLessonRow = { id: string; week_id: string; day_number: number; title: string; description: string | null; content_type: "vod" | "material"; duration_label: string | null; display_order: number };

export type PublicBanner = { image?: string; eyebrow?: string; title?: string; copy?: string; link?: string };
export type PublicCourseAppearance = { images: string[]; pixels: { meta?: string; kakao?: string; google?: string; enabled?: boolean } };

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
  if (!cohort) return { status: "모집 예정", statusTone: "blue" as const };
  const generation = cohort.name.match(/\d+기/)?.[0];
  if (cohort.status === "recruiting") {
    return { status: `${generation ? `${generation} ` : ""}모집 중`, statusTone: "red" as const };
  }
  if (cohort.status === "upcoming") return { status: "모집 예정", statusTone: "blue" as const };
  if (cohort.status === "in_progress") return { status: "진행 중", statusTone: "blue" as const };
  if (cohort.status === "completed") return { status: "종료", statusTone: "gray" as const };
  return { status: "모집 마감", statusTone: "gray" as const };
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
      kind:lesson.content_type==="material"?"자료":"VOD",
      duration:lesson.duration_label||"",
    })),
  }));
}

function mapCourse(course: CourseRow, cohorts: CohortRow[], sessions: SessionRow[], weeks: CurriculumWeekRow[], lessons: CurriculumLessonRow[]): ClassItem {
  const cohort = cohorts
    .filter((item) => item.course_id === course.id && item.status !== "cancelled")
    .sort((a, b) => cohortPriority[a.status] - cohortPriority[b.status])[0];
  const presentation = cohortPresentation(cohort);
  const sessionRows = cohort
    ? sessions.filter((item) => item.cohort_id === cohort.id).sort((a, b) => a.session_number - b.session_number)
    : [];

  return {
    slug: course.slug,
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
    instructor: course.instructor_name || "브랜디액션",
    accent: "red",
    sessions: sessionRows.map(mapSession),
    curriculum: mapCurriculum(course.id,weeks,lessons),
  };
}

export async function getPublishedClasses(): Promise<ClassItem[]> {
  if (!hasSupabaseEnv()) return fallbackClasses;

  try {
    const supabase = publicClient();
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,slug,title,summary,category,instructor_name,list_price,duration_label,schedule_label,display_order,metadata")
      .eq("status", "published")
      .order("display_order", { ascending: false });
    if (courseError || !courseData?.length) return fallbackClasses;

    const courseIds = courseData.map((course) => course.id);
    const { data: cohortData, error: cohortError } = await supabase
      .from("cohorts")
      .select("id,course_id,name,operation_start_at,operation_end_at,price,capacity,status")
      .in("course_id", courseIds);
    if (cohortError) return fallbackClasses;

    const cohorts = (cohortData || []) as CohortRow[];
    const cohortIds = cohorts.map((cohort) => cohort.id);
    let sessions: SessionRow[] = [];
    if (cohortIds.length) {
      const { data: sessionData, error: sessionError } = await supabase
        .from("cohort_sessions")
        .select("cohort_id,session_number,title,description,expected_output,scheduled_at")
        .in("cohort_id", cohortIds);
      if (!sessionError) sessions = (sessionData || []) as SessionRow[];
    }

    const { data: weekData, error: weekError } = await supabase
      .from("curriculum_weeks")
      .select("id,course_id,week_number,title,goal,display_order")
      .in("course_id", courseIds)
      .eq("is_published", true);
    const weeks = weekError ? [] : (weekData || []) as CurriculumWeekRow[];
    const weekIds = weeks.map((week)=>week.id);
    let lessons: CurriculumLessonRow[]=[];
    if(weekIds.length){
      const {data:lessonData,error:lessonError}=await supabase.from("curriculum_lessons").select("id,week_id,day_number,title,description,content_type,duration_label,display_order").in("week_id",weekIds).eq("is_published",true);
      if(!lessonError)lessons=(lessonData||[]) as CurriculumLessonRow[];
    }

    return (courseData as CourseRow[]).map((course) => mapCourse(course, cohorts, sessions, weeks, lessons));
  } catch {
    return fallbackClasses;
  }
}

export async function getPublishedClass(slug: string) {
  const items = await getPublishedClasses();
  return items.find((item) => item.slug === slug);
}

export async function getPublicBanner():Promise<PublicBanner>{
  if(!hasSupabaseEnv())return {};
  try{
    const supabase=publicClient();
    const {data,error}=await supabase.from("site_banners").select("eyebrow,title,description,link_url,image_path").eq("is_active",true).order("display_order").limit(1).maybeSingle();
    if(error||!data)return {};
    return {eyebrow:data.eyebrow||undefined,title:data.title||undefined,copy:data.description||undefined,link:data.link_url||undefined,image:data.image_path?supabase.storage.from("course-assets").getPublicUrl(data.image_path).data.publicUrl:undefined};
  }catch{return {}}
}

export async function getPublicCourseAppearance(slug:string):Promise<PublicCourseAppearance>{
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

export function fallbackCurriculum(){return defaultCurriculum}
