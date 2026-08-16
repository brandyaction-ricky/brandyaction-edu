import { BrandHeader } from "../components/brand-header";
import { ClassCatalog } from "../components/class-catalog";
import { getPublishedClasses } from "@/lib/education-data";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const classes = await getPublishedClasses();
  return <main><BrandHeader />
    <section className="sub-hero"><div className="container"><span className="section-kicker">FREE · PAID PROGRAMS</span><h1>사업자의 매출을 만드는<br />마케팅·AI 클래스</h1><p>무료 클래스에서 문제를 진단하고, 모집 중인 유료 라이브 클래스에서<br />내 사업에 적용할 실행 결과물을 완성합니다.</p></div></section>
    <section className="section catalog-section"><div className="container">
      <ClassCatalog classes={classes}/>
    </div></section>
  </main>;
}
