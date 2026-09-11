import Link from "next/link";
import { BrandHeader } from "../components/brand-header";
import { ReviewSlider } from "../components/site-live-content";
import { getPublishedReviewVideos, getPublishedReviews } from "@/lib/education-data";

export const revalidate = 60;
export default async function StoriesPage() {
  const [videos, reviews] = await Promise.all([getPublishedReviewVideos(), getPublishedReviews()]);
  return <main><BrandHeader/><div className="container"><header className="ba-page-head"><span className="ba-eyebrow">LEARNING IN PRACTICE</span><h1>배움이 내 일에 닿은 순간</h1><p>실행한 과정과 변화를, 먼저 경험한 사람들의 이야기로 만나보세요.</p></header>{videos.length > 0 && <section className="ba-section"><ReviewSlider videos={videos}/></section>}<section className="ba-section"><div className="ba-editorial-grid">{reviews.map(review => <article className="ba-story-card" key={review.id}><span className="ba-badge">{review.className}</span><blockquote>{review.quote}</blockquote><p>{review.name} · {review.cohortName}</p><span aria-label={`5점 만점에 ${review.rating}점`}>{"★".repeat(Math.round(review.rating))}</span></article>)}</div>{!videos.length && !reviews.length && <div className="ba-empty"><h2>이야기를 준비하고 있습니다.</h2><p>공개 승인된 수강 후기가 이곳에 표시됩니다.</p><Link className="ba-button" href="/classes">클래스 살펴보기</Link></div>}</section></div></main>;
}
