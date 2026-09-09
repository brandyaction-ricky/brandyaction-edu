import Image from "next/image";
import type { ClassItem } from "@/app/data";
import { ClassApplicationCard } from "./class-application-card";
import { ClassResourceDownloads } from "./class-resource-downloads";
import { getPublicCourseAppearance, getPublishedReviews } from "@/lib/education-data";
import { DetailImageStack } from "./site-live-content";
import { DetailTabs } from "./detail-tabs";

export function FreeClassDetail({ item, appearance, reviews }: { item: ClassItem; appearance: Awaited<ReturnType<typeof getPublicCourseAppearance>>; reviews: Awaited<ReturnType<typeof getPublishedReviews>> }) {
  const resources = (item.curriculum || []).flatMap((week) => week.lessons.filter((lesson) => lesson.kind === "자료"));
  const checkoutHref = `/checkout?course=${encodeURIComponent(item.slug)}${item.cohortId ? `&cohort=${encodeURIComponent(item.cohortId)}` : ""}`;
  return <main className="free-class-detail"><header className="free-class-brand"><Image src="/brandy-action-logo.png" alt="Brandy Action EDU" width={156} height={40}/><span>무료 클래스</span></header><div className="free-class-layout"><div className="free-class-main">
    <section className="free-class-hero" id="overview">{item.thumbnailUrl && <div className="free-class-thumbnail"><Image src={item.thumbnailUrl} alt={item.title} fill sizes="(max-width: 900px) 100vw, 820px" priority/></div>}<span className="free-class-label">무료 클래스 · {item.category}</span><h1>{item.title}</h1><p>{item.summary}</p>{reviews.length > 0 && <span className="free-class-rating">★ {(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)} <small>후기 {reviews.length}개</small></span>}</section>
    <div className="free-class-detail-body"><DetailTabs resources={resources.length > 0} compact/><section className="free-class-section"><h2>클래스 소개</h2><DetailImageStack images={appearance.images} pixels={appearance.pixels} courseTitle={item.title}/>{!appearance.images.length && <p>{item.summary}</p>}</section>
    <section className="free-class-section" id="curriculum"><div className="free-section-title"><h2>콘텐츠</h2><span>{(item.curriculum || []).reduce((sum, week) => sum + week.lessons.length, 0)}개</span></div><div className="free-class-contents">{item.curriculum?.map((week, index) => <details key={week.id} open={index === 0}><summary><strong>{week.title}</strong><span>⌄</span></summary><ul>{week.lessons.map((lesson) => <li key={lesson.id}><span className="free-content-kind">{lesson.kind === "자료" ? "자료" : lesson.kind}</span><span>{lesson.title}</span><small>{lesson.duration}</small>{lesson.kind === "자료" && <a href="#free-resources" aria-label={`${lesson.title} 자료 받기`}>자료 받기</a>}</li>)}</ul></details>)}{!item.curriculum?.length && <p className="free-resource-help">콘텐츠를 준비 중입니다.</p>}</div></section>
    {resources.length > 0 && <ClassResourceDownloads resources={resources} checkoutHref={checkoutHref}/>}
    <section className="free-class-section" id="benefit"><h2>수강 혜택</h2><div className="free-benefit-grid"><div><strong>무료 수강</strong><p>{item.duration}</p></div><div><strong>{resources.length ? `실습 자료 ${resources.length}개` : "학습 콘텐츠"}</strong><p>{resources.length ? "이 페이지에서 바로 다운로드" : "신청 후 내 클래스에서 이용"}</p></div></div></section>
    <section className="free-class-section" id="review"><h2>수강 후기</h2>{reviews.length ? reviews.slice(0, 5).map((review) => <article className="free-class-review" key={review.id}><strong>{review.name}</strong><span>{"★".repeat(Math.round(review.rating))}</span><p>{review.quote}</p><small>{review.cohortName}</small></article>) : <p className="free-resource-help">아직 등록된 수강 후기가 없습니다.</p>}</section>
    <section className="free-class-section" id="faq"><h2>자주 묻는 질문</h2><details><summary>무료로 수강할 수 있나요?</summary><p>수강료는 0원입니다. 신청 버튼을 눌러 로그인 후 신청을 완료해 주세요.</p></details><details><summary>자료는 어디서 받나요?</summary><p>이 페이지의 무료 자료에서 받을 수 있습니다. 회원 자료는 로그인 후, 수강생 자료는 무료 수강 신청 후 이용할 수 있습니다.</p></details><details><summary>영상과 라이브는 어디서 보나요?</summary><p>신청 후 내 클래스에서 등록된 학습 콘텐츠와 기수별 일정을 확인할 수 있습니다.</p></details></section></div>
    </div><ClassApplicationCard item={item}/></div></main>;
}
