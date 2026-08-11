"use client";

import Link from "next/link";
import { CircleAlert, RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="payment-result-page"><section><CircleAlert/><h1>페이지를 불러오지 못했습니다</h1><p>잠시 후 다시 시도해 주세요. 같은 문제가 반복되면 고객센터로 문의해 주세요.</p><button type="button" className="button button-dark" onClick={reset}><RefreshCw/> 다시 시도</button><Link href="/">메인으로 이동</Link></section></main>;
}
