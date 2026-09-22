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
import { containsFreeClassCampaign, hasLearningAccess, isPurchasableOffer, isRecruiting, offerLifecycle, paidCourseReadinessIssues } from "@/lib/platform-rules";
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
import { EmailAuth } from "../email-auth";
import { ProductDetailHtml } from './product-detail-html';
import { productDocument } from '@/lib/product-html-document';
import { productConversion } from '@/lib/product-conversion';
import { ProductPixel, ProductCtaLink } from './product-conversion';
import { productDetailImages, productDigitalSections, productResources } from '@/lib/product-metadata';
import {
  ArticleCard,
  Badge,
  Blocks,
  Brand,
  Cover,
  Empty,
  Heading,
  ResourceRow,
  ProductResourceRow,
  DigitalContentOutline,
  Video,
  courseType,
} from "./primitives";

export function AuthView({
  signup,
  pending,
  social,
  next,
  authError,
}: {
  signup: boolean;
  pending: boolean;
  social: (provider: "google" | "kakao") => Promise<void>;
  next: string;
  authError?: string | null;
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
        {authError && ['auth_callback', 'email_confirmation'].includes(authError) && <p className="notice mt16" role="alert">인증 링크가 만료되었거나 인증을 완료하지 못했습니다. 이메일 링크는 요청한 브라우저에서 다시 열거나, 아래에서 로그인·인증 메일 재발송을 진행해 주세요.</p>}
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
        <EmailAuth key={signup ? 'signup' : 'login'} signup={signup} next={next} disabled={pending} />
        <p className="meta">
          처음 방문하셨다면 가입 후 필수 약관을 확인합니다.
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

import type { LandingConfig } from "@/lib/landing";
import { CampaignFreeClass, LandingTracker } from "../landing/free-class";

export function ProductDetail({ course, data }: { course: Row; data: Data }) {
  const config = num(course, 'list_price') === 0 ? (data.landing_configs || []).find(row => row.id === course.id) : undefined;
  const enrolled = (data.enrollments || []).some(item => item.course_id === course.id && hasLearningAccess(item));
  const acceptingApplications = (data.cohorts || []).some(item => item.course_id === course.id && isRecruiting(item));
  if (config && productConversion(object(course, 'metadata'), config).url && !enrolled && acceptingApplications) {
    const frozen = object(config, "course_snapshot");
    const currentMetadata = object(course, "metadata");
    const campaignCourse = { ...course, ...frozen, metadata: { ...object(frozen as Row, "metadata"), ...currentMetadata } } as Row;
    return <CampaignFreeClass course={campaignCourse} config={config as unknown as LandingConfig} resources={productResources(currentMetadata)} />;
  }
  const tracking = Boolean(config?.enabled && Number(config.layout_ver) > 0);
  const detail = <StandardProductDetail course={course} data={data} tracking={tracking} />;
  return tracking ? <LandingTracker config={config as unknown as LandingConfig}>{detail}</LandingTracker> : detail;
}

function StandardProductDetail({
  course: c,
  data,
  tracking = false,
}: {
  course: Row;
  data: Data;
  tracking?: boolean;
}) {
  const type = courseType(c),
    digital = type === "디지털 상품",
    free = type === "무료 클래스";
  const cohorts = (data.cohorts || []).filter((g) => g.course_id === c.id),
    [cohortId, setCohortId] = useState("");
  const purchasable = (cohort: Row) => free ? isRecruiting(cohort) : isPurchasableOffer(c, cohort);
  let available =
    cohorts.find((g) => g.id === cohortId && purchasable(g)) ||
    cohorts.find(purchasable);
  const displayCohort = available || cohorts.find(item => item.id === cohortId) || cohorts[0];
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
  const meta = object(c, "metadata"),
    directResources = productResources(meta),
    digitalSections = productDigitalSections(meta, false),
    detailImages = productDetailImages(meta).map(image => ({ ...image, path: safeUrl(image.path) })).filter(image => image.path),
    detailImage = detailImages[0]?.path || '';
  const detailHtml = typeof meta.detail_html === 'string' ? meta.detail_html : '';
  const documentSource = productDocument(meta);
  const mismatchedFreeContent = !free && containsFreeClassCampaign(documentSource || detailHtml);
  const visibleDocumentSource = mismatchedFreeContent ? '' : documentSource;
  const visibleDetailHtml = mismatchedFreeContent ? '' : detailHtml;
  const readinessIssues = paidCourseReadinessIssues(c, cohorts, data.curriculum_weeks || [], data.curriculum_lessons || []);
  const readyForSale = readinessIssues.length === 0;
  if (!readyForSale) available = undefined;
  const conversion = productConversion(meta);
  const customCta = !enrolled && readyForSale && !!conversion.url;
  const price = free ? 0 : available ? num(available, "price") : num(c, "list_price");
  const lifecycle = offerLifecycle(displayCohort);
  const unavailableFree = free && !enrolled && !available;
  const href = enrolled
    ? digital
      ? "/my/resources"
      : "/learn/" + enrolled.id
    : unavailableFree ? '/classes' : available
      ? "/" + (price === 0 ? "apply" : "checkout") + "?cohort=" + available.id
      : "/classes";
  const cta = enrolled
    ? digital
      ? "내 자료실로 이동"
      : "학습 이어가기"
    : unavailableFree ? lifecycle === 'upcoming' ? '모집 예정' : lifecycle === 'cancelled' ? '운영 취소' : '신청 마감' : available
      ? free
        ? "무료로 신청하기"
        : digital
          ? "구매하기"
          : "수강 신청하기"
      : "다음 모집 준비 중";
  const unavailableLabel = lifecycle === 'upcoming' ? '모집 예정' : lifecycle === 'cancelled' ? '운영 취소' : '신청 마감';
  const button = customCta ? <ProductCtaLink conversion={conversion} courseId={c.id} position="sidebar_cta" className="btn primary full large" /> : unavailableFree ? <button className="btn primary full large" disabled>{unavailableLabel}</button> : (
    <Link
      href={href}
      data-landing-cta={free && tracking ? "sticky_cta" : undefined}
      aria-disabled={!enrolled && !available}
      className={
        "btn primary full large " + (!enrolled && !available ? "disabled" : "")
      }
    >
      {cta}
      <ArrowRight />
    </Link>
  );
  const hasResources = directResources.length > 0 || resources.length > 0;
  const downloadSection = (
    <section className="free-downloads">
      <h2>{free ? "클래스와 함께 사용할 자료" : "구성 자료"}</h2>
      <p>내 업무에 배운 내용을 적용할 때 활용하세요.</p>
      {hasResources ? (<>
        {directResources.map(resource => <ProductResourceRow key={resource.id} resource={resource} courseId={c.id} />)}
        {resources.map((r) => (
          <ResourceRow key={t(r, "lesson_id")} content={r} />
        ))}</>
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
      <ProductPixel courseId={c.id} pixelId={conversion.pixelId} />
      {free ? (
        <>
          <h1 className="sr-only">{t(c, "title")} · 무료 클래스</h1>
          <div className="free-body" data-section="detail">
            <div className="free-sheet">
              {documentSource || detailHtml ? <ProductDetailHtml html={detailHtml} documentSource={documentSource} /> : detailImage ? (
                <div className="detail-image-stack">{detailImages.map((image, index) => <img
                  className="detail-image"
                  src={image.path}
                  alt={image.alt || `${t(c, "title")} 상세 안내 ${index + 1}`}
                  key={image.path + index}
                />)}</div>
              ) : (
                <section className="panel-body">
                  <Cover course={c} />
                  <h2 className="mt24">{t(c, "title")}</h2>
                  <p className="lead mt16">{t(c, "summary")}</p>
                  {detailHtml ? <ProductDetailHtml html={detailHtml} className="product-detail-html reading-copy mt24" /> : <div className="reading-copy mt24">{t(c, "description")}</div>}
                </section>
              )}
              {hasResources && downloadSection}
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
            <div className="product-main" data-section="detail">
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
                {visibleDocumentSource || visibleDetailHtml ? <ProductDetailHtml html={visibleDetailHtml} documentSource={visibleDocumentSource} /> : detailImage ? (
                  <div className="detail-image-stack">{detailImages.map((image, index) => <img
                    className="detail-image"
                    src={image.path}
                    alt={image.alt || `${t(c, "title")} 상세 안내 ${index + 1}`}
                    key={image.path + index}
                  />)}</div>
                ) : visibleDetailHtml ? <ProductDetailHtml html={visibleDetailHtml} /> : (
                  <div className="reading-copy">
                    {t(c, "description") || t(c, "summary")}
                  </div>
                )}
                {mismatchedFreeContent && <p className="notice mt24">유료 클래스 상세 콘텐츠를 준비하고 있습니다. 무료 클래스 안내와 외부 참여 링크는 노출하지 않습니다.</p>}
              </section>
              <section className="detail-section" id="curriculum">
                <h2>{digital ? "구성 자료" : "학습 방식과 커리큘럼"}</h2>
                {digital
                  ? digitalSections.length ? <DigitalContentOutline sections={digitalSections} courseId={c.id} accessible={Boolean(enrolled)} /> : downloadSection
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
              {!digital && displayCohort && (data.cohort_sessions || []).some(session => session.cohort_id === displayCohort.id && session.is_public) && <section className="detail-section" id="class-schedule">
                <h2>라이브 회차 일정</h2>
                <p className="muted">입장 주소와 다시보기는 유효한 수강권이 있는 회원에게만 공개됩니다.</p>
                {(data.cohort_sessions || []).filter(session => session.cohort_id === displayCohort.id && session.is_public).sort((a,b) => num(a,"session_number") - num(b,"session_number")).map(session => <div className="lesson-line" key={session.id}><BookOpen /><span>{num(session,"session_number")}회 · {t(session,"title")}</span><span className="spacer"/><small>{session.scheduled_at ? new Date(String(session.scheduled_at)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "일정 미정"}</small></div>)}
              </section>}
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
                  {meta.instructor_approved === true && <section className="detail-section">
                    <h2>함께할 강사</h2>
                    <div className="instructor">
                      <div className="avatar">
                        <UserRound />
                      </div>
                      <div>
                        <h3>{t(c, "instructor_name") || "브랜디액션"}</h3>
                        <p>{String(meta.instructor_bio || meta.instructorBio || "")}</p>
                      </div>
                    </div>
                  </section>}
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
                {String(meta.provided_items || "").trim() && <details className="accordion"><summary>제공 항목</summary><div className="inside reading-copy">{String(meta.provided_items)}</div></details>}
                {String(meta.usage_notes || "").trim() && <details className="accordion"><summary>이용 유의사항</summary><div className="inside reading-copy">{String(meta.usage_notes)}</div></details>}
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
                {Number(meta.regular_price) > price && <del className="meta">{money(Number(meta.regular_price))}</del>}
                <div className="price">{money(price)}</div>
                {Number(meta.regular_price) > price && <p className="discount-info">{Math.round((1 - price / Number(meta.regular_price)) * 100)}% 할인 · 최종 결제 금액은 선택한 기수 판매가와 적용 쿠폰을 기준으로 계산됩니다.</p>}
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
                    <dd>{date(displayCohort?.recruitment_end_at)}</dd>
                  </div>
                  <div><dt>모집 상태</dt><dd>{{ recruiting: "모집 중", upcoming: "모집 예정", closed: "모집 종료", cancelled: "운영 취소" }[lifecycle]}</dd></div>
                  {num(displayCohort,"capacity") > 0 && <div><dt>정원</dt><dd>{num(displayCohort,"capacity")}명</dd></div>}
                </dl>
                {cohorts.filter(purchasable).length > 1 && (
                  <label className="field">
                    기수 선택
                    <select
                      value={available?.id || ""}
                      onChange={(e) => setCohortId(e.target.value)}
                    >
                      {cohorts.filter(purchasable).map((g) => (
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
                {!enrolled && readinessIssues.length > 0 && <p className="notice mb24">판매 준비 중입니다. {readinessIssues.join(" · ")} 정보를 확인하고 있습니다.</p>}
                {button}
              </div>
            </aside>
          </div>
        </div>
      )}
      <aside className={"bottom-cta " + (free ? "single-cta" : "product-mobile-cta")} data-section="final">
        <div className="wrap">
          {!free && <div>
            <div className="cta-price">
              {price === 0 ? conversion.priceLabel : money(price)}
            </div>
            <p className="meta">
              {t(available, "name") || t(c, "schedule_label")}
            </p>
          </div>}
          {customCta ? <ProductCtaLink conversion={conversion} courseId={c.id} position="sticky_cta" /> : unavailableFree ? <button className="btn primary large" disabled>{unavailableLabel}</button> : <Link
            href={href}
            data-landing-cta={free && tracking ? "sticky_cta" : undefined}
            aria-disabled={!enrolled && !available}
            className={
              "btn primary large " + (!enrolled && !available ? "disabled" : "")
            }
          >
            {cta}
            <ArrowRight />
          </Link>}
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
  const configured = object((data.article_banner || [])[0], "value");
  if ((data.article_banner || []).length && configured.enabled === false) return null;
  const configuredVideos = Array.isArray(configured.videos)
    ? configured.videos.slice(0, 3).map((item, i) => {
        const video = item as Record<string, unknown>;
        return { id: `configured-${i}`, title: String(video.title || `무료 강의 ${i + 1}`), url: safeUrl(video.url), available: video.available === true };
      })
    : [];
  const candidates = (data.curriculum_lessons || []).filter(
    (l) => l.is_preview,
  );
  const lessons = configuredVideos.length ? configuredVideos : candidates.slice(0, 3),
    lesson = lessons[index] || lessons[0];
  const content = (data.lesson_contents || []).find(
    (c) => c.lesson_id === lesson?.id,
  );
  const videoUrl = "url" in (lesson || {}) ? String(lesson?.url || "") : t(content, "vod_url");
  if (!lessons.length) return null;
  return (
    <section className="ab-banner" aria-label="회원 무료강의">
      <div className="ab-media">
        <div className="ab-player">
          {playing && user && safeUrl(videoUrl) ? (
            <Video url={videoUrl} />
          ) : (
            <>
              <span className="ab-player-corner">BRANDYACTION EDU</span>
              <button
                className="ab-play-button"
                aria-label="선택한 무료강의 재생"
                disabled={!user || !safeUrl(videoUrl)}
                onClick={() => setPlaying(true)}
              >
                <Play />
              </button>
              <strong>{t(lesson, "title")}</strong>
              <p>
                {user
                  ? videoUrl
                    ? "재생 버튼을 눌러 시작하세요."
                    : "내 클래스에서 수강 권한을 확인해 주세요."
                  : String(configured.signupNotice || "회원가입 후 무료강의를 시청하세요.")}
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
        <div className="ab-eyebrow">{String(configured.eyebrow || "MEMBERS ONLY / FREE CLASS")}</div>
        <h2>{String(configured.title || "배우고, 내 일에 바로 적용해 보세요.")}</h2>
        <p className="ab-description">{String(configured.description || "회원에게 공개된 무료강의를 확인하세요.")}</p>
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
            href={user ? "#article-library" : "/signup?next=/articles"}
          >
            {user ? String(configured.memberCTA || "아티클 읽으러 가기") : String(configured.signupCTA || "회원가입하고 무료로 배우기")}
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
      (type === "전체" || a.category_id === type) &&
      t(a, "title").toLowerCase().includes(query.toLowerCase()),
  );
  const categories = (data.article_categories || []).filter(category => category.is_active !== false).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
  return (
    <div className="wrap">
      <ArticleBanner data={data} user={user} />
      <section className="article-library" id="article-library">
      <Heading
        title="일하는 방식을 바꾸는 인사이트"
        description="읽고, 배우고, 내 일에 적용해 보세요."
      />
      <div className="filter-row mt32">
        <div className="chips">
          {[{ id: "전체", name: "전체" }, ...categories.map(category => ({ id: String(category.id), name: t(category, "name") }))].map((x) => (
            <button
              key={x.id}
              className={"chip " + (x.id === type ? "active" : "")}
              aria-pressed={x.id === type}
              onClick={() => setType(x.id)}
            >
              {x.name}
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
      <div className="grid3 article-card-grid pb64">
        {filtered.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
        {!loading && !filtered.length && (
          <Empty title="조회된 아티클이 없습니다.">
            <div className="row center mt16"><Link className="btn primary" href="/classes?type=free">무료 클래스 보기</Link><Link className="btn" href="/classes">전체 클래스 보기</Link></div>
          </Empty>
        )}
      </div>
      </section>
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
  const stories = data.review_videos || [];
  const [selectedId, setSelectedId] = useState("");
  const featured = stories.find((story) => story.id === selectedId) || stories[0];
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
      <div className="section story-library">
        <div className="section-head"><div><div className="eyebrow">MORE STORIES</div><h2>다양한 실행 후기를 만나보세요.</h2><p>후기를 선택하면 위 영상과 이야기가 바뀝니다.</p></div><b>{stories.length}개의 고객 이야기</b></div>
        <div className="story-video-grid">
          {stories.map((s, index) => (
            <button className={"story-video-card " + (s.id === featured?.id ? "active" : "")} key={s.id} onClick={() => setSelectedId(s.id)}>
              <span className="story-video-thumb">{safeUrl(s.thumbnail_url) ? <img src={safeUrl(s.thumbnail_url)} alt="" /> : <><Play /><small>STORY {String(index + 1).padStart(2, "0")}</small></>}</span>
              <strong>{t(s, "title")}</strong>
              <span>{t(s, "reviewer_name")} · {t(s, "reviewer_role")}</span>
            </button>
          ))}
          {!loading && !stories.length && (
            <Empty title="공개된 고객 이야기가 없습니다.">
              <div className="row center mt16"><Link className="btn primary" href="/classes?type=free">무료 클래스 보기</Link><Link className="btn" href="/my/questions">문의하기</Link></div>
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
