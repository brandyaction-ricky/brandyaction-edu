"use client";
import { Download, LockKeyhole } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
type Resource = { id: string; title: string; description: string; accessMode?: "member" | "enrolled" };
export function ClassResourceDownloads({ resources, checkoutHref }: { resources: Resource[]; checkoutHref: string }) {
  const [busyId, setBusyId] = useState("");
  const [errors, setErrors] = useState<Record<string, { message: string; login?: string; enroll?: boolean }>>({});
  const [received, setReceived] = useState<string[]>([]);
  const download = async (id: string) => {
    if (busyId) return;
    setBusyId(id); setErrors((current) => ({ ...current, [id]: { message: "" } }));
    try {
      const params = new URLSearchParams(window.location.search);
      const attribution = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"].map((key) => [key, params.get(key) || ""]));
      const response = await fetch("/api/resources/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: id, ...attribution }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        const next = `${window.location.pathname}${window.location.search}#free-resources`;
        setErrors((current) => ({ ...current, [id]: { message: "로그인하면 이 페이지에서 자료를 받을 수 있습니다.", login: `/login?next=${encodeURIComponent(next)}` } })); return;
      }
      if (result.code === "enrollment_required") { setErrors((current) => ({ ...current, [id]: { message: "무료 수강 신청을 완료한 뒤 자료를 받을 수 있습니다.", enroll: true } })); return; }
      if (!response.ok || result.content?.kind !== "material" || !result.content.url) throw new Error(result.error || "자료를 준비 중입니다.");
      const anchor = document.createElement("a"); anchor.href = result.content.url; anchor.download = result.content.name || "무료 자료";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setReceived((current) => [...new Set([...current, id])]);
    } catch (reason) { setErrors((current) => ({ ...current, [id]: { message: reason instanceof Error ? reason.message : "다운로드를 시작하지 못했습니다. 다시 시도해 주세요." } })); }
    finally { setBusyId(""); }
  };
  return <section id="free-resources" className="free-class-section"><div className="free-section-title"><h2>무료 자료</h2><span>{resources.length}개</span></div><p className="free-resource-help">{resources.some((resource) => resource.accessMode !== "member") ? "회원 무료 자료는 로그인 후, 수강생 자료는 무료 수강 신청 후 내려받을 수 있습니다." : "로그인하고 실습 자료를 무료로 내려받으세요."}</p><div className="class-resource-list">{resources.map((resource) => <article key={resource.id}><div className="class-resource-summary"><Download/><div><h3>{resource.title}</h3>{resource.description && <p>{resource.description}</p>}<small>{resource.accessMode === "member" ? "회원 무료 자료" : "무료 수강생 자료"}</small></div><button onClick={() => void download(resource.id)} disabled={Boolean(busyId)} aria-label={`${resource.title} 다운로드`}>{busyId === resource.id ? "준비 중…" : received.includes(resource.id) ? "다시 받기" : "다운로드"}</button></div>{errors[resource.id]?.message && <div className="class-resource-notice" role="status"><p>{errors[resource.id].message}</p>{errors[resource.id].login && <Link href={errors[resource.id].login!}><LockKeyhole/>로그인하고 자료 받기</Link>}{errors[resource.id].enroll && <Link href={checkoutHref}>무료 수강 신청하기</Link>}</div>}</article>)}</div></section>;
}
