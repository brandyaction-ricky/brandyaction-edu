import {
  date,
  money,
  number as num,
  object,
  safeUrl,
  text as t,
  type Row,
} from "@/lib/platform";
import {
  ArrowRight,
  BookOpen,
  Download,
  FileText,
  Play,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Badge({
  children,
  color = "",
}: {
  children: ReactNode;
  color?: string;
}) {
  return <span className={"badge " + color}>{children}</span>;
}
export function Empty({
  title = "등록된 내용이 없습니다.",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen />
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
export function Heading({
  title,
  description,
  children,
  eyebrow,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-head">
      <div className="between">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children && <div className="page-actions">{children}</div>}
      </div>
    </div>
  );
}
export function Brand() {
  return (
    <Link href="/" className="brand">
      <img className="brand-logo" src="/brandy-action-logo.png" alt="brandyaction" />
      <small>EDU</small>
    </Link>
  );
}
export function courseType(c: Row) {
  return c.category === "digital" ||
    object(c, "metadata").productType === "digital"
    ? "디지털 상품"
    : num(c, "list_price") === 0
      ? "무료 클래스"
      : "유료 클래스";
}
export function Cover({ course }: { course: Row }) {
  const type = courseType(course),
    meta = object(course, "metadata"),
    image = safeUrl(meta.thumbnailUrl || meta.thumbnail_url);
  return (
    <div
      className={
        "cover " +
        (type === "무료 클래스"
          ? "red"
          : type === "디지털 상품"
            ? "sand"
            : "dark")
      }
    >
      {image ? (
        <img
          className="course-cover-image"
          src={image}
          alt={t(course, "title")}
        />
      ) : (
        <>
          <span className="cover-label">
            {type === "무료 클래스"
              ? "FREE LIVE CLASS"
              : type === "디지털 상품"
                ? "WORK TOOLKIT / DIGITAL"
                : "AI MARKETING / CLASS"}
          </span>
          <strong>{t(course, "title")}</strong>
          <div className="cover-bottom">
            <span>BRANDYACTION EDU</span>
            <ArrowRight />
          </div>
          <span className="cover-line" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
export function CourseCard({ course }: { course: Row }) {
  return (
    <Link className="course-card" href={"/classes/" + t(course, "slug")}>
      <Cover course={course} />
      <div className="card-body">
        <div className="flex gap8">
          <Badge color={num(course, "list_price") === 0 ? "red" : ""}>
            {courseType(course)}
          </Badge>
          {t(course, "duration_label") && (
            <Badge>{t(course, "duration_label")}</Badge>
          )}
        </div>
        <h3>{t(course, "title")}</h3>
        <p>{t(course, "schedule_label") || t(course, "summary")}</p>
        <div className="card-price">
          {num(course, "list_price") === 0
            ? "무료"
            : money(num(course, "list_price"))}
          <ArrowRight className="arrow" />
        </div>
      </div>
    </Link>
  );
}
export function ArticleCard({ article }: { article: Row }) {
  const thumbnail = safeUrl(
    article.cover_image_url ||
      article.cover_image_path ||
      article.thumbnail_image_url,
  );
  return (
    <Link className="article-card" href={"/articles/" + t(article, "slug")}>
      <div className="article-thumbnail">
        {thumbnail ? (
          <img src={thumbnail} alt={t(article, "cover_image_alt") || t(article, "title")} />
        ) : (
          <span>BRANDYACTION EDU</span>
        )}
      </div>
      <h3>{t(article, "title")}</h3>
      <p className="muted">{t(article, "summary")}</p>
      <span className="meta">
        {date(article.published_at)} <ArrowRight />
      </span>
    </Link>
  );
}
export function Story({ story }: { story: Row }) {
  return (
    <article className="story-card">
      <Badge>고객 이야기</Badge>
      <blockquote>“{t(story, "title")}”</blockquote>
      <p>{t(story, "description")}</p>
      <div className="who mt24">
        <span className="avatar">
          {t(story, "reviewer_name").slice(0, 1) || <UserRound />}
        </span>
        <span>
          <b>{t(story, "reviewer_name")}</b> · {t(story, "reviewer_role")}
        </span>
      </div>
      {safeUrl(story.video_url) && (
        <a
          className="link mt16"
          href={safeUrl(story.video_url)}
          target="_blank"
          rel="noreferrer"
        >
          이야기 영상 보기 <ArrowRight />
        </a>
      )}
    </article>
  );
}
export function Video({ url }: { url: string }) {
  let embed = "";
  try {
    const u = new URL(url);
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : u.hostname === "youtube.com" || u.hostname.endsWith(".youtube.com")
          ? u.searchParams.get("v") || u.pathname.split("/").pop()
          : null;
    if (id && /^[\w-]{11}$/.test(id))
      embed = "https://www.youtube-nocookie.com/embed/" + id;
    else if (u.hostname === "vimeo.com" && /^\/\d+$/.test(u.pathname))
      embed = "https://player.vimeo.com/video" + u.pathname;
  } catch {}
  return embed ? (
    <iframe
      className="real-video"
      src={embed}
      title="강의 영상"
      allow="fullscreen; picture-in-picture"
      allowFullScreen
    />
  ) : /\.(mp4|webm)(\?|$)/i.test(url) ? (
    <video className="real-video" src={safeUrl(url)} controls />
  ) : safeUrl(url) ? (
    <a className="btn" href={safeUrl(url)} target="_blank" rel="noreferrer">
      <Play />
      영상 열기
    </a>
  ) : null;
}
export function Blocks({ value }: { value: unknown }) {
  return (
    <div className="article-body">
      {(Array.isArray(value) ? value : []).map((b, i) => {
        const content = String(b.text || b.content || b.body || "");
        return b.type === "heading" ? (
          <h2 key={i}>{content}</h2>
        ) : b.type === "image" && safeUrl(b.url || b.src) ? (
          <img
            key={i}
            src={safeUrl(b.url || b.src)}
            alt={String(b.alt || "")}
          />
        ) : b.type === "video" ? (
          <Video key={i} url={String(b.url || "")} />
        ) : (
          <p key={i}>{content}</p>
        );
      })}
    </div>
  );
}
export function ResourceRow({ content }: { content: Row }) {
  return (
    <div className="resource-row">
      <div className="file-icon">
        <FileText />
      </div>
      <div className="resource-text">
        <b>{t(content, "resource_name") || "학습 자료"}</b>
        <small>수강 권한 확인 후 다운로드</small>
      </div>
      <a
        className="btn small"
        href={
          "/api/platform/resource?lesson=" +
          encodeURIComponent(t(content, "lesson_id"))
        }
      >
        <Download />
        다운로드
      </a>
    </div>
  );
}
