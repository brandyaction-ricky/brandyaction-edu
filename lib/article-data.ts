import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getSupabasePublicConfig, hasSupabaseEnv } from "@/lib/supabase/config";
import { Article, ArticleCategory, defaultFreeCourse, FreeCourseSettings, normalizeBlocks, normalizeFreeCourse } from "@/lib/articles";

type CategoryRow = { id: string; name: string; slug: string; description: string | null; display_order: number; is_active: boolean };
type ArticleRow = {
  id: string; category_id: string | null; slug: string; title: string; summary: string | null; content_blocks: unknown; attachments: unknown;
  content_type: "column" | "youtube"; video_url: string | null;
  cover_image_path: string | null; cover_image_alt: string | null; status: "draft" | "scheduled" | "published" | "hidden";
  is_featured: boolean; seo_title: string | null; seo_description: string | null; scheduled_at: string | null;
  published_at: string | null; created_at: string; updated_at: string;
  article_categories: { name: string } | Array<{ name: string }> | null;
};

function publicClient() {
  const { publicUrl, publishableKey } = getSupabasePublicConfig();
  return createClient(publicUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function categoryName(value: ArticleRow["article_categories"]) {
  if (Array.isArray(value)) return value[0]?.name || "블로그";
  return value?.name || "블로그";
}

function articleUrl(client: ReturnType<typeof publicClient>, path: string | null) {
  return path ? client.storage.from("article-assets").getPublicUrl(path).data.publicUrl : "";
}

function attachmentUrl(client: ReturnType<typeof publicClient>, path: string) { return client.storage.from("article-resources").getPublicUrl(path).data.publicUrl; }

function mapArticle(client: ReturnType<typeof publicClient>, row: ArticleRow): Article {
  const blocks = normalizeBlocks(row.content_blocks).map((block) => ({
    ...block,
    imageUrl: block.type === "image" ? articleUrl(client, block.imagePath || null) : "",
  }));
  return {
    id: row.id,
    categoryId: row.category_id || "",
    categoryName: categoryName(row.article_categories),
    slug: row.slug,
    title: row.title,
    summary: row.summary || "",
    contentType: row.content_type === "youtube" ? "youtube" : "column",
    videoUrl: row.video_url || "",
    blocks,
    attachments: Array.isArray(row.attachments) ? row.attachments.flatMap((item, index) => item && typeof item === "object" && "path" in item ? [{ id: String((item as Record<string, unknown>).id || `attachment-${index}`), name: String((item as Record<string, unknown>).name || "관련 자료"), path: String((item as Record<string, unknown>).path), url: attachmentUrl(client, String((item as Record<string, unknown>).path)), size: Number((item as Record<string, unknown>).size) || 0 }] : []) : [],
    coverImagePath: row.cover_image_path || "",
    coverImageUrl: articleUrl(client, row.cover_image_path),
    coverImageAlt: row.cover_image_alt || row.title,
    status: row.status,
    isFeatured: row.is_featured,
    seoTitle: row.seo_title || "",
    seoDescription: row.seo_description || "",
    scheduledAt: row.scheduled_at || "",
    publishedAt: row.published_at || row.scheduled_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isVisible(article: Article) {
  if (article.status === "published") return true;
  return article.status === "scheduled" && Boolean(article.scheduledAt) && new Date(article.scheduledAt).getTime() <= Date.now();
}

async function queryPublicArticleIndex(): Promise<{ articles: Article[]; categories: ArticleCategory[]; freeCourse: FreeCourseSettings }> {
  if (!hasSupabaseEnv()) return { articles: [], categories: [], freeCourse: defaultFreeCourse };
  try {
    const client = publicClient();
    const [articleResult, categoryResult, settingResult] = await Promise.all([
      client.from("articles").select("id,category_id,slug,title,summary,content_type,video_url,content_blocks,attachments,cover_image_path,cover_image_alt,status,is_featured,seo_title,seo_description,scheduled_at,published_at,created_at,updated_at,article_categories(name)").order("is_featured", { ascending: false }).order("published_at", { ascending: false }),
      client.from("article_categories").select("id,name,slug,description,display_order,is_active").eq("is_active", true).order("display_order"),
      client.from("site_settings").select("value").eq("key", "article_free_course").maybeSingle(),
    ]);
    const articles = articleResult.error ? [] : ((articleResult.data || []) as ArticleRow[]).map((row) => mapArticle(client, row)).filter(isVisible);
    const categories = categoryResult.error ? [] : ((categoryResult.data || []) as CategoryRow[]).map((row) => ({ id: row.id, name: row.name, slug: row.slug, description: row.description || "", displayOrder: row.display_order, isActive: row.is_active }));
    return { articles, categories, freeCourse: settingResult.error ? defaultFreeCourse : normalizeFreeCourse(settingResult.data?.value) };
  } catch {
    return { articles: [], categories: [], freeCourse: defaultFreeCourse };
  }
}

const getPublicArticleIndexCached = unstable_cache(queryPublicArticleIndex, ["public-article-index"], {
  revalidate: 60,
});

export async function getPublicArticleIndex() {
  return getPublicArticleIndexCached();
}

async function queryPublicArticle(slug: string): Promise<Article | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const client = publicClient();
    const { data, error } = await client.from("articles").select("id,category_id,slug,title,summary,content_type,video_url,content_blocks,attachments,cover_image_path,cover_image_alt,status,is_featured,seo_title,seo_description,scheduled_at,published_at,created_at,updated_at,article_categories(name)").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    const article = mapArticle(client, data as ArticleRow);
    return isVisible(article) ? article : null;
  } catch {
    return null;
  }
}

const getPublicArticleCached = unstable_cache(queryPublicArticle, ["public-article-detail"], {
  revalidate: 60,
});

export async function getPublicArticle(slug: string) {
  return getPublicArticleCached(slug);
}
