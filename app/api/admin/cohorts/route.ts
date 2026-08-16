import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { safeExternalUrl } from "@/lib/safe-url";

const statuses = new Set(["upcoming", "recruiting", "closed", "in_progress", "completed", "cancelled"]);

type SessionInput = {
  id?: string;
  title?: string;
  description?: string;
  expectedOutput?: string;
  scheduledAt?: string;
  liveUrl?: string;
  replayUrl?: string;
};

type CohortInput = {
  id?: string;
  courseId?: string;
  name?: string;
  note?: string;
  status?: string;
  capacity?: number | null;
  price?: number;
  recruitmentStartAt?: string | null;
  recruitmentEndAt?: string | null;
  operationStartAt?: string | null;
  operationEndAt?: string | null;
  firstSessionAt?: string;
  sessionCount?: number;
  sessions?: SessionInput[];
};

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

function nullableDate(value: unknown) {
  const text = String(value || "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null;
}

function validHttps(value: string) {
  return !value || Boolean(safeExternalUrl(value));
}

async function loadData() {
  const admin = createAdminClient();
  const [courseResult, cohortResult] = await Promise.all([
    admin.from("courses").select("id,course_code,title,list_price,status").order("display_order", { ascending: false }),
    admin.from("cohorts").select("id,course_id,cohort_code,name,note,recruitment_start_at,recruitment_end_at,operation_start_at,operation_end_at,price,capacity,status").order("operation_start_at", { ascending: false }),
  ]);
  if (courseResult.error) throw new Error(errorMessage(courseResult.error, "상품 목록을 불러오지 못했습니다."));
  if (cohortResult.error) throw new Error(errorMessage(cohortResult.error, "기수 목록을 불러오지 못했습니다."));

  const courses = (courseResult.data || []).map((course) => ({
    id: course.id,
    courseCode: course.course_code,
    title: course.title,
    listPrice: course.list_price,
    status: course.status,
  }));
  const cohortIds = (cohortResult.data || []).map((cohort) => cohort.id);
  const [sessionResult, enrollmentResult] = cohortIds.length
    ? await Promise.all([
        admin.from("cohort_sessions").select("id,cohort_id,session_number,title,description,expected_output,scheduled_at,cohort_session_contents(live_url,replay_url)").in("cohort_id", cohortIds).order("session_number"),
        admin.from("enrollments").select("id,cohort_id,status,profiles!enrollments_user_id_fkey(id,full_name,email,phone)").in("cohort_id", cohortIds).eq("status", "active"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (sessionResult.error) throw new Error(errorMessage(sessionResult.error, "회차 목록을 불러오지 못했습니다."));
  if (enrollmentResult.error) throw new Error(errorMessage(enrollmentResult.error, "기수별 수강생을 불러오지 못했습니다."));

  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const sessions = (sessionResult.data || []) as Array<Record<string, unknown>>;
  const enrollments = (enrollmentResult.data || []) as Array<Record<string, unknown>>;
  const cohorts = (cohortResult.data || []).map((cohort) => {
    const course = courseMap.get(cohort.course_id);
    const students = enrollments.filter((enrollment) => enrollment.cohort_id === cohort.id).map((enrollment) => {
      const raw = enrollment.profiles;
      const profile = Array.isArray(raw) ? raw[0] : raw as Record<string, unknown> | null;
      return { id: String(enrollment.id), userId: String(profile?.id || ""), name: String(profile?.full_name || "이름 미입력"), email: String(profile?.email || ""), phone: String(profile?.phone || "") };
    });
    return {
      id: cohort.id,
      courseId: cohort.course_id,
      courseCode: course?.courseCode || "COURSE",
      courseTitle: course?.title || "연결 상품",
      cohortCode: cohort.cohort_code,
      name: cohort.name,
      note: cohort.note || "",
      recruitmentStartAt: cohort.recruitment_start_at || "",
      recruitmentEndAt: cohort.recruitment_end_at || "",
      operationStartAt: cohort.operation_start_at || "",
      operationEndAt: cohort.operation_end_at || "",
      price: String(cohort.price),
      capacity: String(cohort.capacity || ""),
      status: cohort.status,
      enrolledCount: students.length,
      students,
      sessions: sessions.filter((session) => session.cohort_id === cohort.id).map((session) => {
        const raw = session.cohort_session_contents;
        const content = Array.isArray(raw) ? raw[0] : raw as Record<string, unknown> | null;
        return {
          id: String(session.id),
          sessionNumber: Number(session.session_number),
          title: String(session.title || ""),
          description: String(session.description || ""),
          expectedOutput: String(session.expected_output || ""),
          scheduledAt: String(session.scheduled_at || ""),
          liveUrl: String(content?.live_url || ""),
          replayUrl: String(content?.replay_url || ""),
        };
      }),
    };
  });
  return { courses, cohorts };
}

export async function GET() {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  try {
    return NextResponse.json(await loadData());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "기수 데이터를 불러오지 못했습니다.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as CohortInput | null;
  const name = String(body?.name || "").trim();
  const courseId = String(body?.courseId || "");
  const status = String(body?.status || "upcoming");
  const price = Number(body?.price);
  const capacity = body?.capacity == null ? null : Number(body.capacity);
  const sessionCount = Number(body?.sessionCount || 0);
  const firstSessionAt = nullableDate(body?.firstSessionAt);
  const operationStartAt = nullableDate(body?.operationStartAt);
  const operationEndAt = nullableDate(body?.operationEndAt);
  if (!courseId || !name) return NextResponse.json({ error: "연결 상품과 기수명을 입력해 주세요." }, { status: 400 });
  if (!statuses.has(status)) return NextResponse.json({ error: "기수 상태를 확인해 주세요." }, { status: 400 });
  if (!Number.isInteger(price) || price < 0) return NextResponse.json({ error: "판매가는 0원 이상 정수로 입력해 주세요." }, { status: 400 });
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) return NextResponse.json({ error: "정원은 1명 이상으로 입력해 주세요." }, { status: 400 });
  if (!operationStartAt || !operationEndAt || Date.parse(operationStartAt) > Date.parse(operationEndAt)) return NextResponse.json({ error: "기수 운영 시작일과 종료일을 확인해 주세요." }, { status: 400 });
  if (!firstSessionAt || !Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 24) return NextResponse.json({ error: "첫 수업 일시와 회차 수를 확인해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const { data: course } = await admin.from("courses").select("id,course_code,title").eq("id", courseId).maybeSingle();
  if (!course) return NextResponse.json({ error: "연결할 상품을 찾을 수 없습니다." }, { status: 404 });
  const cohortCode = `${course.course_code}_${Date.now()}`;
  const { data: cohort, error } = await admin.from("cohorts").insert({
    course_id: courseId,
    cohort_code: cohortCode,
    name,
    note: String(body?.note || "").trim() || null,
    recruitment_start_at: nullableDate(body?.recruitmentStartAt),
    recruitment_end_at: nullableDate(body?.recruitmentEndAt),
    operation_start_at: operationStartAt,
    operation_end_at: operationEndAt,
    price,
    capacity,
    status,
  }).select("id").single();
  if (error || !cohort) return NextResponse.json({ error: errorMessage(error, "기수를 생성하지 못했습니다.") }, { status: 500 });
  const sessions = Array.from({ length: sessionCount }, (_, index) => ({
    cohort_id: cohort.id,
    session_number: index + 1,
    title: `${index + 1}회차 라이브 클래스`,
    description: null,
    expected_output: null,
    scheduled_at: new Date(Date.parse(firstSessionAt) + index * 7 * 86_400_000).toISOString(),
    is_public: true,
  }));
  const { error: sessionError } = await admin.from("cohort_sessions").insert(sessions);
  if (sessionError) {
    await admin.from("cohorts").delete().eq("id", cohort.id);
    return NextResponse.json({ error: "회차 생성에 실패해 기수 생성을 되돌렸습니다." }, { status: 500 });
  }
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "cohort.created", entity_type: "cohort", entity_id: cohort.id, after_data: { course_id: courseId, cohort_code: cohortCode, session_count: sessionCount } });
  return NextResponse.json({ ok: true, id: cohort.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as CohortInput | null;
  const id = String(body?.id || "");
  const courseId = String(body?.courseId || "");
  const name = String(body?.name || "").trim();
  const status = String(body?.status || "");
  const price = Number(body?.price);
  const capacity = body?.capacity == null ? null : Number(body.capacity);
  const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
  if (!id || !courseId || !name || !statuses.has(status)) return NextResponse.json({ error: "기수 기본 정보를 확인해 주세요." }, { status: 400 });
  if (!Number.isInteger(price) || price < 0 || (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0))) return NextResponse.json({ error: "가격과 정원을 확인해 주세요." }, { status: 400 });
  if (sessions.some((session) => !String(session.title || "").trim() || !validHttps(String(session.liveUrl || "")) || !validHttps(String(session.replayUrl || "")))) return NextResponse.json({ error: "회차 제목과 https:// 링크를 확인해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: existing }, { data: linkedCourse }] = await Promise.all([
    admin.from("cohorts").select("id,course_id").eq("id", id).maybeSingle(),
    admin.from("courses").select("id").eq("id", courseId).maybeSingle(),
  ]);
  if (!existing) return NextResponse.json({ error: "기수를 찾을 수 없습니다." }, { status: 404 });
  if (!linkedCourse) return NextResponse.json({ error: "연결할 상품을 찾을 수 없습니다." }, { status: 404 });
  if (existing.course_id !== courseId) {
    const [orderCount, enrollmentCount] = await Promise.all([
      admin.from("order_items").select("id", { count: "exact", head: true }).eq("cohort_id", id),
      admin.from("enrollments").select("id", { count: "exact", head: true }).eq("cohort_id", id),
    ]);
    if ((orderCount.count || 0) + (enrollmentCount.count || 0) > 0) return NextResponse.json({ error: "주문 또는 수강생이 연결된 기수는 상품을 변경할 수 없습니다." }, { status: 409 });
  }
  const update = await admin.from("cohorts").update({
    course_id: courseId,
    name,
    note: String(body?.note || "").trim() || null,
    recruitment_start_at: nullableDate(body?.recruitmentStartAt),
    recruitment_end_at: nullableDate(body?.recruitmentEndAt),
    operation_start_at: nullableDate(body?.operationStartAt),
    operation_end_at: nullableDate(body?.operationEndAt),
    price,
    capacity,
    status,
  }).eq("id", id);
  if (update.error) return NextResponse.json({ error: errorMessage(update.error, "기수 정보를 저장하지 못했습니다.") }, { status: 500 });

  const { data: currentRows, error: currentError } = await admin.from("cohort_sessions").select("id").eq("cohort_id", id);
  if (currentError) return NextResponse.json({ error: "기존 회차를 확인하지 못했습니다." }, { status: 500 });
  const currentIds = new Set((currentRows || []).map((row) => row.id));
  for (const [index, row] of (currentRows || []).entries()) {
    const { error: renumberError } = await admin.from("cohort_sessions").update({ session_number: 10000 + index }).eq("id", row.id);
    if (renumberError) return NextResponse.json({ error: "회차 순서를 준비하지 못했습니다." }, { status: 500 });
  }
  const keptIds = new Set<string>();
  for (const [index, session] of sessions.entries()) {
    const payload = {
      cohort_id: id,
      session_number: index + 1,
      title: String(session.title || "").trim(),
      description: String(session.description || "").trim() || null,
      expected_output: String(session.expectedOutput || "").trim() || null,
      scheduled_at: nullableDate(session.scheduledAt),
      is_public: true,
    };
    let sessionId = String(session.id || "");
    if (currentIds.has(sessionId)) {
      const { error: sessionError } = await admin.from("cohort_sessions").update(payload).eq("id", sessionId);
      if (sessionError) return NextResponse.json({ error: "회차 정보를 저장하지 못했습니다." }, { status: 500 });
    } else {
      const { data: inserted, error: sessionError } = await admin.from("cohort_sessions").insert(payload).select("id").single();
      if (sessionError || !inserted) return NextResponse.json({ error: "새 회차를 추가하지 못했습니다." }, { status: 500 });
      sessionId = inserted.id;
    }
    keptIds.add(sessionId);
    const liveUrl = String(session.liveUrl || "").trim();
    const replayUrl = String(session.replayUrl || "").trim();
    if (liveUrl || replayUrl) {
      const { error: contentError } = await admin.from("cohort_session_contents").upsert({ session_id: sessionId, live_url: liveUrl || null, replay_url: replayUrl || null, resource_storage_path: null }, { onConflict: "session_id" });
      if (contentError) return NextResponse.json({ error: "라이브·다시보기 링크를 저장하지 못했습니다." }, { status: 500 });
    } else {
      await admin.from("cohort_session_contents").delete().eq("session_id", sessionId);
    }
  }
  const removed = [...currentIds].filter((sessionId) => !keptIds.has(sessionId));
  if (removed.length) await admin.from("cohort_sessions").delete().in("id", removed);
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "cohort.updated", entity_type: "cohort", entity_id: id, after_data: { course_id: courseId, session_count: sessions.length } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const operator = await getAdminUser("products");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "삭제할 기수를 선택해 주세요." }, { status: 400 });
  const admin = createAdminClient();
  const [orderCount, enrollmentCount] = await Promise.all([
    admin.from("order_items").select("id", { count: "exact", head: true }).eq("cohort_id", id),
    admin.from("enrollments").select("id", { count: "exact", head: true }).eq("cohort_id", id),
  ]);
  if ((orderCount.count || 0) + (enrollmentCount.count || 0) > 0) return NextResponse.json({ error: "주문 또는 수강생이 연결된 기수는 삭제할 수 없습니다. 상태를 ‘취소’로 변경해 주세요." }, { status: 409 });
  const { error } = await admin.from("cohorts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: errorMessage(error, "기수를 삭제하지 못했습니다.") }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "cohort.deleted", entity_type: "cohort", entity_id: id });
  return NextResponse.json({ ok: true });
}
