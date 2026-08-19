"use client";

import Link from "next/link";
import { CalendarDays, Clock3, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClassItem } from "@/app/data";

function remainingLabel(value?: string, now?: number | null) {
  if (!value) return { countdown: "상시 모집", day: "마감일 없음" };
  if (now == null) return { countdown: "모집 마감까지 남은 시간 확인 중", day: "모집 중" };
  const remaining = Math.max(0, new Date(value).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor(remaining % 86_400_000 / 3_600_000);
  const minutes = Math.floor(remaining % 3_600_000 / 60_000);
  const seconds = Math.floor(remaining % 60_000 / 1_000);
  return {
    countdown: remaining > 0
      ? `마감까지 ${days}일 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : "모집이 마감되었습니다",
    day: remaining > 0 ? `마감 D-${Math.max(1, Math.ceil(remaining / 86_400_000))}` : "모집 마감",
  };
}

export function ClassApplicationCard({ item }: { item: ClassItem }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!item.applicationOpen || !item.recruitmentEndAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [item.applicationOpen, item.recruitmentEndAt]);
  const remaining = useMemo(() => remainingLabel(item.recruitmentEndAt, now), [item.recruitmentEndAt, now]);
  const isFree = item.programType === "free" || item.price === "0원";
  const checkoutHref = `/checkout?course=${encodeURIComponent(item.slug)}${item.cohortId ? `&cohort=${encodeURIComponent(item.cohortId)}` : ""}`;

  return <aside className={`purchase-card application-card ${item.applicationOpen ? "is-open" : ""}`}>
    <div className="application-card-head">
      <strong>{isFree ? "무료" : item.price}</strong>
      <span>{item.applicationOpen ? remaining.countdown : item.status}</span>
    </div>
    <div className="application-card-meta" aria-label="모집 정보">
      <span><Users />{item.capacity ? `정원 ${item.capacity}명` : "무제한 모집"}</span>
      <span><CalendarDays />{remaining.day}</span>
      <span><Clock3 />{item.duration.includes("무제한") ? "무제한 수강" : item.duration}</span>
    </div>
    <dl>
      <div><dt>운영기간</dt><dd>{item.operationPeriod || item.startDate}</dd></div>
      <div><dt>수업 일정</dt><dd>{item.schedule}</dd></div>
      <div><dt>진행 방식</dt><dd>온라인 LIVE</dd></div>
    </dl>
    {item.applicationOpen
      ? <Link className="button button-primary button-lg full application-submit" href={checkoutHref}>수강 신청하기</Link>
      : <button className="button button-dark button-lg full" disabled>{item.status === "모집 마감" ? "모집 마감" : "모집 준비 중"}</button>}
    <p className="safe-copy"><ShieldCheck size={15}/>{isFree ? "로그인 후 즉시 수강 신청이 완료됩니다." : <>결제 전 <Link href="/policies/refund">환불규정</Link>을 확인해 주세요.</>}</p>
  </aside>;
}
