'use client';

import Link from 'next/link';

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main style={{ maxWidth: 620, margin: '12vh auto', padding: 24, lineHeight: 1.8 }}>
    <h1>화면을 다시 불러와 주세요.</h1>
    <p role="alert">일시적인 오류로 화면을 표시하지 못했습니다. 결제 직후라면 중복 결제하지 말고 주문 내역을 먼저 확인해 주세요.</p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" onClick={retry} style={{ padding: '12px 20px', cursor: 'pointer' }}>다시 불러오기</button>
      <Link href="/my/orders">주문 내역 확인</Link><Link href="/">홈으로</Link>
    </div>
  </main>;
}
