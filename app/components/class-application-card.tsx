import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { ClassItem } from "@/app/data";

export function ClassApplicationCard({ item }: { item: ClassItem }) {
  const isFree = item.programType === "free" || item.price === "0원";
  const checkoutHref = `/checkout?course=${encodeURIComponent(item.slug)}${item.cohortId ? `&cohort=${encodeURIComponent(item.cohortId)}` : ""}`;

  return <aside className="purchase-card">
    <div className="purchase-status"><span>{item.status}</span><strong>{item.seats}</strong></div>
    <div className="purchase-price"><small>수강료</small><strong>{item.price}</strong><span>{item.applicationOpen ? "신청 화면에서 최종 내용을 확인해 주세요." : "모집 일정은 추후 안내됩니다."}</span></div>
    <dl>
      <div><dt>운영기간</dt><dd>{item.operationPeriod || item.startDate}</dd></div>
      <div><dt>수업 일정</dt><dd>{item.schedule}</dd></div>
      <div><dt>진행 방식</dt><dd>온라인 LIVE</dd></div>
      <div><dt>VOD·다시보기</dt><dd>{item.duration}</dd></div>
    </dl>
    {item.applicationOpen
      ? <Link className="button button-primary button-lg full" href={checkoutHref}>수강 신청하기 <ArrowRight /></Link>
      : <button className="button button-dark button-lg full" disabled>{item.status === "모집 마감" ? "모집 마감" : "모집 준비 중"}</button>}
    <p className="safe-copy"><ShieldCheck size={15}/>{isFree ? "로그인 후 즉시 수강 신청이 완료됩니다." : <>결제 전 <Link href="/policies/refund">환불규정</Link>을 확인해 주세요.</>}</p>
  </aside>;
}
