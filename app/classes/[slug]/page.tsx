import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock3, Download, PlayCircle, Users } from "lucide-react";
import { BrandHeader } from "../../components/brand-header";
import { ClassApplicationCard } from "../../components/class-application-card";
import { DetailTabs } from "../../components/detail-tabs";
import { DetailImageStack } from "../../components/site-live-content";
import { getPublishedClass, getPublicCourseAppearance, getPublishedReviews } from "@/lib/education-data";
import { FreeClassDetail } from "../../components/free-class-detail";
import { DigitalProductDetail } from "../../components/digital-product-detail";
import "../../free-class.css";

export const revalidate = 60;
export const dynamic = "force-static";

export default async function ClassDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [item,appearance,reviews] = await Promise.all([getPublishedClass(slug),getPublicCourseAppearance(slug),getPublishedReviews(slug)]);
  if (!item) notFound();
  if (item.productKind === "digital") return <DigitalProductDetail item={item} appearance={appearance} reviews={reviews}/>;
  if (item.programType === "free" || item.price === "0원") return <FreeClassDetail item={item} appearance={appearance} reviews={reviews}/>;
  return <main><BrandHeader />
    <section className="detail-hero"><div className="container detail-hero-grid">
      <div className="detail-copy"><span className={`status-pill tone-${item.statusTone}`}>{item.status}</span><p className="detail-category">{item.category} · {item.duration}</p><h1>{item.title}</h1><p>{item.summary}</p>
        <div className="detail-facts"><span><CalendarDays/>운영 {item.operationPeriod || item.startDate}</span><span><Clock3/>{item.schedule}</span><span><Users/>{item.seats}</span></div>
      </div>
      <div className={`detail-art accent-${item.accent} ${item.thumbnailUrl ? "has-thumbnail" : ""}`} style={item.thumbnailUrl ? { backgroundImage: `url(${item.thumbnailUrl})` } : undefined}><span>BRANDYACTION<br/>LIVE CLASS</span><strong>01</strong><small>Instructor · {item.instructor}</small></div>
    </div></section>
    <DetailTabs />
    <section className="detail-content" id="overview"><div className="container detail-layout">
      <div className="detail-main">
        {item.curriculum?.some((week) => week.lessons.some((lesson) => lesson.accessMode === "member")) && <section className="content-block"><span className="section-kicker">FREE RESOURCES</span><h2>가입하고 무료 콘텐츠 받기</h2><p>클래스에서 제공하는 회원 무료 영상·자료를 먼저 확인해 보세요.</p><Link href={`/resources/${item.slug}`}>무료 콘텐츠 확인 →</Link></section>}
        <DetailImageStack images={appearance.images} pixels={appearance.pixels} courseTitle={item.title}/>
        <section className="content-block" id="curriculum"><span className="section-kicker">CURRICULUM</span><div className="block-title-row"><h2>{item.curriculum?.length || "단계별"}주 동안 완성하는<br />실전 커리큘럼</h2><p>매주 수업 직후 바로 적용할 수 있는<br />하나의 결과물을 완성합니다.</p></div>
          <div className="session-list">{item.curriculum?.length?item.curriculum.map((week,index)=><details key={week.id} open={index===0}><summary><span>WEEK {index+1}</span><div><strong>{week.title}</strong><small>{week.lessons.length}개 VOD·자료</small></div><em>{week.goal}</em><b>＋</b></summary><div className="session-body curriculum-public-lessons">{week.lessons.map(lesson=><p key={lesson.id}><strong>Day {lesson.day}</strong><span>{lesson.title}</span><small>{lesson.kind}{lesson.duration?` · ${lesson.duration}`:""}</small></p>)}</div></details>):<div className="detail-review-empty">커리큘럼이 준비 중입니다.</div>}</div>
        </section>
        <section className="content-block" id="live-schedule"><span className="section-kicker">LIVE SCHEDULE</span><div className="block-title-row"><h2>기수별 라이브<br/>회차 일정</h2><p>기수 운영 일정과 라이브 회차는<br/>공통 커리큘럼과 별도로 관리됩니다.</p></div><div className="session-list">{item.sessions.map((session,index)=><details key={session.title} open={index===0}><summary><span>LIVE {index+1}</span><div><strong>{session.title}</strong><small>{session.date}</small></div><em>{session.output}</em><b>＋</b></summary><div className="session-body"><p>{session.description}</p><span><Download size={15}/> 실습 워크북 제공</span></div></details>)}</div></section>
        <section className="content-block benefit-block" id="benefit"><span className="section-kicker">INCLUDED</span><h2>수강생에게 제공되는 것</h2><div className="benefit-grid"><article><PlayCircle/><strong>{item.sessions.length ? `${item.sessions.length}회 라이브 수업` : "라이브 수업"}</strong><p>기수 일정에 맞춘 실시간 피드백</p></article><article><Download/><strong>공통 VOD·실전 자료</strong><p>결제 후 내 클래스에서 제공</p></article><article><Clock3/><strong>라이브 다시보기</strong><p>운영자가 등록한 회차별 녹화본</p></article><article><Users/><strong>기수별 실행 과정</strong><p>과제와 결과물을 만드는 커리큘럼</p></article></div></section>
        <section className="content-block reviews-block" id="review"><span className="section-kicker">REVIEWS</span><div className="block-title-row"><h2>먼저 실행한 사람들의<br />변화</h2>{reviews.length>0&&<strong className="review-score">{(reviews.reduce((sum,review)=>sum+review.rating,0)/reviews.length).toFixed(1)} <small>/ 5.0</small></strong>}</div>{reviews.length?<div className="detail-review-list">{reviews.slice(0,3).map(review=><article className="review-card" key={review.id}><div className="stars">{"★".repeat(Math.round(review.rating))}</div><p>{review.quote}</p><footer><strong>{review.name}</strong><span>{review.cohortName}</span></footer></article>)}</div>:<div className="detail-review-empty">아직 공개된 수강 후기가 없습니다.</div>}</section>
        <section className="content-block faq-block" id="faq"><span className="section-kicker">FAQ</span><h2>자주 묻는 질문</h2>{["라이브에 참여하지 못하면 어떻게 되나요?","과제를 꼭 제출해야 하나요?","수강 기간은 어떻게 되나요?","환불은 언제까지 가능한가요?"].map((q,i)=><details key={q}><summary><span>0{i+1}</span>{q}<b>＋</b></summary><p>{i===0?"각 회차 종료 후 24시간 이내에 다시보기가 업로드되며, 기간 제한 없이 볼 수 있습니다.":i===2?"공통 VOD·자료와 라이브 녹화본은 결제한 계정에서 기간 제한 없이 이용할 수 있습니다.":i===3?"환불 신청 후 운영자가 VOD 진도와 참여 회차를 확인해 승인하며, 완료 즉시 모든 수강 권한이 종료됩니다.":"상세 운영 기준은 신청 완료 후 기수 홈에서 확인할 수 있습니다."}</p></details>)}</section>
      </div>
      <ClassApplicationCard item={item}/>
    </div></section>
  </main>;
}
