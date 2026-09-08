"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, ExternalLink, LockKeyhole } from "lucide-react";

type Delivery = { kind: string; url?: string; embedUrl?: string | null; body?: string; name?: string };
export function FreeContentAccess({ lessonId, loggedIn, returnPath, utm }: { lessonId: string; loggedIn: boolean; returnPath: string; utm: Record<string, string> }) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const receive = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/resources/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, ...utm }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "콘텐츠를 준비하지 못했습니다.");
      setDelivery(result.content);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "네트워크 연결을 확인해 주세요."); }
    finally { setBusy(false); }
  };
  if (!loggedIn) return <Link className="free-content-button" href={`/login?next=${encodeURIComponent(returnPath)}`}><LockKeyhole/>가입·로그인하고 무료로 받기</Link>;
  return <div className="free-content-delivery">{delivery && <div className="free-content-result">{delivery.body && <div className="free-content-text">{delivery.body}</div>}{delivery.embedUrl && <iframe src={delivery.embedUrl} title="무료 학습 영상" allowFullScreen/>}{delivery.url && <a className="free-content-button" href={delivery.url} target="_blank" rel="noopener noreferrer">{delivery.kind === "material" ? <Download/> : <ExternalLink/>}{delivery.kind === "material" ? delivery.name || "자료 다운로드" : "콘텐츠 열기"}</a>}{delivery.kind === "material" && <small>다운로드 주소는 5분 동안 유효합니다. 만료되면 아래 버튼으로 다시 받으세요.</small>}</div>}<button className={delivery ? "free-content-refresh" : "free-content-button"} disabled={busy} onClick={receive}>{busy ? "콘텐츠 준비 중…" : delivery ? "콘텐츠 다시 받기" : "무료 콘텐츠 받기"}</button>{error && <p className="free-content-error" role="alert">{error}</p>}</div>;
}
