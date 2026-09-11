import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandHeader } from "./components/brand-header";
import { ClassCard } from "./components/class-card";
import { LandingBanner, ReviewSlider } from "./components/site-live-content";
import { getPublicBanners, getPublishedClasses, getPublishedReviewVideos } from "@/lib/education-data";
import { getPublicArticleIndex } from "@/lib/article-data";

export const revalidate = 60;

export default async function Home() {
  const [classes, banners, reviewVideos, articleIndex] = await Promise.all([getPublishedClasses(), getPublicBanners(), getPublishedReviewVideos(), getPublicArticleIndex()]);
  const free = classes.find(item => item.programType === "free" && item.applicationOpen) || classes.find(item => item.programType === "free");
  const freeHref = free ? `/classes/${free.slug}` : "/classes";
  const featured = classes.filter(item => item.applicationOpen).slice(0, 3);
  const displayClasses = featured.length ? featured : classes.slice(0, 3);
  const topArticles = [...articleIndex.articles].sort((a,b) => (a.landingFeaturedRank || 999) - (b.landingFeaturedRank || 999)).slice(0,3);
  return <main className="ba-marketing"><BrandHeader/>
    <section className="ba-hero"><div className="container"><div className="ba-hero-grid">
      <div className="ba-hero-copy"><span className="ba-eyebrow">BRANDYACTION EDU · LEARN TO ACT</span><h1>배운 것을,<br/><em>내 일의 성과로.</em></h1><p>AI와 마케팅을 아는 것에서 끝내지 마세요.<br/>내 업무에 적용하고, 실행한 결과를 남기는 교육.</p><div className="ba-hero-actions"><Link href={freeHref} className="ba-button primary">무료 클래스부터 시작하기 <ArrowRight/></Link><Link href="/classes" className="ba-text-link">전체 클래스 보기 <ArrowRight/></Link></div><small>실행 중심 클래스 · 미션과 피드백으로 쌓는 변화</small></div>
      <Link className="ba-featured-offer" href={freeHref}><div className="ba-offer-top"><span className="ba-eyebrow">YOUR FIRST ACTION</span><span className="ba-offer-status">{free?.status || "다음 클래스 준비 중"}</span></div><div className="ba-offer-content"><span>01 / 내 업무를 바꾸는 첫 클래스</span><h2>{free?.title || "배움에서 실행으로,\n첫걸음을 함께."}</h2><p>{free?.summary || "새로운 교육과 자료를 준비하고 있습니다. 전체 클래스에서 공개된 과정을 확인해 보세요."}</p></div>{free && <dl className="ba-offer-spec"><div><dt>일정</dt><dd>{free.startDate}</dd></div><div><dt>진행</dt><dd>{free.schedule}</dd></div><div><dt>참가비</dt><dd>무료</dd></div></dl>}<div className="ba-offer-bottom"><span>클래스 자세히 보기</span><ArrowRight/></div></Link>
    </div><div className="ba-hero-bottom"><span>지식을 넘어, 실행이 남는 학습.</span><span>LEARN. APPLY. REPEAT.</span></div></div></section>
    <div className="container">
      {banners.length > 0 && <section className="ba-campaign" aria-label="클래스 소식"><LandingBanner banners={banners}/></section>}
      <section className="ba-section" id="programs"><div className="ba-section-head"><div><span className="ba-eyebrow">01 / NEXT PROGRAM</span><h2>지금 참여할 수 있는 클래스</h2><p>시작의 크기는 달라도, 목표는 실제 업무의 변화입니다.</p></div><Link href="/classes" className="ba-text-link">모든 클래스 <ArrowRight/></Link></div>{displayClasses.length ? <div className="ba-course-grid">{displayClasses.map(item => <ClassCard item={item} key={item.slug}/>)}</div> : <div className="ba-empty"><h3>새로운 클래스를 준비하고 있습니다.</h3><p>공개되면 모집 일정과 함께 안내하겠습니다.</p></div>}</section>
      <section className="ba-execution" id="philosophy"><div><span className="ba-eyebrow">02 / THE WAY WE LEARN</span><h2>시청에서 멈추지 않는<br/>학습의 구조.</h2><p>강의마다 다음 행동이 있습니다.<br/>작게 적용하고, 기록하고, 다시 개선합니다.</p><Link href="/my" className="ba-text-link">나의 학습으로 <ArrowRight/></Link></div><ol>{[["내 문제로 배웁니다","지금 내 업무에서 해결할 문제를 정하고 필요한 개념을 배웁니다."],["미션으로 실행합니다","배운 내용을 적용한 과정과 결과물을 남깁니다."],["피드백으로 다음을 만듭니다","잘된 점과 보완할 점을 확인하고, 다음 실행으로 이어갑니다."]].map(([title,copy],index) => <li key={title}><span>0{index+1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol></section>
      {topArticles.length > 0 && <section className="ba-section"><div className="ba-section-head"><div><span className="ba-eyebrow">03 / INSIGHT TO ACTION</span><h2>일하는 방식을 바꾸는 인사이트</h2><p>내 업무에 가져갈 수 있는 구체적인 관점과 방법.</p></div><Link href="/articles" className="ba-text-link">아티클 전체 보기 <ArrowRight/></Link></div><div className="ba-editorial-grid">{topArticles.map(article => <Link className="ba-editorial-card" key={article.id} href={`/articles/${article.slug}`}><span className="ba-badge">{article.categoryName}</span><h3>{article.title}</h3><p>{article.summary}</p><span className="ba-text-link">인사이트 읽기 <ArrowRight/></span></Link>)}</div></section>}
      {reviewVideos.length > 0 && <section className="ba-section" id="reviews"><div className="ba-section-head"><div><span className="ba-eyebrow">04 / LEARNING IN PRACTICE</span><h2>실행한 과정이, 다음 사람의 시작으로.</h2></div><Link className="ba-text-link" href="/stories">고객 이야기 <ArrowRight/></Link></div><ReviewSlider videos={reviewVideos}/></section>}
    </div><section className="ba-final-offer"><div className="container"><div><span className="ba-eyebrow">YOUR NEXT ACTION</span><h2>첫 실행은, 무료 클래스에서.</h2><p>내 업무 한 가지를 떠올리고 시작해 보세요.</p></div><Link href={freeHref} className="ba-button primary">무료 클래스 살펴보기 <ArrowRight/></Link></div></section>
  </main>;
}
