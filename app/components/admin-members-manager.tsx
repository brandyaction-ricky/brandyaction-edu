"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Filter, RefreshCw, Search, Tag, UserPlus, Users, X } from "lucide-react";

type Relation<T> = T | T[] | null;
type Enrollment = { id: string; status: string; source: string; course_id: string; cohort_id: string; courses: Relation<{ id: string; title: string }>; cohorts: Relation<{ id: string; name: string }> };
type Member = { id: string; email: string; full_name: string | null; phone: string | null; role: string; status: string; marketing_consent: boolean; created_at: string; enrollments: Enrollment[]; orders: Array<{ total_amount: number; status: string; payments: Array<{ approved_amount: number; cancelled_amount: number }> }> };
type Cohort = { id: string; course_id: string; name: string; status: string; courses: Relation<{ id: string; title: string }> };
type CustomerTag = { id: string; name: string; color: string; description: string | null };
type MemberTag = { member_id: string; tag_id: string };
type Data = { members: Member[]; cohorts: Cohort[]; tags: CustomerTag[]; memberTags: MemberTag[]; operatorRole: string };
const empty: Data = { members: [], cohorts: [], tags: [], memberTags: [], operatorRole: "staff" };

const one = <T,>(value: Relation<T>) => Array.isArray(value) ? value[0] || null : value;
const date = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
const statusLabel: Record<string, string> = { active: "활성", suspended: "이용 정지", withdrawn: "탈퇴", expired: "만료", revoked: "중지", refunded: "환불" };

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/members", { cache: "no-store", ...init });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "회원 요청을 처리하지 못했습니다.");
  return result;
}

