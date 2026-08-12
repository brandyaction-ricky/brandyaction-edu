import type { Metadata } from "next";
import { BrandHeader } from "../components/brand-header";
import { ArticleFreeCourse } from "../components/article-free-course";
import { ArticleIndex } from "../components/article-index";
import { getPublicArticleIndex } from "@/lib/article-data";
import { getAuthenticatedUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "아티클 | 브랜디액션 에듀", description: "정체성, 강점, 업과 브랜딩을 실행으로 연결하는 브랜디액션 아티클" };

export default async function ArticlesPage() {
  const [{ articles, categories, freeCourse }, user] = await Promise.all([getPublicArticleIndex(), getAuthenticatedUser()]);
  return <main className="articles-page"><BrandHeader/><ArticleFreeCourse settings={freeCourse} authenticated={Boolean(user)}/><ArticleIndex articles={articles} categories={categories}/></main>;
}
