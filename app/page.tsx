import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  Play,
  Target,
} from "lucide-react";
import { BrandHeader } from "./components/brand-header";
import { ClassCard } from "./components/class-card";
import { HomeExperience } from "./components/home-experience";
import { LandingBanner, ReviewSlider } from "./components/site-live-content";
import { getPublicBanner, getPublishedClasses } from "@/lib/education-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [classes,banner] = await Promise.all([getPublishedClasses(),getPublicBanner()]);
  const featured = classes[0];
  return (
    <main>
      <BrandHeader />

      <section className="hero-shell">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span />{featured?.status || "모집 예정"}</div>
            <h1>{featured?.title || "브랜디액션 실전 클래스"}</h1>
            <p className="hero-description">
              {featured?.summary || "배운 것을 현장의 실행과 결과로 연결합니다."}
            </p>
            <div className="hero-meta">
              <span><CalendarDays size={19} /> {featured?.startDate || "개강 일정 안내 예정"}</span>
              <span><Clock3 size={19} /> {featured?.schedule || "수업 일정 안내 예정"}</span>
              <strong>LIVE</strong>
            </div>
            <div className="hero-actions">
              <Link className="button button-primary button-lg" href={`/classes/${featured?.slug || "local-marketing"}`}>
                클래스 확인하기 <ArrowRight size={20} />
              </Link>
              <Link className="text-link" href="#programs">커리큘럼 먼저 보기 <ChevronRight size={17} /></Link>
            </div>
          </div>

          <LandingBanner banner={banner}/>
        </div>
      </section>

      <section className="proof-strip" data-home-reveal>
        <div className="container proof-grid">
          <div className="proof-title">실행을 확인하는 핵심 지표</div>
          <div><span>수강생 평균 매출 성장</span><strong>+127%</strong></div>
          <div><span>광고 ROAS 개선</span><strong>+184%</strong></div>
          <div><span>평균 문의 증가</span><strong>+2.6배</strong></div>
          <div><span>재수강 의향</span><strong>98%</strong></div>
        </div>
      </section>

      <section className="section" id="programs" data-home-reveal>
        <div className="container">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">LIVE PROGRAM</span><h2>지금 참여할 수 있는 클래스</h2></div>
            <Link className="text-link" href="/classes">전체 클래스 보기 <ArrowRight size={18} /></Link>
          </div>
          <div className="class-grid single-class-grid">
            {classes.map((item) => <ClassCard key={item.slug} item={item} />)}
          </div>
        </div>
      </section>

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
        <div className="container"><ReviewSlider /></div>
      </section>

      <section className="final-cta" data-home-reveal>
        <div className="container cta-inner"><div><span>{featured?.status || "다음 기수 준비 중"}</span><h2>배운 것을 실행으로 바꾸는<br />다음 클래스에 참여하세요.</h2></div><div><strong>{featured?.seats || "일정 확인"}</strong><Link className="button button-white button-lg" href={`/classes/${featured?.slug || "local-marketing"}`}>클래스 확인하기 <ArrowRight size={20} /></Link></div></div>
      </section>
      <HomeExperience />
    </main>
  );
}