export function AdminMembersManager() {
  const params = useSearchParams();
  const [data, setData] = useState<Data>(empty);
  const [query, setQuery] = useState("");
  const [courseId, setCourseId] = useState("all");
  const [cohortId, setCohortId] = useState(params.get("cohort") || "all");
  const [tagId, setTagId] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantCohortId, setGrantCohortId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = async () => {
    setError("");
    try { setData(await request<Data>()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "회원을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);
  const selected = data.members.find((member) => member.id === selectedId) || null;
  const memberTagIds = (memberId: string) => data.memberTags.filter((row) => row.member_id === memberId).map((row) => row.tag_id);
  const courses = useMemo(() => {
    const map = new Map<string, string>();
    data.cohorts.forEach((cohort) => { const course = one(cohort.courses); if (course) map.set(course.id, course.title); });
    return [...map].map(([id, title]) => ({ id, title }));
  }, [data.cohorts]);
  const visibleCohorts = courseId === "all" ? data.cohorts : data.cohorts.filter((cohort) => cohort.course_id === courseId);
  const visible = useMemo(() => data.members.filter((member) => {
    const normalized = query.toLowerCase();
    const textMatch = [member.full_name || "", member.email, member.phone || ""].some((value) => value.toLowerCase().includes(normalized));
    const active = member.enrollments.filter((enrollment) => enrollment.status === "active");
    const courseMatch = courseId === "all" || active.some((enrollment) => enrollment.course_id === courseId);
    const cohortMatch = cohortId === "all" || active.some((enrollment) => enrollment.cohort_id === cohortId);
    const tagMatch = tagId === "all" || memberTagIds(member.id).includes(tagId);
    const statusMatch = status === "all" || member.status === status;
    return textMatch && courseMatch && cohortMatch && tagMatch && statusMatch;
  }), [data, query, courseId, cohortId, tagId, status]);
  const mutate = async (body: Record<string, unknown>, success: string) => {
    setSaving(true); setError(""); setMessage("");
    try { await request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setMessage(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const grant = async () => {
    if (!selected || !grantCohortId) return;
    setSaving(true); setError("");
    try { await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selected.id, cohortId: grantCohortId }) }); setMessage("수강권을 발급했습니다."); setGrantCohortId(""); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "수강권을 발급하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const toggleTag = async (memberId: string, nextTagId: string) => {
    const current = memberTagIds(memberId);
    await mutate({ action: "tags", userId: memberId, tagIds: current.includes(nextTagId) ? current.filter((id) => id !== nextTagId) : [...current, nextTagId] }, "고객 태그를 저장했습니다.");
  };
  const resetFilters = () => { setQuery(""); setCourseId("all"); setCohortId("all"); setTagId("all"); setStatus("all"); };

  if (loading) return <section className="admin-panel admin-loading-state"><RefreshCw className="spin"/><strong>실제 회원 데이터를 불러오는 중입니다.</strong></section>;
  return <div className="member-ops-page">
    <section className="member-kpis">
      <article><span>전체 회원</span><strong>{data.members.length}</strong><small>가입 계정</small></article>
      <article><span>활성 고객</span><strong>{data.members.filter((member) => member.status === "active").length}</strong><small>이용 가능</small></article>
      <article><span>수강 고객</span><strong>{data.members.filter((member) => member.enrollments.some((enrollment) => enrollment.status === "active")).length}</strong><small>활성 수강권 보유</small></article>
      <article><span>마케팅 동의</span><strong>{data.members.filter((member) => member.marketing_consent && member.phone).length}</strong><small>발송 가능 후보</small></article>
    </section>
    <section className="admin-panel member-filter-panel">
      <header><div><Filter/><span><strong>고객 분류</strong><small>상품·기수·태그를 조합해 필요한 회원만 찾습니다.</small></span></div><button onClick={resetFilters}>필터 초기화</button></header>
      <div className="member-filter-grid">
        <label>상품<select value={courseId} onChange={(event) => { setCourseId(event.target.value); setCohortId("all"); }}><option value="all">전체 상품</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        <label>기수<select value={cohortId} onChange={(event) => setCohortId(event.target.value)}><option value="all">전체 기수</option>{visibleCohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{one(cohort.courses)?.title} · {cohort.name}</option>)}</select></label>
        <label>고객 태그<select value={tagId} onChange={(event) => setTagId(event.target.value)}><option value="all">전체 태그</option>{data.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <label>회원 상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="suspended">이용 정지</option><option value="withdrawn">탈퇴</option></select></label>
        <div className="member-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·이메일·휴대폰 검색"/></div>
      </div>
    </section>
    <section className="admin-panel table-panel member-results">
      <div className="member-result-head"><div><strong>회원 목록</strong><span>{visible.length}명</span></div><button className="admin-outline" onClick={() => void load()}><RefreshCw/>새로고침</button></div>
      <div className="member-ops-table">
        <div className="member-ops-head"><span>회원</span><span>고객 태그</span><span>상품·기수</span><span>누적 결제</span><span>상태</span><span>관리</span></div>
        {visible.map((member) => {
          const paid = member.orders.reduce((sum, order) => { const payment = order.payments?.[0]; return sum + Math.max(0, (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0)); }, 0);
          const active = member.enrollments.filter((enrollment) => enrollment.status === "active");
          const tags = data.tags.filter((tag) => memberTagIds(member.id).includes(tag.id));
          return <article key={member.id}>
            <div className="member-identity"><b>{(member.full_name || member.email)[0]}</b><span><strong>{member.full_name || "이름 미입력"}</strong><small>{member.email}</small><small>{member.phone || "휴대폰 미입력"} · {date(member.created_at)} 가입</small></span></div>
            <div className="member-tag-list">{tags.length ? tags.map((tag) => <span key={tag.id} style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</span>) : <small>미분류</small>}</div>
            <div className="member-course-list">{active.length ? active.slice(0, 2).map((enrollment) => <span key={enrollment.id}><strong>{one(enrollment.courses)?.title}</strong><small>{one(enrollment.cohorts)?.name}</small></span>) : <small>활성 수강권 없음</small>}{active.length > 2 && <em>+{active.length - 2}</em>}</div>
            <strong>{paid.toLocaleString()}원</strong>
            <span className={`status-label ${member.status === "active" ? "success" : "refund"}`}>{statusLabel[member.status] || member.status}</span>
            <button className="manage-button prominent" onClick={() => setSelectedId(member.id)}>상세 관리</button>
          </article>;
        })}
        {!visible.length && <div className="member-empty"><Users/><strong>조건에 맞는 회원이 없습니다.</strong><span>필터를 초기화하거나 다른 조건을 선택해 보세요.</span></div>}
      </div>
    </section>
    {selected && <div className="member-drawer-backdrop" onMouseDown={() => setSelectedId(null)}><aside className="member-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="member-drawer-avatar">{(selected.full_name || selected.email)[0]}</span><div><strong>{selected.full_name || "이름 미입력"}</strong><small>{selected.email}</small></div></div><button onClick={() => setSelectedId(null)}><X/></button></header>
      <section><h3>회원 상태</h3><div className="drawer-inline"><select value={selected.status} onChange={(event) => void mutate({ userId: selected.id, status: event.target.value }, "회원 상태를 저장했습니다.")} disabled={saving}><option value="active">활성</option><option value="suspended">이용 정지</option><option value="withdrawn">탈퇴</option></select>{data.operatorRole === "admin" && <select value={selected.role} onChange={(event) => void mutate({ userId: selected.id, role: event.target.value }, "회원 역할을 저장했습니다.")} disabled={saving}><option value="student">일반 회원</option><option value="staff">스태프</option><option value="admin">최고 관리자</option></select>}</div></section>
      <section><h3>고객 태그</h3><p>CRM 대상 분류와 동일한 태그입니다.</p><div className="drawer-tags">{data.tags.map((tag) => <button key={tag.id} className={memberTagIds(selected.id).includes(tag.id) ? "selected" : ""} style={{ "--tag-color": tag.color } as CSSProperties} onClick={() => void toggleTag(selected.id, tag.id)} disabled={saving}><Tag/>{tag.name}</button>)}{!data.tags.length && <small>CRM에서 고객 태그를 먼저 만들어 주세요.</small>}</div></section>
      <section><div className="drawer-section-head"><h3>수강권</h3><span>{selected.enrollments.length}개</span></div><div className="drawer-enrollments">{selected.enrollments.map((enrollment) => <article key={enrollment.id}><div><strong>{one(enrollment.courses)?.title}</strong><small>{one(enrollment.cohorts)?.name} · {enrollment.source === "purchase" ? "결제 발급" : "관리자 발급"}</small></div><select value={enrollment.status} onChange={(event) => void mutate({ action: "enrollment", enrollmentId: enrollment.id, status: event.target.value }, "수강권 상태를 저장했습니다.")} disabled={saving}><option value="active">활성</option><option value="revoked">중지</option><option value="expired">만료</option><option value="refunded">환불</option></select></article>)}</div><div className="drawer-grant"><select value={grantCohortId} onChange={(event) => setGrantCohortId(event.target.value)}><option value="">발급할 상품·기수 선택</option>{data.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{one(cohort.courses)?.title} · {cohort.name}</option>)}</select><button className="admin-primary" onClick={() => void grant()} disabled={!grantCohortId || saving}><UserPlus/>수강권 발급</button></div></section>
      <footer><span>{selected.marketing_consent ? <><Check/>마케팅 수신 동의</> : "마케팅 수신 미동의"}</span><small>{selected.phone || "휴대폰 정보 없음"}</small></footer>
    </aside></div>}
    {message && <p className="admin-save-success"><Check/>{message}</p>}{error && <p className="admin-save-error" role="alert">{error}</p>}
  </div>;
}
