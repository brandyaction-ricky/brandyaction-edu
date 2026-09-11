import Image from "next/image";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import type { ClassItem } from "@/app/data";
import type { getPublicCourseAppearance, getPublishedReviews } from "@/lib/education-data";
import { canOptimizePublicImage } from "@/lib/public-image";
import { BrandHeader } from "./brand-header";
import { ClassApplicationCard } from "./class-application-card";
import { DetailImageStack } from "./site-live-content";

export function DigitalProductDetail({item,appearance,reviews}:{item:ClassItem;appearance:Awaited<ReturnType<typeof getPublicCourseAppearance>>;reviews:Awaited<ReturnType<typeof getPublishedReviews>>}) {
  const contents = (item.curriculum || []).flatMap(week => week.lessons);
  return <main><BrandHeader/><section className="detail-hero"><div className="container detail-hero-grid"><div className="detail-copy"><span className="ba-badge">디지털 상품</span><h1>{item.title}</h1><p>{item.summary}</p><div className="ba-badges"><span className="ba-badge">{contents.length}개 콘텐츠</span><span className="ba-badge">{item.status}</span></div></div><div className="ba-digital-preview">{item.thumbnailUrl ? <Image src={item.thumbnailUrl} alt={item.title} fill unoptimized={!canOptimizePublicImage(item.thumbnailUrl)} sizes="(max-width: 1024px) 100vw, 50vw"/> : <><FileText size={48}/><span>WORK TOOLKIT / DIGITAL</span><strong>{item.title}</strong></>}</div></div></section>
    <section className="detail-content"><div className="container detail-layout"><div className="detail-main">{appearance.images.length > 0 && <DetailImageStack images={appearance.images} pixels={appearance.pixels} courseTitle={item.title}/>}
      <section className="content-block"><span className="ba-eyebrow">CONTENTS</span><h2>업무에 바로 꺼내 쓰는 자료</h2><p>{item.summary}</p><div className="ba-digital-contents">{contents.length ? contents.map(lesson=><article key={lesson.id}><FileText size={20}/><div><strong>{lesson.resourceName || lesson.title}</strong><p>{lesson.description}</p><span>{lesson.kind} {lesson.duration}</span></div><span className="ba-badge">{lesson.accessMode === "member" ? "회원 공개" : "구매 후 이용"}</span></article>) : <p>구성 자료를 준비 중입니다.</p>}</div>{contents.some(lesson=>lesson.accessMode==="member") && <Link className="ba-button" href={`/resources/${item.slug}`}>무료 공개 콘텐츠 보기</Link>}</section>
      <section className="content-block"><span className="ba-eyebrow">HOW TO USE</span><h2>구매부터 활용까지</h2><ol className="ba-digital-guide"><li>로그인한 계정으로 상품을 신청합니다.</li><li>결제 완료 후 내 클래스와 내 자료실에서 콘텐츠를 확인합니다.</li><li>수강권과 공개 상태 확인 후 등록된 자료를 다운로드합니다.</li></ol><Link className="ba-text-link" href="/my/resources"><Download size={18}/>내 자료실</Link></section>
      <section className="content-block" id="review"><span className="ba-eyebrow">REVIEWS</span><h2>상품 후기</h2>{reviews.length ? <div className="detail-review-list">{reviews.slice(0,3).map(review=><article className="review-card" key={review.id}><div className="stars">{"★".repeat(Math.round(review.rating))}</div><p>{review.quote}</p><footer><strong>{review.name}</strong><span>{review.cohortName}</span></footer></article>)}</div> : <p>아직 공개된 상품 후기가 없습니다.</p>}</section>
      <section className="content-block"><h2>이용 안내</h2><p>자료의 제공 범위와 이용 기간은 상품 안내 및 발급된 이용 권한을 따릅니다.</p><Link className="ba-text-link" href="/policies/refund">취소·환불 규정 확인</Link></section>
    </div><ClassApplicationCard item={item}/></div></section></main>;
}
