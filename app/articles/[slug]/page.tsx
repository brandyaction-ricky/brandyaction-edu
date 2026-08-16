import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, FileText } from "lucide-react";
import { BrandHeader } from "../../components/brand-header";
import { getPublicArticle } from "@/lib/article-data";
import { articleReadingMinutes, youtubeEmbedUrl } from "@/lib/articles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) return { title: "블로그 콘텐츠를 찾을 수 없습니다" };
  return { title: `${article.seoTitle || article.title} | 브랜디액션 에듀`, description: article.seoDescription || article.summary };
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) notFound();
  const videoEmbed = article.contentType === "youtube" ? youtubeEmbedUrl(article.videoUrl) : "";
  return <main className="article-detail-page"><BrandHeader/>
    <article>
      <header className="article-detail-head"><div className="article-reading-container"><Link href="/articles" className="article-back"><ArrowLeft/> 블로그 목록</Link><span className="article-label">{article.categoryName}</span><h1>{article.title}</h1><p>{article.summary}</p><div className="article-meta"><span>{dateLabel(article.publishedAt)}</span><span>{article.contentType === "youtube" ? "영상 인사이트" : `${articleReadingMinutes(article.blocks)}분 읽기`}</span><span>BRANDYACTION EDU</span></div></div></header>
      {videoEmbed && <div className="article-video container"><iframe src={videoEmbed} title={article.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div>}
      {!videoEmbed && article.coverImageUrl && (
        <div className="article-cover container" role="img" aria-label={article.coverImageAlt} style={{ backgroundImage: `url(${article.coverImageUrl})` }}/>
      )}
      <div className="article-reading-container article-body">{article.blocks.map((block) => {
        if (block.type === "heading") return <h2 key={block.id}>{block.text}</h2>;
        if (block.type === "quote") return <blockquote key={block.id}>{block.text}</blockquote>;
        if (block.type === "list") return <ul key={block.id}>{block.text.split("\n").filter(Boolean).map((item, index) => <li key={`${block.id}-${index}`}>{item.replace(/^[-•]\s*/, "")}</li>)}</ul>;
        if (block.type === "image") return block.imageUrl ? <figure key={block.id}><div role="img" aria-label={block.alt || "아티클 본문 이미지"} style={{ backgroundImage: `url(${block.imageUrl})` }}/>{block.text && <figcaption>{block.text}</figcaption>}</figure> : null;
        return <p key={block.id}>{block.text}</p>;
      })}</div>
      {article.attachments.length > 0 && <section className="article-downloads"><div className="article-reading-container"><span>RELATED MATERIALS</span><h2>보고 바로 실행할 수 있는 자료</h2><p>콘텐츠와 함께 활용할 워크북·체크리스트를 내려받으세요.</p><div>{article.attachments.map((item) => <a href={item.url} download key={item.id}><FileText/><span><strong>{item.name}</strong><small>{item.size ? `${(item.size / 1_000_000).toFixed(item.size >= 1_000_000 ? 1 : 2)}MB` : "첨부 파일"}</small></span><Download/></a>)}</div></div></section>}
      <footer className="article-detail-cta"><div className="article-reading-container"><span>READ · APPLY · GROW</span><h2>읽는 데서 멈추지 않고,<br/>내 사업의 매출 실험으로 옮겨보세요.</h2><div><Link href="/articles">다른 실무 글 보기 <ArrowLeft/></Link><Link href="/classes">마케팅·AI 클래스 확인 <ArrowRight/></Link></div></div></footer>
    </article>
  </main>;
}
