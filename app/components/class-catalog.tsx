"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { ClassItem } from "@/app/data";
import { ClassCard } from "./class-card";

export function ClassCatalog({ classes }: { classes: ClassItem[] }) {
  const [tab, setTab] = useState<"free" | "paid">("free");
  const recruitingCount = classes.filter((item) => item.status.includes("모집 중")).length;
  return <>
    <div className="class-catalog-tabs" role="tablist" aria-label="클래스 유형">
      <button role="tab" aria-selected={tab === "free"} className={tab === "free" ? "active" : ""} onClick={() => setTab("free")}><span>FREE</span>무료 클래스 <b>1</b></button>
      <button role="tab" aria-selected={tab === "paid"} className={tab === "paid" ? "active" : ""} onClick={() => setTab("paid")}><span>PAID</span>유료 클래스 <b>{recruitingCount}</b></button>
    </div>
    {tab === "free" ? <section className="free-class-catalog" role="tabpanel"><article><div><span>FREE CLASS · 3 LESSONS</span><h2>사업자를 위한<br/>마케팅·AI 매출 진단</h2><p>고객 유입부터 콘텐츠, 전환, 재구매까지 지금 매출을 막는 지점을 찾고 첫 실행안을 만듭니다.</p><ul><li><CheckCircle2/>회원가입 후 바로 시청</li><li><CheckCircle2/>별도 결제 없이 3강 전체 공개</li><li><CheckCircle2/>실무 블로그와 함께 바로 적용</li></ul></div><Link href="/articles#free-class">무료 클래스 신청하기 <ArrowRight/></Link></article></section> : <section className="paid-class-catalog" role="tabpanel"><header><div><strong>유료 라이브 클래스</strong><p>실제 모집이 열린 기수만 신청할 수 있습니다.</p></div><span>{recruitingCount ? `${recruitingCount}개 신청 가능` : "현재 모집 준비 중"}</span></header><div className="class-grid">{classes.map((item) => <ClassCard key={item.slug} item={item} applicationOnlyWhenRecruiting />)}</div>{!classes.length && <div className="catalog-note"><strong>등록된 유료 클래스가 없습니다.</strong><p>새 클래스가 공개되면 이곳에서 모집 상태를 확인할 수 있습니다.</p></div>}</section>}
  </>;
}
