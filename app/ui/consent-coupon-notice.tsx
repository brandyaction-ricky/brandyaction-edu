import Link from 'next/link';
import type { RewardSnapshot } from '@/lib/consent-reward';
import styles from './optional-consent.module.css';

export function ConsentCouponNotice({ snapshot }: { snapshot: RewardSnapshot | null }) {
  if (snapshot?.awarded) return <p className={styles.help}>1만원 쿠폰을 발급받았어요. <Link href="/my/coupons">내 쿠폰 보기</Link></p>;
  if (!snapshot?.available) return null;
  return <div className={styles.benefit}>
    <strong>카카오톡 광고 수신 동의 시 1만원 쿠폰</strong>
    <p className={styles.help}>구매·학습 기록 분석이나 해외 이전 동의 없이도 받을 수 있어요. 이메일만 선택하면 쿠폰이 발급되지 않아요.</p>
    <p className={styles.help}>유료 강의 · 최소 결제금액 없음 · 발급 후 {snapshot.reward.days}일 · 계정당 1회</p>
  </div>;
}
