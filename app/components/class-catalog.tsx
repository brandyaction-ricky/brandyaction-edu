"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ClassItem } from "@/app/data";
import { ClassCard } from "./class-card";

const types = ["전체", "무료 클래스", "유료 클래스", "디지털 상품"] as const;
export function ClassCatalog({ classes }: { classes: ClassItem[] }) {
  const [type, setType] = useState<string>("전체");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const results = useMemo(() => {
    const selected = classes.filter(item => {
      const kind = item.productKind === "digital" ? "디지털 상품" : item.programType === "free" ? "무료 클래스" : "유료 클래스";
      return (type === "전체" || type === kind) && `${item.title} ${item.category} ${item.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    });
    return sort === "price" ? selected.sort((a, b) => Number(a.price.replace(/\D/g, "")) - Number(b.price.replace(/\D/g, ""))) : selected;
  }, [classes, query, type, sort]);
  return <div className="ba-catalog"><div className="ba-filter-row"><div className="ba-chips" aria-label="상품 유형">{types.map(value => <button type="button" className={type === value ? "active" : ""} key={value} aria-pressed={type === value} onClick={() => setType(value)}>{value}</button>)}</div><div className="ba-filter-tools"><label className="ba-search"><Search aria-hidden="true"/><input aria-label="클래스 검색" type="search" placeholder="클래스 검색" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="클래스 정렬" value={sort} onChange={event => setSort(event.target.value)}><option value="default">기본순</option><option value="price">낮은 가격순</option></select></div></div><p className="ba-result-count" role="status">{results.length}개의 클래스·자료</p>{results.length ? <div className="ba-course-grid">{results.map(item => <ClassCard key={item.slug} item={item}/>)}</div> : <div className="ba-empty"><h2>{classes.length ? "찾는 클래스가 없어요." : "새로운 클래스를 준비하고 있습니다."}</h2><p>{classes.length ? "다른 검색어를 입력하거나 상품 유형을 변경해 보세요." : "클래스가 공개되면 이곳에서 확인할 수 있습니다."}</p>{classes.length > 0 && <button className="ba-button" onClick={() => { setType("전체"); setQuery(""); setSort("default"); }}>필터 초기화</button>}</div>}</div>;
}
