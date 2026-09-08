import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, LockKeyhole } from "lucide-react";
import { BrandHeader } from "@/app/components/brand-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { FreeContentAccess } from "@/app/components/free-content-access";
import "../../free-content.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "회원 무료 콘텐츠 | 브랜디액션 에듀" };
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

export default async function ResourcePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query, user] = await Promise.all([params, searchParams, getAuthenticatedUser()]);
  const admin = createAdminClient();
  // Only public descriptors are selected here. No file path, body, answer key or actual URL enters the HTML.
  const [course, lessons] = await Promise.all([
    admin.from("courses").select("title,summary,slug").eq("slug", slug).eq("status", "published").maybeSingle(),
    admin.from("curriculum_lessons").select("id,title,description,content_type,duration_label,display_order,curriculum_weeks!inner(title,display_order,is_published,courses!inner(slug,status))").eq("access_mode", "member").eq("is_published", true).eq("curriculum_weeks.is_published", true).eq("curriculum_weeks.courses.slug", slug).eq("curriculum_weeks.courses.status", "published").order("display_order").limit(500),
  ]);
  if (course.error || lessons.error) throw new Error("무료 콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  if (!course.data || !lessons.data?.length) notFound();
  const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"].flatMap((key) => typeof query[key] === "string" ? [[key, query[key].slice(0, 200)]] : []));
  const path = `/resources/${encodeURIComponent(slug)}${Object.keys(utm).length ? `?${new URLSearchParams(utm)}` : ""}`;
  const ordered = [...lessons.data].sort((a, b) => (one(a.curriculum_weeks)?.display_order || 0) - (one(b.curriculum_weeks)?.display_order || 0) || a.display_order - b.display_order);
  return <main><BrandHeader/><div className="free-content-page"><header><span className="free-eyebrow">MEMBER RESOURCES</span><h1>{course.data.title}</h1><p>{course.data.summary || "실행을 돕는 콘텐츠를 무료로 받아보세요."}</p><div className="free-trust"><span><CheckCircle2/>가입 회원 무료</span><span><LockKeyhole/>로그인 후 콘텐츠 제공</span></div></header><section className="free-resource-list" aria-label="무료 제공 콘텐츠">{ordered.map((lesson) => <article key={lesson.id}><div className="free-content-heading"><BookOpen/><div><small>{one(lesson.curriculum_weeks)?.title} · {({ vod: "영상", material: "자료", text: "텍스트", link: "링크" } as Record<string, string>)[lesson.content_type]}</small><h2>{lesson.title}</h2></div></div>{lesson.description && <p>{lesson.description}</p>}<FreeContentAccess lessonId={lesson.id} loggedIn={Boolean(user)} returnPath={path} utm={utm}/></article>)}</section><footer><p>자료 이용 내역은 내 계정과 연결해 관리됩니다. 자료 받기는 마케팅 수신 동의가 아니며, 수신 여부는 회원 설정에서 별도로 관리합니다.</p><Link href={`/classes/${encodeURIComponent(slug)}`}>전체 클래스 살펴보기 →</Link></footer></div></main>;
}
