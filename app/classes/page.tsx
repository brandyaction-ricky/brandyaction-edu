import { BrandHeader } from "../components/brand-header";
import { ClassCard } from "../components/class-card";
import { getPublishedClasses } from "@/lib/education-data";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const classes = await getPublishedClasses();
  return <main><BrandHeader />
    <section className="sub-hero"><div className="container"><span className="section-kicker">ALL PROGRAMS</span><h1>배우고 끝나지 않는<br />실전 클래스</h1><p>정해진 일정, 동료와의 실행, 구체적인 결과물로<br />사업의 다음 변화를 만듭니다.</p></div></section>
    <section className="section catalog-section"><div className="container">
      <div className="class-grid">{classes.map(item => <ClassCard key={item.slug} item={item} />)}</div>
      <div className="catalog-note"><strong>모집 중인 클래스가 보이지 않나요?</strong><p>새 기수 일정은 클래스 목록과 메인 화면에 공개됩니다.</p></div>
    </div></section>
  </main>;
}
