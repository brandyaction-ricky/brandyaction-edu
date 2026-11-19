"use client";
// 전체 유입 성과(/admin/analytics) — 조회 요청(`kind=analytics`, from/to)은 기존과 같고 화면 구성만 관리자 정본 부품으로 맞춘다.
import { useEffect, useMemo, useState } from "react";
import { CampusAnalyticsPanel } from "@/features/campus/analytics/panel";
import { money, text as t, type Row } from "@/lib/platform";
import {
  AdminButton,
  AdminDataTable,
  AdminDatePicker,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminInlineError,
  AdminLinkButton,
  AdminLoadingState,
  AdminMetricGrid,
  AdminSearchField,
  AdminSection,
  AdminSummaryCard,
  AdminTabs,
} from "@/features/admin-ui";
import "./site-analytics.css";

const DAY = 86400000;
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shiftDay = (day: string, offset: number) => new Date(Date.parse(day) + offset * DAY).toISOString().slice(0, 10);
const PRESETS = [7, 30, 90] as const;
// 집계 함수(edu_analytics_report)가 보는 페이지 범위와 같은 이름으로 안내한다.
const TRACKED_PAGES = "홈·클래스·아티클·고객 이야기·신청 화면";
const STAGES = [
  ["article_view", "아티클 조회"],
  ["class_view", "클래스 상세 조회"],
  ["checkout_view", "신청 화면 조회"],
  ["application_click", "신청 버튼 클릭"],
] as const;

const count = (value: unknown) => Number(value || 0).toLocaleString("ko-KR");
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—");

function useAnalyticsReport(url: string | null) {
  const [result, setResult] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(url, { signal: controller.signal })
        .then(async response => {
          const value = await response.json();
          if (!response.ok) throw new Error(value.error);
          setResult(value);
          setLoading(false);
        })
        .catch(reason => {
          if (reason.name !== "AbortError") {
            setError(reason.message || "유입 성과를 불러오지 못했습니다.");
            setLoading(false);
          }
        });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [url, attempt]);
  return { result, error, loading, retry: () => setAttempt(value => value + 1) };
}

export function SiteAnalytics() {
  const [view, setView] = useState<"site" | "campus">("site");
  return <div className="site-analytics">
    <AdminTabs label="분석 화면 선택" items={[{ value: "site", label: "사이트 유입·결제" }, { value: "campus", label: "문샷 캠퍼스 행동" }]} value={view} onChange={value => setView(value as "site" | "campus")}>
      {value => value !== view ? null : value === "campus" ? <CampusAnalyticsPanel /> : <SitePanel />}
    </AdminTabs>
  </div>;
}

