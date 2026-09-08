import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageTitle, AdminShell } from "@/app/components/admin-shell";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!await getAdminUser("members")) redirect("/admin?notice=permission_required");
  const params = await searchParams;
  const page = Math.min(10000, Math.max(1, Math.floor(Number(params.page) || 1)));
  const result = await createAdminClient().from("course_content_claims").select("id,claimed_at,source,medium,campaign,profiles(full_name,email),curriculum_lessons(title,curriculum_weeks(courses(title)))", { count: "exact" }).order("claimed_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  const pages = Math.max(1, Math.ceil((result.count || 0) / 20));
  return <AdminShell active="leads"><AdminPageTitle eyebrow="RESOURCE MEMBERS" title="무료 콘텐츠 이용" description="가입 회원의 최초 콘텐츠 이용과 광고 유입 태그를 확인합니다. 같은 회원이 같은 콘텐츠를 다시 받아도 중복 집계하지 않습니다." action={<Link className="admin-outline" href="/admin/content">무료 콘텐츠 설정</Link>}/><p className="studio-help">이 목록은 마케팅 수신 동의 목록이 아닙니다. 광고 캠페인 링크에 utm_source · utm_medium · utm_campaign을 붙이면 최초 이용 기준으로 기록됩니다.</p><section className="admin-panel ops-panel"><header><h2>콘텐츠 이용 내역</h2><span>총 {result.error ? "확인 필요" : (result.count || 0).toLocaleString()}건</span></header>{result.error ? <p className="admin-save-error" role="alert">이용 내역을 불러오지 못했습니다.</p> : <div className="admin-table-wrap"><table><thead><tr><th>회원</th><th>클래스·콘텐츠</th><th>유입 경로</th><th>캠페인</th><th>최초 이용</th></tr></thead><tbody>{result.data?.map((row) => { const profile = one(row.profiles); const lesson = one(row.curriculum_lessons); const course = one(one(lesson?.curriculum_weeks || null)?.courses || null); return <tr key={row.id}><td><strong>{profile?.full_name || "이름 미입력"}</strong><p>{profile?.email}</p></td><td><strong>{lesson?.title}</strong><p>{course?.title}</p></td><td>{row.source || "직접·미지정"}<p>{row.medium}</p></td><td>{row.campaign || "—"}</td><td>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(row.claimed_at))}</td></tr>; })}{!result.data?.length && <tr><td colSpan={5}><div className="ops-empty">아직 무료 콘텐츠 이용 내역이 없습니다.</div></td></tr>}</tbody></table></div>}<footer className="submission-pagination"><Link aria-disabled={page <= 1} href={`/admin/leads?page=${Math.max(1, page - 1)}`}>이전</Link><span>{page} / {pages}</span><Link aria-disabled={page >= pages} href={`/admin/leads?page=${Math.min(pages, page + 1)}`}>다음</Link></footer></section></AdminShell>;
}
