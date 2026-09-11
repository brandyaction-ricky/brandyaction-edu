"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { canOptimizePublicImage } from "@/lib/public-image";
import { type Article, type ArticleCategory, articleReadingMinutes } from "@/lib/articles";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function ArticleIndex({ articles, categories }: { articles: Article[]; categories: ArticleCategory[] }) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return articles.filter(article => (category === "all" || article.categoryId === category) && (!term || `${article.title} ${article.summary} ${article.categoryName}`.toLowerCase().includes(term)));
  }, [articles, category, query]);
  return <section className="ba-article-library container" id="article-list">
    <header className="ba-page-head"><span className="ba-eyebrow">INSIGHTS</span><h1>실행으로 이어지는 인사이트</h1><p>마케팅과 AI, 내 일에 적용할 수 있는 생각과 방법을 모았습니다.</p></header>
    <div className="ba-filter-row"><div className="ba-chips" aria-label="아티클 주제"><button type="button" className={category === "all" ? "active" : ""} aria-pressed={category === "all"} onClick={() => setCategory("all")}>전체 {articles.length}</button>{categories.map(item => <button type="button" className={category === item.id ? "active" : ""} aria-pressed={category === item.id} key={item.id} onClick={() => setCategory(item.id)}>{item.name} {articles.filter(article => article.categoryId === item.id).length}</button>)}</div><label className="ba-search"><Search size={18}/><input aria-label="아티클 검색" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="관심 있는 주제를 검색하세요"/></label></div>
    <p className="ba-result-count" role="status">{visible.length}개의 아티클</p>
    {visible.length ? <div className="ba-course-grid">{visible.map(article => <article className="ba-course-card" key={article.id}><Link href={`/articles/${article.slug}`} className="ba-cover" aria-label={article.title}>{article.coverImageUrl ? <Image src={article.coverImageUrl} alt="" fill unoptimized={!canOptimizePublicImage(article.coverImageUrl)} sizes="(max-width: 680px) 100vw, (max-width: 1024px) 50vw, 33vw"/> : <><span className="ba-eyebrow">BRANDY ACTION · INSIGHTS</span><strong>{article.categoryName}</strong><span className="ba-cover-foot">LEARN. APPLY. GROW.<ArrowUpRight size={18}/></span></>}</Link><div className="ba-card-body"><div className="ba-badges"><span className="ba-badge">{article.categoryName}</span>{article.isFeatured && <span className="ba-badge red">에디터 추천</span>}</div><h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3><p>{article.summary}</p><div className="ba-article-meta"><span>{dateLabel(article.publishedAt)} · {articleReadingMinutes(article.blocks)}분 읽기</span><Link href={`/articles/${article.slug}`} aria-label={`${article.title} 읽기`}><ArrowUpRight size={18}/></Link></div></div></article>)}</div> : <div className="ba-empty"><h2>조건에 맞는 아티클이 없습니다.</h2><p>다른 주제나 검색어로 찾아보세요.</p>{(query || category !== "all") && <button className="ba-button" onClick={() => { setQuery(""); setCategory("all"); }}>검색 초기화</button>}</div>}
  </section>;
}
