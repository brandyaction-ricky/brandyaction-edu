export type ArticleStatus = "draft" | "scheduled" | "published" | "hidden";
export type ArticleBlockType = "paragraph" | "heading" | "quote" | "list" | "image";

export type ArticleBlock = {
  id: string;
  type: ArticleBlockType;
  text: string;
  imagePath?: string;
  imageUrl?: string;
  alt?: string;
};

export type ArticleCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
};

export type ArticleAttachment = { id: string; name: string; path: string; url: string; size: number };

export type Article = {
  id: string;
  categoryId: string;
  categoryName: string;
  slug: string;
  title: string;
  summary: string;
  blocks: ArticleBlock[];
  attachments: ArticleAttachment[];
  coverImagePath: string;
  coverImageUrl: string;
  coverImageAlt: string;
  status: ArticleStatus;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
  scheduledAt: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type FreeCourseLesson = { id: string; title: string; videoUrl: string };
export type FreeCourseSettings = {
  eyebrow: string;
  title: string;
  description: string;
  signupCopy: string;
  lessons: FreeCourseLesson[];
};

export const defaultFreeCourse: FreeCourseSettings = {
  eyebrow: "FREE CLASS · 무료 3강",
  title: "사업자를 위한 마케팅·AI 매출 진단",
  description: "광고비를 더 쓰기 전에 고객 유입, 콘텐츠, 전환, 재구매 중 어디에서 매출이 막히는지 먼저 확인합니다.",
  signupCopy: "무료 회원가입을 완료하면 사업자용 3강 전체를 바로 볼 수 있습니다. 별도 결제는 필요 없습니다.",
  lessons: [
    { id: "lesson-1", title: "매출을 막는 마케팅 병목 찾기", videoUrl: "" },
    { id: "lesson-2", title: "AI로 줄일 일과 사람이 결정할 일", videoUrl: "" },
    { id: "lesson-3", title: "7일 안에 실행할 매출 실험 설계", videoUrl: "" },
  ],
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function normalizeBlocks(value: unknown): ArticleBlock[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<ArticleBlockType>(["paragraph", "heading", "quote", "list", "image"]);
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const type = allowed.has(row.type as ArticleBlockType) ? row.type as ArticleBlockType : "paragraph";
    return [{
      id: String(row.id || `block-${index}`),
      type,
      text: String(row.text || ""),
      imagePath: row.imagePath ? String(row.imagePath) : undefined,
      imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
      alt: row.alt ? String(row.alt) : undefined,
    }];
  });
}

export function normalizeFreeCourse(value: unknown): FreeCourseSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultFreeCourse;
  const row = value as Record<string, unknown>;
  const lessons = Array.isArray(row.lessons) ? row.lessons.slice(0, 3).map((lesson, index) => {
    const item = lesson && typeof lesson === "object" ? lesson as Record<string, unknown> : {};
    return {
      id: String(item.id || `lesson-${index + 1}`),
      title: String(item.title || defaultFreeCourse.lessons[index]?.title || `무료강의 ${index + 1}`),
      videoUrl: String(item.videoUrl || ""),
    };
  }) : defaultFreeCourse.lessons;
  while (lessons.length < 3) lessons.push(defaultFreeCourse.lessons[lessons.length]);
  return {
    eyebrow: String(row.eyebrow || defaultFreeCourse.eyebrow),
    title: String(row.title || defaultFreeCourse.title),
    description: String(row.description || defaultFreeCourse.description),
    signupCopy: String(row.signupCopy || defaultFreeCourse.signupCopy),
    lessons,
  };
}

export function youtubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    let id = "";
    if (url.hostname === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      id = url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : url.searchParams.get("v") || "";
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
  } catch {
    return "";
  }
}

export function articleReadingMinutes(blocks: ArticleBlock[]) {
  const length = blocks.reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
  return Math.max(1, Math.ceil(length / 500));
}
