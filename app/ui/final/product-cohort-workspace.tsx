"use client";

import { labels, money, number as num, text as t, type Row } from "@/lib/platform";
import { useState } from "react";
import type { WorkflowSend } from "../learning-workflows";

const dateFields = ["recruitment_start_at", "recruitment_end_at", "operation_start_at", "operation_end_at"] as const;
const statuses = ["upcoming", "recruiting", "closed", "in_progress", "completed", "cancelled"] as const;

function kstInput(value: unknown) {
  if (!value || !Number.isFinite(Date.parse(String(value)))) return "";
  return new Date(Date.parse(String(value)) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function CohortFields({ course, cohort, pending, send, onSaved }: {
  course: Row;
  cohort?: Row;
  pending: boolean;
  send: WorkflowSend;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(t(cohort, "name"));
  const [code, setCode] = useState(t(cohort, "cohort_code"));
  const [price, setPrice] = useState(cohort ? String(num(cohort, "price")) : String(num(course, "list_price")));
  const [capacity, setCapacity] = useState(cohort?.capacity == null ? "" : String(cohort.capacity));
  const [status, setStatus] = useState(t(cohort, "status") || "upcoming");
  const [dates, setDates] = useState<Record<(typeof dateFields)[number], string>>({
    recruitment_start_at: kstInput(cohort?.recruitment_start_at),
    recruitment_end_at: kstInput(cohort?.recruitment_end_at),
    operation_start_at: kstInput(cohort?.operation_start_at),
    operation_end_at: kstInput(cohort?.operation_end_at),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const disabled = pending || busy;

  async function save() {
    setError(""); setMessage("");
    if (!name.trim() || !code.trim()) { setError("기수명과 기수 코드를 입력해 주세요."); return; }
    if (!/^\d+$/.test(price) || !Number.isSafeInteger(Number(price))) { setError("판매가는 0원 이상의 정수로 입력해 주세요."); return; }
    if (capacity && (!/^\d+$/.test(capacity) || !Number.isSafeInteger(Number(capacity)) || Number(capacity) < 1)) { setError("정원은 1명 이상의 정수로 입력해 주세요."); return; }
    if (dateFields.some(field => dates[field] && !Number.isFinite(Date.parse(`${dates[field]}:00+09:00`)))) { setError("모집·운영 날짜를 확인해 주세요."); return; }
    for (const [start, end] of [["recruitment_start_at", "recruitment_end_at"], ["operation_start_at", "operation_end_at"]] as const) {
      if (dates[start] && dates[end] && dates[start] >= dates[end]) { setError("종료일은 시작일 이후로 설정해 주세요."); return; }
    }
    const values: Record<string, unknown> = {
      name: name.trim(), cohort_code: code.trim(), price: Number(price), capacity: capacity ? Number(capacity) : null, status,
      ...Object.fromEntries(dateFields.map(field => [field, dates[field] ? new Date(`${dates[field]}:00+09:00`).toISOString() : null])),
    };
    if (!cohort) values.course_id = course.id;
    setBusy(true);
    try {
      const result = await send({ action: "save", section: "cohorts", id: cohort?.id, values }, cohort ? "기수 정보를 저장했습니다." : "기수를 추가했습니다.");
      const saved = result.row as Row | undefined;
      if (saved?.id) onSaved(String(saved.id));
      setMessage(cohort ? "기수 정보를 저장했습니다." : "기수를 추가했습니다. 연결 기수로 선택되었습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "기수를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <section className="product-cohort-fields" aria-label={cohort ? `${t(cohort, "name")} 편집` : "새 기수 등록"}>
    <h3>{cohort ? "기수 편집" : "새 기수 등록"}</h3>
    <p className="meta">기수별 판매가·모집 및 운영 일정은 상품 기본 정보와 별도로 저장됩니다. 상태 변경은 신청 가능 여부에 영향을 줄 수 있습니다.</p>
    <div className="form-grid">
      <label>기수명<input value={name} maxLength={120} onChange={event => setName(event.target.value)} disabled={disabled} /></label>
      <label>기수 코드<input value={code} maxLength={40} onChange={event => setCode(event.target.value)} disabled={disabled || Boolean(cohort)} /></label>
      <label>기수 판매가 · 원<input type="number" min="0" step="1" value={price} onChange={event => setPrice(event.target.value)} disabled={disabled} /></label>
      <label>정원 · 명<input type="number" min="1" step="1" value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="제한 없음" disabled={disabled} /></label>
      <label>기수 상태<select value={status} onChange={event => setStatus(event.target.value)} disabled={disabled}>{statuses.map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</select></label>
      {dateFields.map(field => <label key={field}>{({ recruitment_start_at: "모집 시작 · KST", recruitment_end_at: "모집 마감 · KST", operation_start_at: "운영 시작 · KST", operation_end_at: "운영 종료 · KST" })[field]}<input type="datetime-local" value={dates[field]} onChange={event => setDates(current => ({ ...current, [field]: event.target.value }))} disabled={disabled} /></label>)}
    </div>
    {error && <p className="notice warning" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <button className="btn primary" type="button" onClick={() => void save()} disabled={disabled || !name.trim() || !code.trim()}>{busy ? "저장 중…" : cohort ? "기수 저장" : "기수 추가"}</button>
  </section>;
}

export function ProductCohortWorkspace({ course, cohorts, selectedId, onSelect, pending, send }: {
  course?: Row;
  cohorts: Row[];
  selectedId: string;
  onSelect: (id: string) => void;
  pending: boolean;
  send: WorkflowSend;
}) {
  const [creating, setCreating] = useState(false);
  if (!course?.id) return <div className="section-pad"><p className="notice">상품을 먼저 저장하면 이 화면에서 기수를 등록할 수 있습니다.</p></div>;
  const selected = creating ? undefined : cohorts.find(item => item.id === selectedId);
  return <div className="section-pad product-cohort-workspace">
    <h2>상품별 기수·회차</h2>
    <p className="meta">이 상품에 연결된 기수만 표시합니다. 기존 기수는 그대로 유지됩니다.</p>
    <div className="product-cohort-list" aria-label="연결 기수 목록">
      {cohorts.map(item => <button className={`btn${!creating && item.id === selectedId ? " dark" : ""}`} key={item.id} type="button" onClick={() => { setCreating(false); onSelect(String(item.id)); }} disabled={pending} aria-pressed={!creating && item.id === selectedId}>{t(item, "name")} · {labels[t(item, "status")] || t(item, "status")} · {money(num(item, "price"))}</button>)}
      <button className={`btn${creating || !selected ? " dark" : ""}`} type="button" onClick={() => setCreating(true)} disabled={pending} aria-pressed={creating || !selected}>+ 새 기수</button>
    </div>
    <CohortFields key={selected?.id || "new"} course={course} cohort={selected} pending={pending} send={send} onSaved={id => { setCreating(false); onSelect(id); }} />
  </div>;
}
