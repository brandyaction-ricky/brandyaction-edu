"use client";

import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { type FreeCourseSettings, youtubeEmbedUrl } from "@/lib/articles";

export function ArticleFreeCourse({ settings, authenticated }: { settings: FreeCourseSettings; authenticated: boolean }) {
  const [active, setActive] = useState(0);
  const lesson = settings.lessons[active] || settings.lessons[0];
  const embed = useMemo(() => youtubeEmbedUrl(lesson?.videoUrl || ""), [lesson?.videoUrl]);

  return <section className="article-free-class" id="free-class">
    <div className="container free-class-grid">
      <div className="free-class-player">
        {authenticated ? embed ? <iframe src={embed} title={lesson.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="free-class-empty"><Play/><strong>{lesson.title}</strong><span>관리자가 영상 링크를 등록하면 이곳에서 바로 재생됩니다.</span></div> : <div className="free-class-lock"><span><LockKeyhole/></span><strong>회원가입하면 바로 시청</strong><p>가입 후 사이트에서 3강 전체를 볼 수 있어요.</p></div>}
      </div>
      <div className="free-class-copy">
        <span className="free-class-eyebrow">{settings.eyebrow}</span>
        <h2 className="ba-free-course-title">{settings.title}</h2>
        <p>{settings.description}</p>
        <div className="free-lesson-list">{settings.lessons.map((item, index) => <button type="button" className={authenticated && active === index ? "active" : ""} key={item.id} onClick={() => authenticated && setActive(index)} aria-pressed={authenticated && active === index}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong>{authenticated ? <Play/> : <Check/>}</button>)}</div>
        <strong className="free-signup-copy">{settings.signupCopy}</strong>
        {authenticated ? <Link className="free-class-cta" href="#article-list">아티클 읽으러 가기 <ArrowRight/></Link> : <><Link className="free-class-cta" href="/login?next=%2Farticles%23free-class">무료 회원가입하고 3강 보기 <ArrowRight/></Link><Link className="free-login-link" href="/login?next=%2Farticles%23free-class">이미 회원이세요? 로그인</Link></>}
      </div>
    </div>
  </section>;
}
