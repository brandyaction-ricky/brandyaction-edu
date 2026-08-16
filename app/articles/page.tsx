import type { Metadata } from "next";
import { BrandHeader } from "../components/brand-header";
import { ArticleFreeCourse } from "../components/article-free-course";
import { ArticleIndex } from "../components/article-index";
import { getPublicArticleIndex } from "@/lib/article-data";
import { getAuthenticatedUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "사업자 마케팅·AI 블로그 | 브랜디액션 에듀", description: "광고, 콘텐츠, AI 자동화, CRM을 실제 매출로 연결하는 사업자 실무 블로그" };

export default async function ArticlesPage() {
  const [{ articles, categories, freeCourse }, user] = await Promise.all([getPublicArticleIndex(), getAuthenticatedUser()]);
  return <main className="articles-page"><BrandHeader/><ArticleFreeCourse settings={freeCourse} authenticated={Boolean(user)}/><ArticleIndex articles={articles} categories={categories}/></main>;
}
