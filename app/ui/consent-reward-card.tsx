'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift } from 'lucide-react';
import type { RewardSnapshot } from '@/lib/consent-reward';
import styles from './consent-reward-card.module.css';

/** Signup and profile own the choices; the dashboard only links to their management. */
export function ConsentRewardCard({ memberKey }: { memberKey: string }) {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [hidden, setHidden] = useState(false);
  const key = `edu-consent-reward-dismissed:${memberKey}`;
  useEffect(() => {
    const controller = new AbortController();
    try { if (Number(localStorage.getItem(key)) > Date.now()) return; } catch { /* Storage is optional. */ }
    void fetch('/api/account/consent-reward', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const body = await response.json();
      if (!controller.signal.aborted) setSnapshot(body);
    }).catch(() => { /* A benefit notice must never interrupt learning. */ });
    return () => controller.abort();
  }, [key]);
  if (hidden || !snapshot?.available || snapshot.handled || snapshot.awarded) return null;
  return <section className={styles.card} aria-label="쿠폰 혜택 안내">
    <div className={styles.heading}><Gift size={24} aria-hidden="true"/><div><h2>선택 동의와 쿠폰을 한곳에서 관리해요</h2><p>카카오톡 광고 수신에 동의하면 1만원 쿠폰을 받을 수 있어요. 분석·해외 이전 동의는 필요하지 않아요.</p></div></div>
    <div className={styles.success}>
      <Link href="/my/profile#consent-settings">선택 동의·쿠폰 확인</Link>
      <button type="button" onClick={() => {
        try { localStorage.setItem(key, String(Date.now() + 30 * 86400000)); } catch { /* No consent mutation. */ }
        setHidden(true);
      }}>지금은 괜찮아요</button>
    </div>
  </section>;
}
