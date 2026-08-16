"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, Compass, Search } from "lucide-react";
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

  const needs = ["하고 싶은 일이 아직 없어요", "지금 회사가 나와 맞는지 모르겠어요", "이직해야 할지 남아야 할지 고민돼요", "나에게 맞는 일을 찾고 싶어요", "일은 잘하는데 만족스럽지 않아요"];
  return <div id="article-list">
    <section className="article-need-nav"><div className="container"><span className="section-kicker">START WITH YOUR QUESTION</span><h2>지금, 어떤 고민에서 출발하고 있나요?</h2><p>내 고민과 가까운 문장을 선택하면 읽을 글을 더 빠르게 찾을 수 있어요.</p><div>{needs.map((need, index) => <button key={need} onClick={() => { setQuery(need.split(" ").slice(0, 2).join(" ")); document.querySelector(".article-library")?.scrollIntoView({ behavior: "smooth" }); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{need}</strong><ArrowRight/></button>)}</div></div></section>
    {featured && <section className="article-featured"><div className="container article-featured-grid"><Link href={`/articles/${featured.slug}`} className="article-featured-art" style={featured.coverImageUrl ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.04),rgba(0,0,0,.18)),url(${featured.coverImageUrl})` } : undefined}><span>MOST READ</span>{!featured.coverImageUrl && <strong>01</strong>}</Link><div><span className="article-label">지금 가장 많이 읽는 글 · {featured.categoryName}</span><h2>{featured.title}</h2><p>{featured.summary}</p><div className="article-meta"><span>{dateLabel(featured.publishedAt)}</span><span>{articleReadingMinutes(featured.blocks)}분 읽기</span></div><Link href={`/articles/${featured.slug}`}>이 글로 고민 구체화하기 <ArrowUpRight/></Link></div></div></section>}
    <section className="article-reading-path"><div className="container"><div><Compass/><span><b>01</b><strong>문제 구체화</strong><small>내 고민과 가까운 글 읽기</small></span></div><i/><div><CheckCircle2/><span><b>02</b><strong>방향 잡기</strong><small>무료 3강으로 기준 세우기</small></span></div><i/><div><ArrowUpRight/><span><b>03</b><strong>진단으로 측정</strong><small>내 패턴을 구체적으로 확인</small></span></div></div></section>
    <section className="article-library section"><div className="container">
      <div className="article-library-head"><div><span className="section-kicker">READ · FIND · ACT</span><h2>내 일의 방향을 찾는 아티클</h2><p>나를 이해하고, 일을 해석하고, 다음 선택으로 이어지는 글을 모았습니다.</p></div><label className="article-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="고민이나 키워드를 검색하세요"/></label></div>
      <div className="article-category-tabs"><button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>전체 <span>{articles.length}</span></button>{categories.map((item) => <button className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)}>{item.name} <span>{articles.filter((article) => article.categoryId === item.id).length}</span></button>)}</div>
      {visible.length ? <div className="article-card-grid">{visible.map((article, index) => <article className="article-card" key={article.id}><Link href={`/articles/${article.slug}`} className="article-card-art" style={article.coverImageUrl ? { backgroundImage: `url(${article.coverImageUrl})` } : undefined}><span>{article.categoryName}</span>{!article.coverImageUrl && <strong>{String(index + 1).padStart(2, "0")}</strong>}</Link><div><span>{article.categoryName}</span><h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3><p>{article.summary}</p><footer><small>{dateLabel(article.publishedAt)} · {articleReadingMinutes(article.blocks)}분 읽기</small><Link aria-label={`${article.title} 읽기`} href={`/articles/${article.slug}`}><ArrowUpRight/></Link></footer><Link className="article-card-bridge" href="/articles#free-class">읽고 → 무료 3강으로 방향 잡기 <ArrowRight/></Link></div></article>)}</div> : <div className="article-empty"><strong>조건에 맞는 아티클이 없습니다.</strong><p>다른 카테고리나 검색어를 확인해 주세요.</p></div>}
    </div></section>
    <section className="article-mid-cta"><div className="container"><div><span>READING IS THE FIRST STEP</span><h2>글에서 발견한 질문을<br/>내 일의 방향으로 이어보세요.</h2><p>무료 3강에서 반복되는 결핍과 욕구를 따라 내 기준을 세웁니다.</p></div><Link href="/articles#free-class">무료 3강 바로 보기 <ArrowRight/></Link></div></section>
  </div>;
}
