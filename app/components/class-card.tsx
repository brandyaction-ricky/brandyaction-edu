import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3 } from "lucide-react";
import type { ClassItem } from "../data";

export function ClassCard({ item }: { item: ClassItem }) {
  return <article className={`class-card accent-${item.accent}`}>
    <div className={`card-visual ${item.thumbnailUrl ? "has-thumbnail" : ""}`} style={item.thumbnailUrl ? { backgroundImage: `url(${item.thumbnailUrl})` } : undefined}>
      <span className={`status-pill tone-${item.statusTone}`}>{item.status}</span>
      <span className="card-index">LIVE<br />PROGRAM</span>
      <span className="card-number">BA</span>
    </div>
    <div className="card-body">
      <div className="card-meta"><span>{item.category}</span><span>강사 {item.instructor}</span></div>
      <h3>{item.title}</h3><p>{item.summary}</p>
      <div className="card-schedule"><span><CalendarDays size={16} /> {item.operationPeriod || item.startDate}</span><span><Clock3 size={16} /> {item.duration}</span></div>
      <div className="card-bottom"><div><small>수강료</small><strong>{item.price}</strong></div><Link href={`/classes/${item.slug}`} aria-label={`${item.title} 상세 보기`}><ArrowUpRight /></Link></div>
    </div>
  </article>;
}
