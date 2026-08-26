"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
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

  const needs = [
    { title: "광고비를 쓰는데 매출이 늘지 않아요", categorySlug: "ads-revenue", label: "광고 · 매출" },
    { title: "콘텐츠 조회수가 구매로 이어지지 않아요", categorySlug: "marketing-conversion", label: "마케팅 · 전환" },
    { title: "AI를 어디서부터 활용해야 할지 모르겠어요", categorySlug: "ai-practice", label: "AI 실무" },
    { title: "신규 고객은 오는데 재구매가 낮아요", categorySlug: "crm-retention", label: "CRM · 재구매" },
    { title: "어떤 채널이 실제 매출을 만드는지 모르겠어요", categorySlug: "funnel", label: "퍼널" },
  ];
  return <div id="article-list">
    <section className="article-need-nav"><div className="container"><span className="section-kicker">START WITH YOUR REVENUE BOTTLENECK</span><h2>지금 매출을 막는 문제는 무엇인가요?</h2><p>가장 가까운 문제를 선택하면 해당 문제를 해결하는 글만 바로 보여드립니다.</p><div>{needs.map((need, index) => <button key={need.title} onClick={() => { const matched = categories.find((item) => item.slug === need.categorySlug); setCategory(matched?.id || "all"); setQuery(""); document.querySelector(".article-library")?.scrollIntoView({ behavior: "smooth" }); }}><span>{String(index + 1).padStart(2, "0")}</span><small>{need.label}</small><strong>{need.title}</strong><ArrowRight/></button>)}</div></div></section>
    {featured && <section className="article-featured"><div className="container article-featured-grid"><Link href={`/articles/${featured.slug}`} className="article-featured-art" style={featured.coverImageUrl ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.04),rgba(0,0,0,.18)),url(${featured.coverImageUrl})` } : undefined}><span>MOST READ</span>{!featured.coverImageUrl && <strong>01</strong>}</Link><div><span className="article-label">사업자들이 지금 가장 많이 보는 글 · {featured.categoryName}</span><h2>{featured.title}</h2><p>{featured.summary}</p><div className="article-meta"><span>{dateLabel(featured.publishedAt)}</span><span>{articleReadingMinutes(featured.blocks)}분 읽기</span></div><Link href={`/articles/${featured.slug}`}>매출 개선 포인트 확인하기 <ArrowUpRight/></Link></div></div></section>}
    <section className="article-library section"><div className="container">
      <div className="article-library-head"><div><span className="section-kicker">MARKETING · AI · REVENUE</span><h2>사업자의 매출을 만드는 실무 블로그</h2><p>광고·콘텐츠·AI·CRM을 실제 문의와 구매로 연결하는 방법을 모았습니다.</p></div><label className="article-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="매출 문제나 실행 키워드를 검색하세요"/></label></div>
      <div className="article-category-tabs"><button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>전체 <span>{articles.length}</span></button>{categories.map((item) => <button className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)}>{item.name} <span>{articles.filter((article) => article.categoryId === item.id).length}</span></button>)}</div>
      {visible.length ? <div className="article-card-grid">{visible.map((article, index) => <article className="article-card" key={article.id}><Link href={`/articles/${article.slug}`} className="article-card-art" style={article.coverImageUrl ? { backgroundImage: `url(${article.coverImageUrl})` } : undefined}><span>{article.categoryName}</span>{!article.coverImageUrl && <strong>{String(index + 1).padStart(2, "0")}</strong>}</Link><div><span>{article.categoryName}</span><h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3><p>{article.summary}</p><footer><small>{dateLabel(article.publishedAt)} · {articleReadingMinutes(article.blocks)}분 읽기</small><Link aria-label={`${article.title} 읽기`} href={`/articles/${article.slug}`}><ArrowUpRight/></Link></footer><Link className="article-card-bridge" href="/articles#free-class">읽고 → 무료 3강으로 실행해 보기 <ArrowRight/></Link></div></article>)}</div> : <div className="article-empty"><strong>조건에 맞는 아티클이 없습니다.</strong><p>다른 카테고리나 검색어를 확인해 주세요.</p></div>}
    </div></section>
    <section className="article-mid-cta"><div className="container"><div><span>TURN INSIGHT INTO REVENUE</span><h2>읽고 이해한 전략을<br/>내 사업의 매출 행동으로 바꾸세요.</h2><p>무료 3강에서 고객·콘텐츠·전환 구조를 점검하고 첫 실행안을 만듭니다.</p></div><Link href="/articles#free-class">무료 3강으로 시작하기 <ArrowRight/></Link></div></section>
  </div>;
}
