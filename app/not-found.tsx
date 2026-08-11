import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFoundPage() {
  return <main className="payment-result-page"><section><SearchX/><h1>페이지를 찾을 수 없습니다</h1><p>주소가 변경됐거나 더 이상 공개되지 않은 페이지입니다.</p><Link className="button button-dark" href="/classes">클래스 목록으로</Link><Link href="/">메인으로 이동</Link></section></main>;
}