function SitePanel() {
  const [today, setToday] = useState(kstToday);
  const [from, setFrom] = useState(() => shiftDay(kstToday(), -29));
  const [to, setTo] = useState(kstToday);
  const [pathSearch, setPathSearch] = useState("");
  const valid = Boolean(from && to && Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(to)));
  const dateError = !valid ? "시작일과 종료일을 선택해 주세요." : from > to ? "종료일은 시작일 이후로 선택해 주세요." : Date.parse(to) - Date.parse(from) >= 366 * DAY ? "조회 기간은 1년 이내로 선택해 주세요." : "";
  const days = valid && !dateError ? Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1 : 0;
  const end = valid ? new Date(Date.parse(to) + DAY).toISOString() : "";
  const { result, error, loading, retry } = useAnalyticsReport(dateError ? null : "/api/platform/workflows?" + new URLSearchParams({
    kind: "analytics",
    from: from ? from + "T00:00:00+09:00" : "",
    to: end ? new Date(Date.parse(end) - 9 * 3600000).toISOString() : "",
  }));
  const stages = (result.stages || {}) as Record<string, number>;
  const paths = useMemo(() => (Array.isArray(result.paths) ? result.paths : []) as Row[], [result.paths]);
  const visitors = Number(result.visitors || 0);
  const clicks = Number(stages.application_click || 0);
  const empty = !visitors && !Number(result.events) && !Number(result.paidOrders) && !Number(result.revenue) && !paths.length && !Object.values(stages).some(Number);
  const query = pathSearch.trim().toLowerCase();
  const visiblePaths = query ? paths.filter(row => t(row, "path").toLowerCase().includes(query)) : paths;
  const choosePreset = (length: number) => {
    const current = kstToday();
    setToday(current); setTo(current); setFrom(shiftDay(current, -(length - 1)));
  };

  return <div className="site-analytics-panel">
    <AdminFilterBar
      className="site-analytics-filter"
      filters={<div className="site-analytics-presets" role="group" aria-label="빠른 조회 기간">{PRESETS.map(length => {
        const selected = !dateError && to === today && days === length;
        return <AdminButton key={length} size="sm" variant={selected ? "primary" : "outline"} aria-pressed={selected} onClick={() => choosePreset(length)}>최근 {length}일</AdminButton>;
      })}</div>}
      date={<><AdminDatePicker label="시작일 · KST" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /><AdminDatePicker label="종료일 · KST" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></>}
      action={<AdminButton variant="outline" onClick={retry} disabled={loading || !!dateError}>새로고침</AdminButton>}
      appliedSummary={dateError ? "기간을 고치면 바로 다시 집계합니다." : `집계 기간 ${from} ~ ${to} · ${days}일 · 한국 시간, 종료일 포함 · 기간을 바꾸면 바로 다시 집계합니다`}
    />
    {dateError ? <AdminInlineError>{dateError}</AdminInlineError> : loading ? (
      <AdminLoadingState title="선택한 기간의 유입 성과를 조회하고 있습니다." description="방문 기록과 결제 승인 내역을 함께 집계합니다." />
    ) : error ? (
      <AdminErrorState title="유입 성과를 불러오지 못했습니다." onRetry={retry}>{error}</AdminErrorState>
    ) : <>
      {empty && <div role="status"><AdminEmptyState compact title="기간 내 기록 없음">조회 기간을 넓히거나 운영·트래킹 설정에서 방문 기록 수집이 켜져 있는지 확인해 주세요.</AdminEmptyState></div>}
      <AdminMetricGrid columns={4} className="site-analytics-kpis" aria-label="기간 요약">
        <AdminSummaryCard label="방문 세션" value={count(visitors)} note="같은 사람이 여러 번 오면 각각 셉니다" />
        <AdminSummaryCard label="신청 버튼 클릭 세션" value={count(clicks)} note={`방문 세션의 ${share(clicks, visitors)}`} />
        <AdminSummaryCard label="결제 승인 주문" value={`${count(result.paidOrders)}건`} note="승인일 기준 · 이후 환불된 주문 포함" />
        <AdminSummaryCard label="결제액 (환불 차감)" value={money(Number(result.revenue || 0))} note="승인 금액에서 현재까지 환불액을 뺀 값" />
      </AdminMetricGrid>
      <p className="site-analytics-scope">방문·클릭은 {TRACKED_PAGES} 기록만 집계하며 시험·내부 회원은 뺍니다. 결제는 같은 기간에 승인된 주문이고, 특정 유입 채널이 만든 매출이라는 뜻은 아닙니다.</p>

      <AdminSection bordered title="페이지별 참여 단계" description="각 단계를 한 번 이상 한 방문 세션 수 · 비율은 전체 방문 세션 대비">
        <ol className="site-analytics-stages">
          {STAGES.map(([key, label]) => {
            const sessions = Number(stages[key] || 0);
            const ratio = visitors > 0 ? Math.min(100, (sessions / visitors) * 100) : 0;
            return <li key={key}>
              <span className="site-analytics-stage-label">{label}</span>
              <strong>{count(sessions)}<small> 세션</small></strong>
              <span className="site-analytics-stage-share">{share(sessions, visitors)}</span>
              <span className="site-analytics-stage-bar" aria-hidden="true"><span style={{ width: `${ratio}%` }} /></span>
            </li>;
          })}
        </ol>
        <p className="site-analytics-note">단계마다 따로 센 세션 수입니다. 같은 세션이 앞 단계를 거쳤는지는 따지지 않으므로 단계 사이 전환율로 읽지 않습니다.</p>
      </AdminSection>

      <div className="site-analytics-channels">
        <span>광고·채널별로 들어온 숫자는 이 화면에서 나누지 않습니다.</span>
        <AdminLinkButton size="sm" href="/admin/landing">광고·웨비나 성과 보기</AdminLinkButton>
        <AdminLinkButton size="sm" href="/admin/links">단축 링크 클릭 보기</AdminLinkButton>
      </div>

      <AdminSection
        title="페이지별 유입 성과"
        description={paths.length ? `조회 수 상위 ${paths.length}개 페이지${paths.length >= 100 ? "(최대 100개)" : ""} · 검색과 정렬은 이 목록 안에서 · ${visiblePaths.length}개 표시` : "기간 안에 기록된 페이지가 없습니다."}
        actions={<AdminSearchField label="페이지 주소 검색" placeholder="주소 일부 입력 (예: /classes)" value={pathSearch} onChange={event => setPathSearch(event.target.value)} />}
      >
        <AdminDataTable label="페이지별 유입 성과" rows={visiblePaths} getRowId={row => t(row, "path")} loading={loading} columns={[
          { id: "path", header: "페이지", value: row => t(row, "path"), sortable: true },
          { id: "views", header: "조회 수", value: row => Number(row.views || 0), align: "number", sortable: true },
          { id: "visitors", header: "방문 세션", value: row => Number(row.visitors || 0), align: "number", sortable: true },
          { id: "clicks", header: "클릭 수", value: row => Number(row.clicks || 0), align: "number", sortable: true },
        ]} empty={query && paths.length ? <AdminEmptyState compact title="검색과 맞는 페이지가 없습니다." action={<AdminButton size="sm" onClick={() => setPathSearch("")}>검색 지우기</AdminButton>}>주소 일부를 다르게 입력해 보세요.</AdminEmptyState> : <AdminEmptyState compact title="기간 내 페이지별 참여 기록이 없습니다." />} />
      </AdminSection>
    </>}
  </div>;
}
