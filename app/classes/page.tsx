import { SlidersHorizontal } from "lucide-react";
import { BrandHeader } from "../components/brand-header";
import { ClassCard } from "../components/class-card";
import { getPublishedClasses } from "@/lib/education-data";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const classes = await getPublishedClasses();
  return <main><BrandHeader />
    <section className="sub-hero"><div className="container"><span className="section-kicker">ALL PROGRAMS</span><h1>배우고 끝나지 않는<br />실전 클래스</h1><p>정해진 일정, 동료와의 실행, 구체적인 결과물로<br />사업의 다음 변화를 만듭니다.</p></div></section>
    <section className="section catalog-section"><div className="container">
      <div className="catalog-toolbar"><div className="filter-chips"><button className="active">전체</button><button>모집 중</button><button>모집 예정</button><button>마감</button></div><button className="sort-button"><SlidersHorizontal size={16}/> 최신 기수순</button></div>
      <div className="class-grid">{classes.map(item => <ClassCard key={item.slug} item={item} />)}</div>
      <div className="catalog-note"><strong>이번 기수 일정이 맞지 않나요?</strong><p>다음 기수 모집 소식을 가장 먼저 받아보세요.</p><button className="button button-dark">다음 기수 알림 받기</button></div>
    </div></section>
  </main>;
}
