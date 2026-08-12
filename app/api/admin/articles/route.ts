import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { defaultFreeCourse, normalizeBlocks, normalizeFreeCourse, slugify, type ArticleStatus } from "@/lib/articles";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<ArticleStatus>(["draft", "scheduled", "published", "hidden"]);

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

function publicAssetUrl(path: string | null) {
  if (!path || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/article-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function relationName(value: unknown) {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" && "name" in item ? String(item.name) : "미분류";
}

function storedBlocks(value: unknown) {
  const blocks = normalizeBlocks(value).slice(0, 80).map((block) => ({
    id: block.id,
    type: block.type,
    text: block.text.slice(0, 20_000),
    ...(block.type === "image" && block.imagePath ? { imagePath: block.imagePath, alt: (block.alt || "").slice(0, 160) } : {}),
  }));
  const invalidImage = blocks.some((block) => "imagePath" in block && block.imagePath && !block.imagePath.startsWith("articles/"));
  if (invalidImage) throw new Error("본문 이미지 경로가 올바르지 않습니다.");
  return blocks;
}

function displayBlocks(value: unknown) {
  return normalizeBlocks(value).map((block) => ({
    ...block,
    imageUrl: block.type === "image" ? publicAssetUrl(block.imagePath || null) : "",
  }));
}

function assetPaths(article: { cover_image_path?: string | null; content_blocks?: unknown } | null | undefined) {
  if (!article) return [];
  return Array.from(new Set([
    article.cover_image_path || "",
    ...normalizeBlocks(article.content_blocks).map((block) => block.type === "image" ? block.imagePath || "" : ""),
  ].filter((path) => path.startsWith("articles/"))));
}

export async function GET() {
  const operator = await getAdminUser("articles");
  if (!operator) return NextResponse.json({ error: "아티클 관리 권한이 필요합니다." }, { status: 403 });
  try {
    const admin = createAdminClient();
    const [articles, categories, freeCourse] = await Promise.all([
      admin.from("articles").select("id,category_id,slug,title,summary,content_blocks,cover_image_path,cover_image_alt,status,is_featured,seo_title,seo_description,scheduled_at,published_at,created_at,updated_at,article_categories(name)").order("updated_at", { ascending: false }),
      admin.from("article_categories").select("id,name,slug,description,display_order,is_active").order("display_order"),
      admin.from("site_settings").select("value").eq("key", "article_free_course").maybeSingle(),
    ]);
    if (articles.error) throw articles.error;
    if (categories.error) throw categories.error;
    return NextResponse.json({
      articles: (articles.data || []).map((row) => ({
        id: row.id,
        categoryId: row.category_id || "",
        categoryName: relationName(row.article_categories),
        slug: row.slug,
        title: row.title,
        summary: row.summary || "",
        blocks: displayBlocks(row.content_blocks),
        coverImagePath: row.cover_image_path || "",
        coverImageUrl: publicAssetUrl(row.cover_image_path),
        coverImageAlt: row.cover_image_alt || "",
        status: row.status,
        isFeatured: row.is_featured,
        seoTitle: row.seo_title || "",
        seoDescription: row.seo_description || "",
        scheduledAt: row.scheduled_at || "",
        publishedAt: row.published_at || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      categories: (categories.data || []).map((row) => ({ id: row.id, name: row.name, slug: row.slug, description: row.description || "", displayOrder: row.display_order, isActive: row.is_active })),
      freeCourse: freeCourse.error ? defaultFreeCourse : normalizeFreeCourse(freeCourse.data?.value),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "아티클 데이터를 불러오지 못했습니다.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const operator = await getAdminUser("articles");
  if (!operator) return NextResponse.json({ error: "아티클 관리 권한이 필요합니다." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const admin = createAdminClient();

    if (action === "saveCategory") {
      const category = body.category && typeof body.category === "object" ? body.category as Record<string, unknown> : {};
      const id = String(category.id || "");
      const name = String(category.name || "").trim().slice(0, 40);
      const slug = slugify(String(category.slug || name));
      if (!name || !slug) return NextResponse.json({ error: "카테고리 이름을 입력해 주세요." }, { status: 400 });
      const payload = { name, slug, description: String(category.description || "").trim().slice(0, 160) || null, display_order: Number(category.displayOrder) || 0, is_active: category.isActive !== false };
      const result = id && uuidPattern.test(id) ? await admin.from("article_categories").update(payload).eq("id", id).select("id").single() : await admin.from("article_categories").insert(payload).select("id").single();
      if (result.error) throw result.error;
      await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: id ? "article_category.updated" : "article_category.created", entity_type: "article_category", entity_id: result.data.id, after_data: payload });
      return NextResponse.json({ id: result.data.id });
    }

    if (action === "deleteCategory") {
      const id = String(body.id || "");
      if (!uuidPattern.test(id)) return NextResponse.json({ error: "잘못된 카테고리입니다." }, { status: 400 });
      const { error } = await admin.from("article_categories").delete().eq("id", id);
      if (error) throw error;
      await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "article_category.deleted", entity_type: "article_category", entity_id: id });
      return NextResponse.json({ ok: true });
    }

    if (action === "saveFreeCourse") {
      const value = normalizeFreeCourse(body.freeCourse);
      const { error } = await admin.from("site_settings").upsert({ key: "article_free_course", value, is_public: true, updated_by: operator.id }, { onConflict: "key" });
      if (error) throw error;
      await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "article_free_course.updated", entity_type: "site_setting", entity_id: "article_free_course", after_data: value });
      return NextResponse.json({ ok: true });
    }

    if (action === "saveArticle") {
      const article = body.article && typeof body.article === "object" ? body.article as Record<string, unknown> : {};
      const id = String(article.id || "");
      const title = String(article.title || "").trim().slice(0, 150);
      const slug = slugify(String(article.slug || title));
      const status = statuses.has(article.status as ArticleStatus) ? article.status as ArticleStatus : "draft";
      const categoryId = String(article.categoryId || "");
      const blocks = storedBlocks(article.blocks);
      const scheduledAt = String(article.scheduledAt || "");
      if (!title || !slug) return NextResponse.json({ error: "제목과 URL 주소를 입력해 주세요." }, { status: 400 });
      if (categoryId && !uuidPattern.test(categoryId)) return NextResponse.json({ error: "카테고리를 다시 선택해 주세요." }, { status: 400 });
      if (status === "scheduled" && (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime()))) return NextResponse.json({ error: "예약 발행 날짜와 시간을 입력해 주세요." }, { status: 400 });
      const coverImagePath = String(article.coverImagePath || "");
      if (coverImagePath && !coverImagePath.startsWith("articles/")) return NextResponse.json({ error: "대표 이미지 경로가 올바르지 않습니다." }, { status: 400 });
      const now = new Date().toISOString();
      const payload = {
        category_id: categoryId || null,
        slug,
        title,
        summary: String(article.summary || "").trim().slice(0, 500) || null,
        content_blocks: blocks,
        cover_image_path: coverImagePath || null,
        cover_image_alt: String(article.coverImageAlt || "").trim().slice(0, 160) || title,
        status,
        is_featured: article.isFeatured === true,
        seo_title: String(article.seoTitle || "").trim().slice(0, 70) || null,
        seo_description: String(article.seoDescription || "").trim().slice(0, 180) || null,
        scheduled_at: status === "scheduled" ? new Date(scheduledAt).toISOString() : null,
        published_at: status === "published" ? String(article.publishedAt || now) : null,
        updated_by: operator.id,
      };
      if (payload.is_featured) await admin.from("articles").update({ is_featured: false }).eq("is_featured", true);
      const existing = id && uuidPattern.test(id)
        ? await admin.from("articles").select("cover_image_path,content_blocks").eq("id", id).maybeSingle()
        : { data: null, error: null };
      if (existing.error) throw existing.error;
      const result = id && uuidPattern.test(id)
        ? await admin.from("articles").update(payload).eq("id", id).select("id").single()
        : await admin.from("articles").insert({ ...payload, created_by: operator.id }).select("id").single();
      if (result.error) throw result.error;
      const retainedPaths = new Set(assetPaths({ cover_image_path: payload.cover_image_path, content_blocks: blocks }));
      const replacedPaths = assetPaths(existing.data).filter((path) => !retainedPaths.has(path));
      if (replacedPaths.length) await admin.storage.from("article-assets").remove(replacedPaths);
      await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: id ? "article.updated" : "article.created", entity_type: "article", entity_id: result.data.id, after_data: { title, status, is_featured: payload.is_featured } });
      return NextResponse.json({ id: result.data.id });
    }

    if (action === "deleteArticle") {
      const id = String(body.id || "");
      if (!uuidPattern.test(id)) return NextResponse.json({ error: "잘못된 아티클입니다." }, { status: 400 });
      const { data: article } = await admin.from("articles").select("cover_image_path,content_blocks").eq("id", id).maybeSingle();
      const { error } = await admin.from("articles").delete().eq("id", id);
      if (error) throw error;
      const paths = assetPaths(article);
      if (paths.length) await admin.storage.from("article-assets").remove(paths);
      await admin.from("audit_logs").insert({ actor_user_id: operator.id, action: "article.deleted", entity_type: "article", entity_id: id });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    const message = errorMessage(error, "요청을 처리하지 못했습니다.");
    const status = message.includes("duplicate key") ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "같은 URL 주소가 이미 사용 중입니다." : message }, { status });
  }
}
