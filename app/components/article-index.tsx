"use client";

import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { type Article, type ArticleCategory, articleReadingMinutes } from "@/lib/articles";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}

export function ArticleIndex({ articles, categories }: { articles: Article[]; categories: ArticleCategory[] }) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const featured = articles.find((article) => article.isFeatured) || articles[0];
  const visible = useMemo(() => articles.filter((article) => {
    const categoryMatch = category === "all" || article.categoryId === category;
    const term = query.trim().toLowerCase();
    return categoryMatch && (!term || `${article.title} ${article.summary} ${article.categoryName}`.toLowerCase().includes(term));
  }), [articles, category, query]);

  return <div id="article-list">
    {featured && <section className="article-featured"><div className="container article-featured-grid"><Link href={`/articles/${featured.slug}`} className="article-featured-art" style={featured.coverImageUrl ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.04),rgba(0,0,0,.18)),url(${featured.coverImageUrl})` } : undefined}><span>FEATURED ARTICLE</span>{!featured.coverImageUrl && <strong>01</strong>}</Link><div><span className="article-label">FEATURED · {featured.categoryName}</span><h2>{featured.title}</h2><p>{featured.summary}</p><div className="article-meta"><span>{dateLabel(featured.publishedAt)}</span><span>{articleReadingMinutes(featured.blocks)}분 읽기</span></div><Link href={`/articles/${featured.slug}`}>대표 아티클 읽기 <ArrowUpRight/></Link></div></div></section>}
    <section className="article-library section"><div className="container">
      <div className="article-library-head"><div><span className="section-kicker">BRANDYACTION INSIGHT</span><h2>생각을 실행으로 바꾸는 아티클</h2><p>정체성, 강점, 업과 브랜드를 내 기준으로 연결합니다.</p></div><label className="article-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="찾고 싶은 주제를 검색하세요"/></label></div>
      <div className="article-category-tabs"><button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>전체 <span>{articles.length}</span></button>{categories.map((item) => <button className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)}>{item.name} <span>{articles.filter((article) => article.categoryId === item.id).length}</span></button>)}</div>
      {visible.length ? <div className="article-card-grid">{visible.map((article, index) => <article className="article-card" key={article.id}><Link href={`/articles/${article.slug}`} className="article-card-art" style={article.coverImageUrl ? { backgroundImage: `url(${article.coverImageUrl})` } : undefined}><span>{article.categoryName}</span>{!article.coverImageUrl && <strong>{String(index + 1).padStart(2, "0")}</strong>}</Link><div><span>{article.categoryName}</span><h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3><p>{article.summary}</p><footer><small>{dateLabel(article.publishedAt)} · {articleReadingMinutes(article.blocks)}분 읽기</small><Link aria-label={`${article.title} 읽기`} href={`/articles/${article.slug}`}><ArrowUpRight/></Link></footer></div></article>)}</div> : <div className="article-empty"><strong>조건에 맞는 아티클이 없습니다.</strong><p>다른 카테고리나 검색어를 확인해 주세요.</p></div>}
    </div></section>
  </div>;
}
