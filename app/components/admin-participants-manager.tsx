"use client";
import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { AdminDetailPanel } from "./admin-detail-panel";
import { downloadCsv, levelNames, type Participant, type ParticipantReport } from "@/lib/admin-participants";

const date = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "활동 기록 없음";
export function AdminParticipantsManager({ initial }: { initial: ParticipantReport | null }) {
  const [data, setData] = useState(initial);
  const [cohort, setCohort] = useState(initial?.cohortId || "");
  const [query, setQuery] = useState(""); const [search, setSearch] = useState("");
  const [level, setLevel] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [error, setError] = useState(initial ? "" : "참가자 현황을 불러오지 못했습니다. 새로고침해 주세요.");
  const [busy, setBusy] = useState(false); const [refresh, setRefresh] = useState(0);
  const first = useRef(true);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const controller = new AbortController();
    const params = new URLSearchParams({ cohort, q: search, level, status, page: String(page) });
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return; setBusy(true); setError("");
      try { const response = await fetch(`/api/admin/participants?${params}`, { signal: controller.signal, cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); if (active) setData(result); }
      catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "불러오지 못했습니다."); }
      finally { if (active) setBusy(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [cohort, search, level, status, page, refresh]);
  const stats = data?.stats;
  const selectedCohort = data?.cohorts.find((item) => item.id === data.cohortId);
  const exporting = () => downloadCsv("participants-page.csv", [["이름", "이메일", "콘텐츠 진행률", "미션 제출", "미션 승인", "필수 미션", "달성도", "레벨", "마지막 활동", "활동 주의"], ...(data?.rows || []).map((row) => [row.full_name, row.email, row.learning_percent, row.submitted, row.approved, row.mission_total, row.achievement, row.level, row.last_activity, row.attention ? "주의" : "정상"])]);
  return <div aria-busy={busy}><div className="workspace-kpis"><article><span>참가자</span><strong>{stats?.participants ?? "—"}명</strong><small>{data?.capacity ? `정원 ${data.capacity}명` : "현재 이용 가능한 수강권"}</small></article><article><span>평균 미션 달성도</span><strong>{stats?.average == null ? "—" : `${stats.average}%`}</strong><small>필수 미션 승인 기준</small></article><article><span>미션 참여율</span><strong>{stats?.participation ?? 0}%</strong><small>미션을 1개 이상 제출한 참가자</small></article><article><span>활동 주의</span><strong className="attention">{stats?.attention ?? "—"}명</strong><small>3일 이상 학습·제출 기록 없음</small></article></div>
    <div className="workspace-filters"><select aria-label="참가자 기수" value={cohort} onChange={(e) => { setCohort(e.target.value); setPage(1); setSelected(null); }}><option value="" disabled>기수 선택</option>{data?.cohorts.map((item) => <option key={item.id} value={item.id}>{item.course_title} · {item.name}</option>)}</select><input aria-label="참가자 검색" placeholder="이름 또는 이메일 검색" value={query} onChange={(e) => setQuery(e.target.value)}/><select aria-label="달성 레벨" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}><option value="">전체 레벨</option>{levelNames.slice(1).map((name, i) => <option key={name} value={i + 1}>Lv{i + 1} {name}</option>)}</select><select aria-label="활동 상태" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">전체 상태</option><option value="normal">정상</option><option value="attention">활동 주의</option></select><button className="admin-primary" disabled={busy || !data?.rows.length} onClick={exporting}><Download/>현재 목록 내보내기</button><button className="admin-outline" aria-label="참가자 새로고침" onClick={() => setRefresh((value) => value + 1)} disabled={busy}><RefreshCw/></button></div>
    {error && <p className="admin-save-error" role="alert">{error}</p>}<div className="workspace-table-wrap"><table className="workspace-table"><thead><tr>{["참가자", "콘텐츠 진행률", "미션 제출", "미션 승인", "달성도", "레벨", "마지막 활동", "상태", "관리"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data?.rows.map((row) => <tr key={row.id}><td><strong>{row.full_name || "이름 미입력"}</strong><small>{row.email}</small></td><td><progress value={row.learning_percent} max={100} aria-label={`${row.full_name || row.email} 콘텐츠 진행률`}/>{row.learning_percent}%</td><td>{row.submitted} / {row.mission_total}</td><td>{row.approved} / {row.mission_total}</td><td><strong>{row.achievement == null ? "미션 미등록" : `${row.achievement}%`}</strong></td><td><span className={`studio-badge ${row.level && row.level >= 3 ? "live" : ""}`}>{row.level ? `Lv${row.level} ${levelNames[row.level]}` : "—"}</span></td><td>{date(row.last_activity)}</td><td><span className={`status-label ${row.attention ? "refund" : "success"}`}>{row.attention ? "활동 주의" : "정상"}</span></td><td><button className="admin-outline" onClick={() => setSelected(row)}>상세</button></td></tr>)}{!data?.rows.length && <tr><td colSpan={9} className="mission-empty">{busy ? "참가자를 불러오는 중입니다." : "조건에 맞는 참가자가 없습니다."}</td></tr>}</tbody></table></div>
    <div className="workspace-pagination"><span>총 {data?.total ?? 0}명 · {page} / {Math.max(1, Math.ceil((data?.total || 0) / 50))} 페이지</span><div><button className="admin-outline" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>이전</button><button className="admin-outline" disabled={busy || page * 50 >= (data?.total || 0)} onClick={() => setPage(page + 1)}>다음</button></div></div>
    <section className="mission-week-card" style={{ marginTop: 20 }}><header><h2>주차별 미션 참여</h2><span className="studio-help">{selectedCohort?.name} · 필수 미션 제출 기준</span></header>{data?.weeks.map((week) => <div className="participant-week-row" key={week.id}><span>{week.week}주차 · {week.title}</span><progress max={Math.max(1, stats?.participants || 0)} value={week.participants}/><strong>{week.participants}명</strong></div>)}</section>
    {selected && <AdminDetailPanel title={`${selected.full_name || "참가자"} · 학습 현황`} onClose={() => setSelected(null)}><section><h3>{selectedCohort?.course_title}</h3><p>{selectedCohort?.name} · {selected.email}</p><p>수강 등록 {date(selected.created_at)}</p></section><section><h3>진행과 달성</h3><dl className="studio-review"><div><dt>콘텐츠 진행률</dt><dd>{selected.learning_percent}% · 콘텐츠 {selected.lesson_total}개</dd></div><div><dt>필수 미션 제출</dt><dd>{selected.submitted} / {selected.mission_total}</dd></div><div><dt>관리자 승인</dt><dd>{selected.approved}개 · 승인 대기 {selected.pending}개</dd></div><div><dt>달성 레벨</dt><dd>{selected.level ? `Lv${selected.level} ${levelNames[selected.level]} · ${selected.achievement}%` : "필수 미션 미등록"}</dd></div></dl><p className="studio-help">달성도는 공개된 필수 미션의 승인 비율입니다. 0·25·50·75·100%에서 단계가 바뀌며, 영상 진도는 별도로 표시합니다.</p></section><section><h3>최근 활동</h3><p>{date(selected.last_activity)}</p><p>{selected.attention ? "3일 이상 학습 기록이 없습니다. 참여 상황을 확인해 주세요." : "정상적으로 참여하고 있습니다."}</p></section></AdminDetailPanel>}
  </div>;
}
