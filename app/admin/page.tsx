import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, CalendarClock, CheckSquare2, Download, Users } from "lucide-react";
import { AdminPageTitle, AdminShell } from "../components/admin-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;
const date = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const operator = await getAdminSession();
  if (!operator) redirect("/login?next=/admin");
  const { notice } = await searchParams;
  const canMembers = operator.role === "admin" || operator.preferences.staffCanManageMembers === true;
  const canProducts = operator.role === "admin" || operator.preferences.staffCanManageProducts === true;
  const admin = createAdminClient();
  const [pending, learners, claims, courses, queue, sessions] = await Promise.all([
    canMembers ? admin.from("mission_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted") : null,
    canMembers ? admin.from("enrollments").select("id", { count: "exact", head: true }).eq("status", "active").lte("access_starts_at", new Date().toISOString()).or(`access_ends_at.is.null,access_ends_at.gt.${new Date().toISOString()}`) : null,
    canMembers ? admin.from("course_content_claims").select("id", { count: "exact", head: true }) : null,
    canProducts ? admin.from("courses").select("id", { count: "exact", head: true }).eq("status", "published") : null,
    canMembers ? admin.from("mission_submissions").select("id,submitted_at,quiz_required,curriculum_missions(title),enrollments(profiles!enrollments_user_id_fkey(full_name))").eq("status", "submitted").order("submitted_at").limit(5) : null,
    canProducts ? admin.from("cohort_sessions").select("id,title,scheduled_at,cohorts(name,courses(title))").gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(4) : null,
  ]);
  const metric = (result: { count: number | null; error: unknown } | null) => result?.error ? "확인 필요" : (result?.count ?? 0).toLocaleString("ko-KR");
  const failed = [pending, learners, claims, courses, queue, sessions].some((result) => result?.error);
  return <AdminShell active="dashboard">
    <AdminPageTitle eyebrow="OVERVIEW" title="오늘의 운영" description="지금 처리할 일과 교육 운영 현황을 한눈에 확인하세요." action={canProducts ? <Link className="admin-primary" href="/admin/content"><BookOpen/>콘텐츠 관리</Link> : undefined}/>
    {notice === "permission_required" && <p className="admin-save-error" role="alert">이 메뉴를 이용할 권한이 없습니다. 관리자에게 권한을 요청해 주세요.</p>}
    {failed && <p className="admin-save-error" role="alert">일부 현황을 불러오지 못했습니다. ‘확인 필요’ 항목은 해당 메뉴에서 다시 확인해 주세요.</p>}
    <section className="ops-metrics" aria-label="운영 요약">
      {canMembers && <><Link href="/admin/submissions"><CheckSquare2/><span>미션 승인 대기</span><strong>{metric(pending)}</strong><small>검토가 끝나면 달성도에 반영</small></Link><Link href="/admin/members"><Users/><span>활성 수강권</span><strong>{metric(learners)}</strong><small>현재 수강 기간 내의 수강권 수</small></Link><Link href="/admin/leads"><Download/><span>무료 콘텐츠 이용</span><strong>{metric(claims)}</strong><small>회원·콘텐츠별 최초 이용 수</small></Link></>}
      {canProducts && <Link href="/admin/products"><BookOpen/><span>공개 클래스</span><strong>{metric(courses)}</strong><small>고객 사이트 공개 상태 기준</small></Link>}
    </section>
    <div className="ops-columns">
      {canMembers && <section className="admin-panel ops-panel"><header><div><h2>먼저 확인할 미션</h2><p>오래 기다린 제출부터 최대 5건을 표시합니다.</p></div><Link href="/admin/submissions">전체 보기<ArrowRight/></Link></header><div>{queue?.error ? <p className="ops-empty">제출 목록을 불러오지 못했습니다.</p> : queue?.data?.length ? queue.data.map((row) => { const enrollment = one(row.enrollments); const profile = one(enrollment?.profiles || null); return <Link className="ops-queue-row" key={row.id} href="/admin/submissions"><span className="ops-avatar">{(profile?.full_name || "회원")[0]}</span><div><strong>{one(row.curriculum_missions)?.title || "미션 제출"}</strong><small>{profile?.full_name || "회원"} · {date(row.submitted_at)}</small></div><span className="studio-badge">{row.quiz_required ? "퀴즈 통과" : "제출 완료"}</span><ArrowRight/></Link>; }) : <div className="ops-empty"><CheckSquare2/><h3>대기 중인 미션이 없습니다</h3><p>교육생이 미션을 제출하면 이곳에 표시됩니다.</p></div>}</div></section>}
      {canProducts && <section className="admin-panel ops-panel"><header><div><h2>다가오는 회차</h2><p>등록된 일정 중 가까운 순서입니다.</p></div><Link href="/admin/cohorts">일정 관리<ArrowRight/></Link></header><div>{sessions?.error ? <p className="ops-empty">일정을 불러오지 못했습니다.</p> : sessions?.data?.length ? sessions.data.map((s) => <Link className="ops-session" key={s.id} href="/admin/cohorts"><CalendarClock/><div><small>{date(s.scheduled_at!)}</small><strong>{s.title}</strong><p>{one(one(s.cohorts)?.courses || null)?.title} · {one(s.cohorts)?.name}</p></div></Link>) : <div className="ops-empty"><CalendarClock/><h3>예정된 회차가 없습니다</h3><p>기수·회차 관리에서 일정을 등록하세요.</p></div>}</div></section>}
    </div>
    {canProducts && <section className="ops-guide"><div><span className="studio-eyebrow">무료 콘텐츠 운영</span><h2>광고에서 가입, 자료 제공까지</h2><p>콘텐츠를 등록하고 ‘가입 회원 무료’로 설정하세요. 저장한 무료 페이지 주소를 광고에 연결하면 회원별 자료 이용 현황을 확인할 수 있습니다.</p></div><Link className="admin-outline" href="/admin/content">콘텐츠 설정<ArrowRight/></Link></section>}
    {!canProducts && !canMembers && <section className="admin-panel ops-empty"><h2>담당 메뉴에서 업무를 시작하세요</h2><p>부여받은 권한에 따라 왼쪽 메뉴에 이용 가능한 기능이 표시됩니다.</p></section>}
  </AdminShell>;
}
