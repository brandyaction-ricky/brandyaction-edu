"use client";
import {
  date,
  money,
  number as num,
  object,
  safeUrl,
  text as t,
  type Row,
  type User,
} from "@/lib/platform";
import { hasLearningAccess, isRecruiting } from "@/lib/platform-rules";
import { cohortPeriod } from "@/lib/qa-rules";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessageCircle,
  Play,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Data } from "../learning-workflows";
import {
  ArticleCard,
  Badge,
  Blocks,
  Brand,
  Cover,
  Empty,
  Heading,
  ResourceRow,
  Story,
  Video,
  courseType,
} from "./primitives";

export function AuthView({
  signup,
  pending,
  social,
  next,
}: {
  signup: boolean;
  pending: boolean;
  social: (provider: "google" | "kakao") => Promise<void>;
  next: string;
}) {
  return (
    <div className="form-page">
      <section className="form-card">
        {signup ? (
          <div className="eyebrow">Welcome to Brandyaction</div>
        ) : (
          <Brand />
        )}
        <h1>
          {signup ? "배움을 실행으로 바꾸는 시작." : "다시 만나 반가워요."}
        </h1>
        <p className="lead">
          {signup
            ? "클래스와 자료를 한 계정에서 관리하세요."
            : "로그인하고 내 일의 다음 단계를 이어가세요."}
        </p>
        <div className="social-stack">
          <button
            className="btn kakao full"
            disabled={pending}
            onClick={() => void social("kakao")}
          >
            <MessageCircle className="social-mark" />
            카카오로 계속하기
          </button>
          <button
            className="btn full"
            disabled={pending}
            onClick={() => void social("google")}
          >
            <span className="social-mark">G</span>Google로 계속하기
          </button>
        </div>
        <p className="meta">
          처음 방문하셨다면 소셜 계정으로 가입한 뒤 필수 약관을 확인합니다.
        </p>
        <div className="form-bottom">
          <Link
            href={
              (signup ? "/login" : "/signup") +
              "?next=" +
              encodeURIComponent(next)
            }
          >
            {signup ? "이미 계정이 있나요? 로그인" : "회원가입"}
          </Link>
          <Link className="text-link" href="/policies/privacy">
            개인정보 처리방침
          </Link>
        </div>
      </section>
    </div>
  );
}

