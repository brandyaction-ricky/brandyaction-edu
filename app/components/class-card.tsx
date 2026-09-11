import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ClassItem } from "../data";
import { canOptimizePublicImage } from "@/lib/public-image";

export function ClassCard({ item }: { item: ClassItem }) {
  const digital = item.productKind === "digital";
  const free = item.programType === "free";
  const kind = digital ? "디지털 상품" : free ? "무료 클래스" : "유료 클래스";
  return <Link className="ba-course-card" href={`/classes/${item.slug}`} aria-label={`${item.title} 상세 보기`}>
    <div className={`ba-cover ${digital ? "sand" : free ? "red" : "dark"} ${item.thumbnailUrl ? "with-image" : ""}`}>
      {item.thumbnailUrl ? <Image src={item.thumbnailUrl} alt={item.title} fill unoptimized={!canOptimizePublicImage(item.thumbnailUrl)} sizes="(max-width: 680px) 100vw, (max-width: 1024px) 50vw, 400px"/> : <><span className="ba-eyebrow">{digital ? "WORK TOOLKIT / DIGITAL" : free ? "FREE CLASS" : "LEARN TO ACT / CLASS"}</span><strong>{item.title}</strong><span className="ba-cover-foot">BRANDYACTION EDU <ArrowRight/></span></>}
    </div>
    <div className="ba-card-body"><div className="ba-badges"><span className={`ba-badge ${free ? "red" : ""}`}>{kind}</span><span className="ba-badge">{item.status}</span></div><h3>{item.title}</h3><p>{digital ? item.summary : `${item.startDate} · ${item.duration}`}</p><div className="ba-card-price"><strong>{free ? "무료" : item.price}</strong><span>{item.applicationOpen ? "신청 가능" : item.status}</span><ArrowRight/></div></div>
  </Link>;
}
