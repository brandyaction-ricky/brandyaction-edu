import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, Play, Target } from "lucide-react";
import { BrandHeader } from "./components/brand-header";
import { HomeExperience } from "./components/home-experience";
import { LandingBanner, ReviewSlider } from "./components/site-live-content";
import { getPublicBanner, getPublishedClasses, getPublishedReviews, getPublishedReviewVideos } from "@/lib/education-data";
import { getPublicArticleIndex } from "@/lib/article-data";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [classes,banner,reviews,reviewVideos,articleIndex,user] = await Promise.all([getPublishedClasses(),getPublicBanner(),getPublishedReviews(),getPublishedReviewVideos(),getPublicArticleIndex(),getAuthenticatedUser()]);
  const featured = classes[0];
  let currentEnrollment: { courseTitle: string; cohortName: string } | null = null;
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase.from("enrollments").select("courses(title),cohorts(name)").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const course = Array.isArray(data?.courses) ? data.courses[0] : data?.courses;
    const cohort = Array.isArray(data?.cohorts) ? data.cohorts[0] : data?.cohorts;
    if (course?.title) currentEnrollment = { courseTitle: course.title, cohortName: cohort?.name || "수강 중" };
  }
  const topArticles = articleIndex.articles.slice(0, 3);
  const nextClass = classes.find((item) => item.status.includes("모집 중"));
  return (
    <main>
      <BrandHeader />

      <section className="home-primary-banner" id="live-classes"><div className="container"><LandingBanner banner={banner}/></div></section>

      <section className="section" id="programs" data-home-reveal>
        <div className="container">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">FREE · PAID CLASS</span><h2>내 사업의 매출 단계에 맞춰 시작하세요</h2><p>무료 클래스에서 마케팅 병목을 찾고, 유료 라이브 클래스에서 AI를 활용한 실행 결과물을 완성합니다.</p></div>
            <Link className="text-link" href="/classes">전체 클래스 보기 <ArrowRight size={18} /></Link>
          </div>
          <div className="landing-free-program-list"><article className="free-program-card"><div><span>FREE CLASS</span><b>무료 3강</b></div><small>광고비를 늘리기 전, 매출 구조부터 점검</small><h3>사업자를 위한<br/>마케팅·AI 매출 진단</h3><p>고객 유입부터 콘텐츠, 전환, 재구매까지 지금 막힌 지점을 3개의 강의로 빠르게 찾습니다.</p><ul><li><CheckCircle2/>회원가입 후 바로 시청</li><li><CheckCircle2/>별도 결제 없이 3강 전체 공개</li><li><CheckCircle2/>실무 블로그와 함께 바로 적용</li></ul><Link href="/articles#free-class">무료 클래스 신청하기 <ArrowRight/></Link></article></div>
        </div>
      </section>

      {user && <section className="member-next-step section" data-home-reveal><div className="container"><div><span className="section-kicker">MY LEARNING PATH</span><h2>{currentEnrollment ? "지금 수강 중인 흐름을\n다음 클래스로 이어가세요." : "내 클래스에서 학습 현황을\n바로 확인하세요."}</h2><p>{currentEnrollment ? `${currentEnrollment.courseTitle} · ${currentEnrollment.cohortName} 수강 중` : "수강권과 다음 라이브 일정을 한곳에서 확인할 수 있습니다."}</p><Link href="/my">마이페이지에서 확인 <ArrowRight/></Link></div>{nextClass && <article><span>{nextClass.status}</span><small>NEXT RECOMMENDED CLASS</small><h3>{nextClass.title}</h3><p>{nextClass.startDate} 개강 · {nextClass.schedule}</p><strong>{nextClass.price}</strong><Link href={`/classes/${nextClass.slug}`}>다음 기수 예약하기 <ArrowRight/></Link></article>}</div></section>}

      <section className="landing-article-section section" data-home-reveal><div className="container"><div className="section-heading split-heading"><div><span className="section-kicker">TOP REVENUE QUESTIONS</span><h2>사업자들이 가장 많이 막히는 매출 문제부터</h2><p>광고·콘텐츠·AI·CRM 중 내 사업의 병목과 가까운 글에서 실행 방법을 확인하세요.</p></div><Link className="text-link" href="/articles">모든 실무 글 보기 <ArrowRight/></Link></div><div className="landing-article-grid">{topArticles.map((article, index) => <article key={article.id}><Link href={`/articles/${article.slug}`}><span>{article.categoryName}</span><b>{String(index + 1).padStart(2,"0")}</b><h3>{article.title}</h3><p>{article.summary}</p><footer>실행 방법 확인하기 <ArrowRight/></footer></Link></article>)}</div><div className="landing-free-bridge"><div><span>무료 3강</span><strong>블로그에서 찾은 매출 문제를<br/>내 사업의 실행안으로 바꾸세요.</strong></div><p>회원가입만 하면 사업자 마케팅·AI 무료 3강을 바로 볼 수 있습니다.</p><Link href="/articles#free-class">무료 3강 보기 <ArrowRight/></Link></div></div></section>

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
          <div className="section-heading centered"><span className="section-kicker">HOW IT WORKS</span><h2>신청부터 완주까지, 한 흐름으로</h2><p>결제 후 별도 안내를 기다릴 필요 없이 내 클래스에서 모든 일정을 확인합니다.</p></div>
          <div className="process-grid">
            <article><span className="process-icon"><Target /></span><strong>01</strong><h3>클래스 선택</h3><p>일정과 커리큘럼을 확인하고 원하는 기수를 신청합니다.</p></article>
            <article><span className="process-icon"><CalendarDays /></span><strong>02</strong><h3>기수 자동 배정</h3><p>결제가 완료되면 내 클래스에 일정과 준비물이 열립니다.</p></article>
            <article><span className="process-icon"><Play /></span><strong>03</strong><h3>라이브 참여</h3><p>수업 당일 활성화된 버튼으로 라이브 클래스에 입장합니다.</p></article>
            <article><span className="process-icon"><BarChart3 /></span><strong>04</strong><h3>실행·완주</h3><p>자료와 다시보기를 활용해 과제를 완성하고 변화를 기록합니다.</p></article>
          </div>
        </div>
      </section>

      <section className="section review-section" id="reviews" data-home-reveal>
        <div className="container"><ReviewSlider reviews={reviews} videos={reviewVideos}/></div>
      </section>

      <section className="final-cta" data-home-reveal>
        <div className="container cta-inner"><div><span>{featured?.status || "다음 기수 준비 중"}</span><h2>배운 것을 실행으로 바꾸는<br />다음 클래스에 참여하세요.</h2></div><div><strong>{featured?.seats || "일정 확인"}</strong><Link className="button button-white button-lg" href={featured ? `/classes/${featured.slug}` : "/classes"}>클래스 확인하기 <ArrowRight size={20} /></Link></div></div>
      </section>
      <HomeExperience title={featured?.title} status={featured?.status} schedule={`${featured?.startDate || ""}${featured?.schedule ? ` · ${featured.schedule}` : ""}`} href={featured ? `/classes/${featured.slug}` : undefined}/>
    </main>
  );
}
