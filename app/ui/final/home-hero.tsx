"use client";

import { safeUrl, text as t, type Row } from "@/lib/platform";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

const DEFAULT_BANNER = {
  id: "default-main-banner",
  eyebrow: "BRANDYACTION EDU · LEARN TO ACT",
  title: "배운 것을,\n내 일의 성과로.",
  description:
    "AI와 마케팅을 아는 것에서 끝내지 마세요.\n내 업무에 적용하고, 실행한 결과를 남기는 교육.",
  linkLabel: "무료 클래스부터 시작하기",
  linkUrl: "/classes?type=free",
  imageUrl: "",
};

export type HomeHeroSlide = typeof DEFAULT_BANNER;

export function homeHeroSlides(banners: Row[], freeHref: string): HomeHeroSlide[] {
  if (!banners.length)
    return [{ ...DEFAULT_BANNER, linkUrl: freeHref || DEFAULT_BANNER.linkUrl }];

  return banners.map((banner) => {
    const eyebrow = t(banner, "eyebrow").trim();
    const title = t(banner, "title").trim();
    const description = t(banner, "description").trim();
    const linkLabel = t(banner, "link_label").trim();
    return {
      id: String(banner.id),
      eyebrow: eyebrow || DEFAULT_BANNER.eyebrow,
      title: title || DEFAULT_BANNER.title,
      description: description || DEFAULT_BANNER.description,
      linkLabel: linkLabel || DEFAULT_BANNER.linkLabel,
      linkUrl: safeUrl(banner.link_url) || freeHref || DEFAULT_BANNER.linkUrl,
      imageUrl: safeUrl(banner.image_url || banner.image_path),
    };
  });
}

function FeaturedFreeClass({ course, open }: { course?: Row; open: boolean }) {
  if (!course)
    return (
      <Link className="featured-offer" href="/classes">
        <div className="offer-content">
          <span className="eyebrow">YOUR NEXT ACTION</span>
          <h2>
            내 일에 필요한
            <br />
            다음 배움을
            <br />
            찾아보세요.
          </h2>
        </div>
        <div className="offer-bottom">
          클래스 둘러보기 <ArrowRight />
        </div>
      </Link>
    );

  return (
    <Link className="featured-offer" href={"/classes/" + t(course, "slug")}>
      <div className="offer-top">
        <span className="eyebrow">
          {open ? "NOW OPEN / FREE CLASS" : "FREE CLASS / 다음 모집 준비 중"}
        </span>
        <span className="offer-status">무료 클래스</span>
      </div>
      <div className="offer-content">
        <span className="offer-category">01 / 내 업무를 바꾸는 첫 클래스</span>
        <h2>{t(course, "title")}</h2>
        <p>{t(course, "summary")}</p>
      </div>
      <dl className="offer-spec">
        <div>
          <dt>일정</dt>
          <dd>{t(course, "schedule_label") || "상세페이지 확인"}</dd>
        </div>
        <div>
          <dt>진행</dt>
          <dd>{t(course, "duration_label") || "온라인 클래스"}</dd>
        </div>
        <div>
          <dt>참가비</dt>
          <dd>무료</dd>
        </div>
      </dl>
      <div className="offer-bottom">
        <span>클래스 자세히 보기</span>
        <ArrowRight />
      </div>
    </Link>
  );
}

export function HomeHero({
  banners,
  freeCourse,
  freeOpen,
}: {
  banners: Row[];
  freeCourse?: Row;
  freeOpen: boolean;
}) {
  const freeHref = freeCourse
    ? "/classes/" + t(freeCourse, "slug")
    : "/classes?type=free";
  const slides = homeHeroSlides(banners, freeHref);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [paused, setPaused] = useState(false);
  const active = slides[activeIndex % slides.length];
  const rotating = slides.length > 1;

  useEffect(() => {
    if (!rotating || hovered || focusWithin || paused) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setInterval(
      () => setActiveIndex((current) => (current + 1) % slides.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [focusWithin, hovered, paused, rotating, slides.length]);

  const move = (amount: number) =>
    setActiveIndex((current) =>
      (current + amount + slides.length) % slides.length,
    );

  return (
    <section
      className="brand-hero"
      aria-label="메인 배너"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      <div className="wrap">
        <div className="hero-grid">
          <div className="hero-copy hero-slide-copy" key={active.id}>
            {active.imageUrl && (
              <Image
                className="hero-banner-backdrop"
                src={active.imageUrl}
                alt=""
                aria-hidden="true"
                fill
                sizes="(max-width: 680px) 100vw, 55vw"
                unoptimized
              />
            )}
            <div className="hero-slide-content">
              <div className="eyebrow">{active.eyebrow}</div>
              <h1>{active.title}</h1>
              <p className="lead">{active.description}</p>
              <div className="hero-actions">
                <Link href={active.linkUrl} className="btn primary large">
                  {active.linkLabel} <ArrowRight />
                </Link>
              </div>
              <p className="hero-support">
                실행 중심 클래스 · 내 업무에 적용하는 학습
              </p>
              {rotating && (
                <div className="hero-slider-controls" aria-label="메인 배너 이동">
                  <button type="button" onClick={() => move(-1)} aria-label="이전 배너">
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaused((current) => !current)}
                    aria-label={paused ? "배너 자동 전환 재생" : "배너 자동 전환 일시정지"}
                    aria-pressed={paused}
                  >
                    {paused ? <Play /> : <Pause />}
                  </button>
                  <div className="hero-slider-dots">
                    {slides.map((slide, index) => (
                      <button
                        type="button"
                        key={slide.id}
                        className={index === activeIndex % slides.length ? "active" : ""}
                        aria-label={`${index + 1}번째 배너 보기: ${slide.title.replaceAll("\n", " ")}`}
                        aria-current={index === activeIndex % slides.length ? "true" : undefined}
                        onClick={() => setActiveIndex(index)}
                      />
                    ))}
                  </div>
                  <span aria-live={paused || focusWithin ? "polite" : "off"} aria-atomic="true">
                    {activeIndex % slides.length + 1} / {slides.length}
                  </span>
                  <button type="button" onClick={() => move(1)} aria-label="다음 배너">
                    <ArrowRight />
                  </button>
                </div>
              )}
            </div>
          </div>
          <FeaturedFreeClass course={freeCourse} open={freeOpen} />
        </div>
        <div className="hero-bottom">
          <span>지식을 넘어, 실행이 남는 학습.</span>
          <span>LEARN. APPLY. REPEAT.</span>
        </div>
      </div>
    </section>
  );
}
