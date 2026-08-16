import type { ClassItem } from "@/app/data";
import { ClassCard } from "./class-card";

export function ClassCatalog({ classes }: { classes: ClassItem[] }) {
  const freeClasses = classes.filter((item) => item.programType === "free");
  const paidClasses = classes.filter((item) => item.programType === "paid");
  const recruitingCount = paidClasses.filter((item) => item.status.includes("모집 중")).length;
  return <div className="class-category-catalog">
    <section className="class-category-section free-category" aria-labelledby="free-class-heading">
      <header><div><span>FREE PROGRAMS</span><h2 id="free-class-heading">무료 클래스</h2><p>사업의 현재 문제를 진단하고 유료 실전 클래스 전에 방향을 정리합니다.</p></div><strong>{freeClasses.length}개 클래스</strong></header>
      {freeClasses.length ? <div className="class-grid">{freeClasses.map((item) => <ClassCard key={item.slug} item={item}/>)}</div> : <div className="catalog-note"><strong>무료 클래스를 준비하고 있습니다.</strong><p>공개되는 즉시 이 카테고리에서 확인할 수 있습니다.</p></div>}
    </section>
    <section className="class-category-section paid-category" aria-labelledby="paid-class-heading">
      <header><div><span>PAID LIVE PROGRAMS</span><h2 id="paid-class-heading">유료 클래스</h2><p>모집이 열린 기수에서 실행 결과물을 완성하는 라이브 클래스입니다.</p></div><strong>{recruitingCount ? `${recruitingCount}개 신청 가능` : "현재 모집 준비 중"}</strong></header>
      {paidClasses.length ? <div className="class-grid">{paidClasses.map((item) => <ClassCard key={item.slug} item={item} applicationOnlyWhenRecruiting />)}</div> : <div className="catalog-note"><strong>등록된 유료 클래스가 없습니다.</strong><p>새 클래스가 공개되면 이곳에서 모집 상태를 확인할 수 있습니다.</p></div>}
    </section>
  </div>;
}