export function ProductDetail({
  course: c,
  data,
}: {
  course: Row;
  data: Data;
}) {
  const cohorts = (data.cohorts || []).filter((g) => g.course_id === c.id),
    [cohortId, setCohortId] = useState("");
  const available =
    cohorts.find((g) => g.id === cohortId && isRecruiting(g)) ||
    cohorts.find(isRecruiting);
  const enrolled = (data.enrollments || []).find(
    (e) => e.course_id === c.id && hasLearningAccess(e),
  );
  const weeks = (data.curriculum_weeks || [])
    .filter((w) => w.course_id === c.id)
    .sort((a, b) => num(a, "week_number") - num(b, "week_number"));
  const lessons = (data.curriculum_lessons || []).filter((l) =>
    weeks.some((w) => w.id === l.week_id),
  );
  const resources = (data.lesson_contents || []).filter(
    (x) => x.resource_storage_path && lessons.some((l) => l.id === x.lesson_id),
  );
  const type = courseType(c),
    digital = type === "디지털 상품",
    free = type === "무료 클래스";
  const meta = object(c, "metadata"),
    detailImage = safeUrl(meta.detailImageUrl || meta.detail_image_url);
  const price = available ? num(available, "price") : num(c, "list_price");
  const href = enrolled
    ? digital
      ? "/my/resources"
      : "/learn/" + enrolled.id
    : available
      ? "/" + (price === 0 ? "apply" : "checkout") + "?cohort=" + available.id
      : "/classes";
  const cta = enrolled
    ? digital
      ? "내 자료실로 이동"
      : "학습 이어가기"
    : available
      ? free
        ? "무료로 신청하기"
        : digital
          ? "구매하기"
          : "수강 신청하기"
      : "다음 모집 준비 중";
  const button = (
    <Link
      href={href}
      aria-disabled={!enrolled && !available}
      className={
        "btn primary full large " + (!enrolled && !available ? "disabled" : "")
      }
    >
      {cta}
      <ArrowRight />
    </Link>
  );
  const downloadSection = (
    <section className="free-downloads">
      <h2>{free ? "클래스와 함께 사용할 자료" : "구성 자료"}</h2>
      <p>내 업무에 배운 내용을 적용할 때 활용하세요.</p>
      {resources.length ? (
        resources.map((r) => (
          <ResourceRow key={t(r, "lesson_id")} content={r} />
        ))
      ) : (
        <p className="notice">
          {enrolled
            ? "등록된 자료는 내 자료실에 표시됩니다."
            : "신청·구매 후 제공되는 자료는 내 자료실에서 확인할 수 있습니다."}
        </p>
      )}
    </section>
  );
  return (
    <>
      {free ? (
        <>
          <h1 className="sr-only">{t(c, "title")} · 무료 클래스</h1>
          <div className="free-body">
            <div className="free-sheet">
              {detailImage ? (
                <img
                  className="detail-image"
                  src={detailImage}
                  alt={t(c, "title") + " 상세 안내"}
                />
              ) : (
                <section className="panel-body">
                  <Cover course={c} />
                  <h2 className="mt24">{t(c, "title")}</h2>
                  <p className="lead mt16">{t(c, "summary")}</p>
                  <div className="reading-copy mt24">{t(c, "description")}</div>
                </section>
              )}
              {downloadSection}
            </div>
          </div>
        </>
      ) : (
        <div className="wrap">
          <div className="page-head" />
          <div className="breadcrumbs">
            <Link href="/">홈</Link>
            <span>/</span>
            <Link href="/classes">전체 클래스</Link>
            <span>/ {type}</span>
          </div>
          <div className="product-layout">
            <div className="product-main">
              <Cover course={c} />
              <h1>{t(c, "title")}</h1>
              <p className="lead">{t(c, "summary")}</p>
              <nav className="subnav" aria-label="상품 상세 영역">
                <a href="#class-detail">소개</a>
                <a href="#curriculum">{digital ? "구성 자료" : "커리큘럼"}</a>
                {!digital && <a href="#class-reviews">수강 후기</a>}
                <a href="#class-guide">이용 안내</a>
              </nav>
              <section className="detail-section" id="class-detail">
                <h2>
                  {digital
                    ? "반복 업무를 줄이는 작은 도구."
                    : "이 클래스에서 만들 변화"}
                </h2>
                {detailImage ? (
                  <img
                    className="detail-image"
                    src={detailImage}
                    alt={t(c, "title") + " 상세 안내"}
                  />
                ) : (
                  <div className="reading-copy">
                    {t(c, "description") || t(c, "summary")}
                  </div>
                )}
              </section>
              <section className="detail-section" id="curriculum">
                <h2>{digital ? "구성 자료" : "학습 방식과 커리큘럼"}</h2>
                {digital
                  ? downloadSection
                  : weeks.map((w) => (
                      <details className="accordion" key={w.id}>
                        <summary>
                          {num(w, "week_number")}주차 · {t(w, "title")}
                        </summary>
                        <div className="inside">{t(w, "goal")}</div>
                        {lessons
                          .filter((l) => l.week_id === w.id)
                          .map((l) => (
                            <div className="lesson-line" key={l.id}>
                              <BookOpen />
                              <span>{t(l, "title")}</span>
                              <span className="spacer" />
                              <small>{t(l, "duration_label")}</small>
                            </div>
                          ))}
                      </details>
                    ))}
                {!digital && !weeks.length && (
                  <p className="muted">커리큘럼 공개를 준비하고 있습니다.</p>
                )}
              </section>
              {!digital && (
                <>
                  <section className="detail-section" id="class-reviews">
                    <h2>수강생의 실행 경험</h2>
                    {(data.reviews || [])
                      .filter((r) => r.course_id === c.id)
                      .map((r) => (
                        <article className="review-entry" key={r.id}>
                          <div
                            className="stars"
                            aria-label={num(r, "rating") + "점"}
                          >
                            {"★".repeat(
                              Math.max(0, Math.min(5, num(r, "rating"))),
                            )}
                          </div>
                          <p>{t(r, "body")}</p>
                          <small>{t(r, "author_name")}</small>
                        </article>
                      ))}
                    {!(data.reviews || []).some(
                      (r) => r.course_id === c.id,
                    ) && (
                      <p className="muted">아직 공개된 수강 후기가 없습니다.</p>
                    )}
                  </section>
                  <section className="detail-section">
                    <h2>함께할 강사</h2>
                    <div className="instructor">
                      <div className="avatar">
                        <UserRound />
                      </div>
                      <div>
                        <h3>{t(c, "instructor_name") || "브랜디액션"}</h3>
                        <p>{String(meta.instructorBio || "")}</p>
                      </div>
                    </div>
                  </section>
                </>
              )}
              <section className="detail-section" id="class-guide">
                <h2>이용 안내</h2>
                <details className="accordion" open>
                  <summary>
                    {digital
                      ? "구매 후 어디에서 받나요?"
                      : "학습은 어디에서 시작하나요?"}
                  </summary>
                  <div className="inside">
                    {digital
                      ? "결제 완료 후 마이페이지의 내 자료실에서 다운로드합니다."
                      : "신청 완료 후 내 클래스에서 기수별 일정과 학습 콘텐츠를 확인하세요."}
                  </div>
                </details>
                <details className="accordion">
                  <summary>이용 및 환불 안내</summary>
                  <div className="inside">
                    <Link className="text-link" href="/policies/refund">
                      이용 및 환불 정책 확인하기
                    </Link>
                  </div>
                </details>
              </section>
            </div>
            <aside className="product-aside">
              <div className="purchase-card">
                <Badge color="red">{type}</Badge>
                <h2>{t(c, "title")}</h2>
                <div className="price">{money(price)}</div>
                <dl className="info-lines">
                  <div>
                    <dt>{digital ? "제공 시점" : "학습 기간"}</dt>
                    <dd>
                      {digital
                        ? "결제 완료 후"
                        : t(c, "duration_label") ||
                          cohortPeriod(available || cohorts[0])}
                    </dd>
                  </div>
                  <div>
                    <dt>진행 방식</dt>
                    <dd>
                      {digital
                        ? "파일 다운로드"
                        : t(c, "schedule_label") || "온라인 클래스"}
                    </dd>
                  </div>
                  <div>
                    <dt>모집 마감</dt>
                    <dd>{date(available?.recruitment_end_at)}</dd>
                  </div>
                </dl>
                {cohorts.filter(isRecruiting).length > 1 && (
                  <label className="field">
                    기수 선택
                    <select
                      value={available?.id || ""}
                      onChange={(e) => setCohortId(e.target.value)}
                    >
                      {cohorts.filter(isRecruiting).map((g) => (
                        <option key={g.id} value={g.id}>
                          {t(g, "name")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {available && (
                  <p className="meta mb24">{t(available, "name")}</p>
                )}
                {button}
                <p className="meta">
                  <Link href="/policies/refund">이용·환불 안내</Link>
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
      <aside className={"bottom-cta " + (!free ? "product-mobile-cta" : "")}>
        <div className="wrap">
          <div>
            <div className="cta-price">
              {price === 0 ? "무료" : money(price)}
            </div>
            <p className="meta">
              {t(available, "name") || t(c, "schedule_label")}
            </p>
          </div>
          <Link
            href={href}
            aria-disabled={!enrolled && !available}
            className={
              "btn primary large " + (!enrolled && !available ? "disabled" : "")
            }
          >
            {cta}
            <ArrowRight />
          </Link>
        </div>
      </aside>
    </>
  );
}

// Only published, authorized content from the API is playable here.
export function ArticleBanner({
  data,
  user,
}: {
  data: Data;
  user: User | null;
}) {
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false);
  const candidates = (data.curriculum_lessons || []).filter(
    (l) => l.is_preview,
  );
  const lessons = candidates.slice(0, 3),
    lesson = lessons[index] || lessons[0];
  const content = (data.lesson_contents || []).find(
    (c) => c.lesson_id === lesson?.id,
  );
  if (!lessons.length) return null;
  return (
    <section className="ab-banner" aria-label="회원 무료강의">
      <div className="ab-media">
        <div className="ab-player">
          {playing && user && safeUrl(content?.vod_url) ? (
            <Video url={t(content, "vod_url")} />
          ) : (
            <>
              <span className="ab-player-corner">BRANDYACTION EDU</span>
              <button
                className="ab-play-button"
                aria-label="선택한 무료강의 재생"
                disabled={!user || !safeUrl(content?.vod_url)}
                onClick={() => setPlaying(true)}
              >
                <Play />
              </button>
              <strong>{t(lesson, "title")}</strong>
              <p>
                {user
                  ? content?.vod_url
                    ? "재생 버튼을 눌러 시작하세요."
                    : "내 클래스에서 수강 권한을 확인해 주세요."
                  : "회원가입 후 무료강의를 시청하세요."}
              </p>
            </>
          )}
        </div>
        <div className="ab-media-caption">
          <b>내 업무를 바꾸는 첫 학습</b>
          <span>{lessons.length}개 강의</span>
        </div>
      </div>
      <div className="ab-copy">
        <div className="ab-eyebrow">MEMBERS ONLY / FREE CLASS</div>
        <h2>
          배우고, 내 일에
          <br />
          바로 적용해 보세요.
        </h2>
        <p className="ab-description">회원에게 공개된 무료강의를 확인하세요.</p>
        <div className="ab-playlist">
          {lessons.map((l, i) => (
            <button
              className={"ab-lesson " + (l.id === lesson?.id ? "active" : "")}
              key={l.id}
              onClick={() => {
                setIndex(i);
                setPlaying(false);
              }}
            >
              <span className="ab-number">0{i + 1}</span>
              <b>{t(l, "title")}</b>
              <Play />
            </button>
          ))}
        </div>
        <div className="ab-actions mt24">
          <Link
            className="ab-primary"
            href={user ? "/my/classes" : "/signup?next=/articles"}
          >
            {user ? "내 클래스에서 확인하기" : "회원가입하고 무료로 배우기"}
            <ArrowRight />
          </Link>
          {!user && (
            <Link className="ab-login" href="/login?next=/articles">
              이미 회원이라면 로그인
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
export function ArticlesView({
  slug,
  data,
  user,
  loading,
}: {
  slug?: string;
  data: Data;
  user: User | null;
  loading: boolean;
}) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("전체");
  const all = data.articles || [],
    a = all.find((a) => a.slug === slug);
  if (slug)
    return (
      <div className="wrap">
        {a ? (
          <article className="article-detail">
            <div className="breadcrumbs">
              <Link href="/articles">아티클</Link>
              <span>/ {a.content_type === "video" ? "영상" : "인사이트"}</span>
            </div>
            <Badge>{a.content_type === "video" ? "영상" : "인사이트"}</Badge>
            <h1>{t(a, "title")}</h1>
            <div className="meta">
              브랜디액션 에디터 · {date(a.published_at)}
            </div>
            <p className="lead mt24">{t(a, "summary")}</p>
            {safeUrl(a.video_url) && <Video url={t(a, "video_url")} />}
            <Blocks value={a.content_blocks} />
            <div className="related">
              <h2>다음 인사이트</h2>
              {all
                .filter((x) => x.id !== a.id)
                .slice(0, 2)
                .map((x) => (
                  <Link
                    className="resource-row"
                    key={x.id}
                    href={"/articles/" + t(x, "slug")}
                  >
                    {t(x, "title")}
                    <ArrowRight />
                  </Link>
                ))}
            </div>
            <Link className="btn mt24" href="/articles">
              <ArrowLeft />
              아티클 목록
            </Link>
          </article>
        ) : (
          <Empty
            title={
              loading ? "불러오는 중입니다." : "아티클을 찾을 수 없습니다."
            }
          />
        )}
      </div>
    );
  const filtered = all.filter(
    (a) =>
      (type === "전체" ||
        (a.content_type === "video" ? "영상" : "글") === type) &&
      t(a, "title").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="wrap">
      <Heading
        title="일하는 방식을 바꾸는 인사이트"
        description="읽고, 배우고, 내 일에 적용해 보세요."
      />
      <ArticleBanner data={data} user={user} />
      <div className="filter-row mt32">
        <div className="chips">
          {["전체", "글", "영상"].map((x) => (
            <button
              key={x}
              className={"chip " + (x === type ? "active" : "")}
              aria-pressed={x === type}
              onClick={() => setType(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <label className="search">
          <Search />
          <input
            type="search"
            aria-label="아티클 검색"
            placeholder="아티클 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="grid3 pb64">
        {filtered.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
        {!loading && !filtered.length && (
          <Empty title="조회된 아티클이 없습니다." />
        )}
      </div>
    </div>
  );
}
export function StoriesView({
  data,
  loading,
}: {
  data: Data;
  loading: boolean;
}) {
  const stories = data.review_videos || [],
    featured = stories[0];
  return (
    <div className="wrap">
      <Heading
        title="배움이 내 일에 닿은 순간"
        description="해결하고 싶은 문제에서 시작해, 실행한 과정과 변화를 나눕니다."
      />
      {featured && (
        <section className="story-feature">
          <div>
            <div className="eyebrow">LEARNING IN PRACTICE</div>
            <h2>{t(featured, "title")}</h2>
            <p className="lead mt16">{t(featured, "description")}</p>
            <div className="who mt24">
              <span className="avatar">
                {t(featured, "reviewer_name").slice(0, 1)}
              </span>
              <b>{t(featured, "reviewer_name")}</b>
              <span>{t(featured, "reviewer_role")}</span>
            </div>
          </div>
          <Video url={t(featured, "video_url")} />
        </section>
      )}
      <div className="section">
        <div className="grid3">
          {stories.slice(1).map((s) => (
            <Story key={s.id} story={s} />
          ))}
          {!loading && !stories.length && (
            <Empty title="공개된 고객 이야기가 없습니다." />
          )}
        </div>
      </div>
    </div>
  );
}
