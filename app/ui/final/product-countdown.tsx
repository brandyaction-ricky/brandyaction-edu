'use client';

import { useEffect, useState } from 'react';
import { recruitmentRemaining } from '@/lib/product-countdown';

export function RecruitmentCountdown({ endAt }: { endAt: unknown }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const remaining = now === null ? undefined : recruitmentRemaining(endAt, now);
  return <section className="product-countdown" aria-label="모집 마감 안내">
    <span>{remaining?.expired ? '모집 마감' : '모집 마감까지'}</span>
    <strong role="timer" aria-live="off">{remaining === undefined ? '시간 확인 중' : remaining === null ? '마감 일정 준비 중' : remaining.expired ? '신청 기간이 종료되었습니다.' : remaining.text}</strong>
    {remaining && typeof endAt === 'string' && <small>한국 시간 기준 · <time dateTime={endAt}>{new Date(endAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</time> 마감</small>}
  </section>;
}
