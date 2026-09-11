import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { canOptimizePublicImage } from "@/lib/public-image";
import type { ClassItem } from "@/app/data";
import { ClassResourceDownloads } from "./class-resource-downloads";
import { getPublicCourseAppearance, getPublishedReviews } from "@/lib/education-data";
import { DetailImageStack } from "./site-live-content";

export function FreeClassDetail({ item, appearance }: { item: ClassItem; appearance: Awaited<ReturnType<typeof getPublicCourseAppearance>>; reviews: Awaited<ReturnType<typeof getPublishedReviews>> }) {
  const resources = (item.curriculum || []).flatMap(week => week.lessons.filter(lesson => lesson.kind === "자료"));
  const checkoutHref = `/checkout?course=${encodeURIComponent(item.slug)}${item.cohortId ? `&cohort=${encodeURIComponent(item.cohortId)}` : ""}`;
  return <main className="free-class-detail">
    <header className="free-class-brand"><Image src="/brandy-action-logo.png" alt="Brandy Action EDU" width={156} height={40}/><span>무료 클래스</span></header>
    <div className="ba-free-sheet">
      {appearance.images.length ? <><h1 className="sr-only">{item.title} · 무료 클래스</h1><DetailImageStack images={appearance.images} pixels={appearance.pixels} courseTitle={item.title}/></> : <section className="ba-free-fallback"><span className="ba-eyebrow">FREE CLASS · LEARN TO ACT</span><h1>{item.title}</h1><p>{item.summary}</p>{item.thumbnailUrl && <Image src={item.thumbnailUrl} unoptimized={!canOptimizePublicImage(item.thumbnailUrl)} alt={item.title} width={880} height={550} sizes="(max-width: 880px) 100vw, 880px" style={{width:"100%",height:"auto"}} priority/>}</section>}
      {resources.length > 0 ? <ClassResourceDownloads resources={resources} checkoutHref={checkoutHref}/> : <section className="free-class-section"><h2>무료 자료 다운로드</h2><p className="free-resource-help">등록된 자료가 아직 없습니다. 자료가 공개되면 이곳에서 내려받을 수 있습니다.</p></section>}
    </div>
    <aside className="ba-bottom-cta" aria-label="무료 클래스 수강 신청"><div><div className="ba-cta-price"><strong>무료</strong><span>{item.status} · {item.duration}</span></div>{item.applicationOpen ? <Link className="ba-button primary" href={checkoutHref}>수강 신청하기 <ArrowRight/></Link> : <button className="ba-button primary" disabled>{item.status === "모집 마감" ? "모집 마감" : "모집 준비 중"}</button>}</div></aside>
  </main>;
}
