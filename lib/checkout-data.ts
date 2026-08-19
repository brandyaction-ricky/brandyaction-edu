import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CheckoutCourse = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  listPrice: number;
  durationLabel: string;
  cohorts: Array<{
    id: string;
    name: string;
    note: string;
    price: number;
    capacity: number | null;
    recruitmentEndAt: string | null;
    operationStartAt: string | null;
    operationEndAt: string | null;
    status: string;
  }>;
};

type CohortRow = {
  id: string;
  name: string;
  note: string | null;
  price: number;
  capacity: number | null;
  recruitment_start_at: string | null;
  recruitment_end_at: string | null;
  operation_start_at: string | null;
  operation_end_at: string | null;
  status: string;
};

export async function getCheckoutCourse(slug: string): Promise<CheckoutCourse | null> {
  const supabase = await createClient();
  const { data: course, error } = await supabase
    .from("courses")
    .select("id,slug,title,summary,list_price,duration_label,cohorts(id,name,note,price,capacity,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at,status)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !course) return null;
  const now = Date.now();
  const cohorts = ((course.cohorts || []) as CohortRow[])
    .filter((cohort) => {
      const startsAt = cohort.recruitment_start_at ? new Date(cohort.recruitment_start_at).getTime() : null;
      const endsAt = cohort.recruitment_end_at ? new Date(cohort.recruitment_end_at).getTime() : null;
      const dateWindowOpen = (startsAt === null || startsAt <= now) && (endsAt === null || endsAt > now);
      return cohort.status === "recruiting" && dateWindowOpen;
    })
    .sort((a, b) => String(a.operation_start_at).localeCompare(String(b.operation_start_at)));
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    summary: course.summary || "브랜디액션 실전 클래스",
    listPrice: course.list_price,
    durationLabel: course.duration_label || "수강기간 별도 안내",
    cohorts: cohorts.map((cohort) => ({
      id: cohort.id,
      name: cohort.name,
      note: cohort.note || "",
      price: cohort.price,
      capacity: cohort.capacity,
      recruitmentEndAt: cohort.recruitment_end_at,
      operationStartAt: cohort.operation_start_at,
      operationEndAt: cohort.operation_end_at,
      status: cohort.status,
    })),
  };
}

export function formatKoreanDate(value: string | null) {
  if (!value) return "일정 추후 안내";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}
