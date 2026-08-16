import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, LockKeyhole } from "lucide-react";
import type { ClassItem } from "../data";

export function ClassCard({ item, applicationOnlyWhenRecruiting = false }: { item: ClassItem; applicationOnlyWhenRecruiting?: boolean }) {
  const applicationOpen = item.status.includes("모집 중");
  const disabled = applicationOnlyWhenRecruiting && !applicationOpen;
  return <article className={`class-card accent-${item.accent}${disabled ? " class-card-disabled" : ""}`}>
    <div className={`card-visual ${item.thumbnailUrl ? "has-thumbnail" : ""}`} style={item.thumbnailUrl ? { backgroundImage: `url(${item.thumbnailUrl})` } : undefined}>
      <span className={`status-pill tone-${item.statusTone}`}>{item.status}</span>
      <span className="card-index">LIVE<br />PROGRAM</span>
      <span className="card-number">BA</span>
    </div>
    <div className="card-body">
      <div className="card-meta"><span>{item.category}</span><span>강사 {item.instructor}</span></div>
      <h3>{item.title}</h3><p>{item.summary}</p>
      <div className="card-schedule"><span><CalendarDays size={16} /> {item.operationPeriod || item.startDate}</span><span><Clock3 size={16} /> {item.duration}</span></div>
      <div className="card-bottom"><div><small>{disabled ? "신청 상태" : "수강료"}</small><strong>{disabled ? item.status : item.price}</strong></div>{disabled ? <span className="class-card-locked" aria-label={`${item.title} 신청 준비 중`}><LockKeyhole/></span> : <Link href={`/classes/${item.slug}`} aria-label={`${item.title} 신청하기`}><ArrowUpRight /></Link>}</div>
    </div>
  </article>;
}
