import { BrandHeader } from "../components/brand-header";
import { ClassCatalog } from "../components/class-catalog";
import { getPublishedClasses } from "@/lib/education-data";

export const revalidate = 60;

export default async function ClassesPage() {
  const classes = await getPublishedClasses();
  return <main><BrandHeader />
    <section className="ba-page-head container"><span className="ba-eyebrow">YOUR NEXT ACTION</span><h1>내 일의 다음 단계를 찾아보세요.</h1><p>무료 클래스부터 실전 과정, 바로 사용하는 자료까지.</p></section>
    <section className="section catalog-section"><div className="container">
      <ClassCatalog classes={classes}/>
    </div></section>
  </main>;
}
