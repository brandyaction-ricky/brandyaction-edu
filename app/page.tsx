import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, Play, Target } from "lucide-react";
import { BrandHeader } from "./components/brand-header";
import { HomeExperience } from "./components/home-experience";
import { LandingBanner, ReviewSlider } from "./components/site-live-content";
import { ClassCatalog } from "./components/class-catalog";
import { getPublicBanners, getPublishedClasses, getPublishedReviews, getPublishedReviewVideos } from "@/lib/education-data";
import { getPublicArticleIndex } from "@/lib/article-data";
import { articleReadingMinutes } from "@/lib/articles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [classes,banners,reviews,reviewVideos,articleIndex] = await Promise.all([getPublishedClasses(),getPublicBanners(),getPublishedReviews(),getPublishedReviewVideos(),getPublicArticleIndex()]);
  const recruitingPaid = classes.find((item) => item.programType === "paid" && item.status.includes("모집 중"));
  const topArticles = articleIndex.articles.slice(0, 3);
  return (
    <main>
      <BrandHeader />

      <section className="home-primary-banner" id="live-classes"><div className="container"><LandingBanner banners={banners}/></div></section>

      <section className="section home-program-catalog" id="programs" data-home-reveal>
        <div className="container">
          <ClassCatalog classes={classes}/>
        </div>
      </section>

      <section className="landing-article-section section" data-home-reveal><div className="container"><div className="section-heading split-heading"><div><span className="section-kicker">BUSINESS GROWTH INSIGHTS</span><h2>매출이 막힌 이유를 발견하면,<br/>다음 실행이 선명해집니다</h2><p>광고비를 더 쓰기 전에 사업자들이 실제로 놓치는 유입·콘텐츠·전환·AI 활용 지점을 확인하세요.</p></div><Link className="text-link" href="/articles">실무 인사이트 전체보기 <ArrowRight/></Link></div><div className="landing-article-grid">{topArticles.map((article, index) => <article className={index === 0 ? "featured-insight" : ""} key={article.id}><Link href={`/articles/${article.slug}`}><div className="insight-card-meta"><span>{article.categoryName}</span><em>{article.contentType === "youtube" ? "영상 인사이트" : `${articleReadingMinutes(article.blocks)}분 인사이트`}</em></div><b>INSIGHT {String(index + 1).padStart(2,"0")}</b><h3>{article.title}</h3><p><strong>이 콘텐츠에서 얻는 것</strong>{article.summary}</p><footer>핵심 인사이트 확인하기 <ArrowRight/></footer></Link></article>)}</div><div className="landing-free-bridge"><div><span>무료 3강</span><strong>인사이트를 읽는 데서 멈추지 말고<br/>내 사업의 실행안으로 바꾸세요.</strong></div><p>회원가입만 하면 사업자 마케팅·AI 무료 3강을 바로 볼 수 있습니다.</p><Link href="/articles#free-class">무료 클래스 보기 <ArrowRight/></Link></div></div></section>

      <section className="section section-ink" id="philosophy" data-home-reveal>
        <div className="container philosophy-grid">
          <div>
            <span className="section-kicker inverse">WHY BRANDYACTION EDU</span>
            <h2>아는 것보다,<br />실행해 결과를 만드는 교육</h2>
          </div>
          <div className="principle-list">
            <article><span>01</span><div><h3>현장에서 바로 쓰는 결과물</h3><p>매주 듣고 끝나는 강의가 아니라, 내 사업에 적용된 하나의 결과물을 완성합니다.</p></div></article>
            <article><span>02</span><div><h3>데이터로 확인하는 변화</h3><p>조회수보다 문의·방문·구매처럼 실제 사업 성과에 가까운 지표를 추적합니다.</p></div></article>
            <article><span>03</span><div><h3>기수와 함께하는 실행 리듬</h3><p>정해진 일정과 동료의 실행이 혼자서는 만들기 어려운 완주율을 만듭니다.</p></div></article>
          </div>
        </div>
      </section>

      <section className="section process-section" data-home-reveal>
        <div className="container">
          <div className="section-heading centered"><span className="section-kicker">WHY IT WORKS</span><h2>배우고 끝나지 않기 때문에,<br/>내 사업의 결과가 남습니다</h2><p>정답을 듣는 강의가 아니라 내 사업의 문제를 찾고, 실행하고, 데이터로 개선하는 과정입니다.</p></div>
          <div className="process-grid">
            <article><span className="process-icon"><Target /></span><strong>01</strong><h3>내 매출 병목부터 진단</h3><p>유입·콘텐츠·전환·재구매 중 지금 성장을 막는 한 지점을 먼저 찾습니다.</p></article>
            <article><span className="process-icon"><CalendarDays /></span><strong>02</strong><h3>내 사업의 실행안 설계</h3><p>일반적인 사례가 아니라 내 상품과 고객에 맞춘 문구·퍼널·AI 업무 흐름을 만듭니다.</p></article>
            <article><span className="process-icon"><Play /></span><strong>03</strong><h3>정해진 기수 안에서 실행</h3><p>라이브 일정과 과제로 미루지 않고 실제 고객에게 적용할 결과물까지 완성합니다.</p></article>
            <article><span className="process-icon"><BarChart3 /></span><strong>04</strong><h3>데이터와 피드백으로 개선</h3><p>느낌이 아니라 반응과 전환 데이터를 확인하고 다음 실행에서 성과를 높입니다.</p></article>
          </div>
        </div>
      </section>

      <section className="section review-section" id="reviews" data-home-reveal>
        <div className="container"><ReviewSlider reviews={reviews} videos={reviewVideos}/></div>
      </section>

      <section className="final-cta" data-home-reveal>
        <div className="container cta-inner"><div><span>FREE CLASS · 회원가입 후 바로 수강</span><h2>광고비를 더 쓰기 전에,<br />내 매출의 병목부터 확인하세요.</h2></div><div><strong>무료 3강 · 별도 결제 없음</strong><Link className="button button-white button-lg" href="/articles#free-class">무료 클래스 보기 <ArrowRight size={20} /></Link></div></div>
      </section>
      <HomeExperience title={recruitingPaid?.title} status={recruitingPaid?.status} price={recruitingPaid?.price} schedule={`${recruitingPaid?.startDate || ""}${recruitingPaid?.schedule ? ` · ${recruitingPaid.schedule}` : ""}`} href={recruitingPaid ? `/classes/${recruitingPaid.slug}` : undefined}/>
    </main>
  );
}
