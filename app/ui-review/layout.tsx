import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './review.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '화면 검수용 샘플 | BrandyAction EDU',
  robots: { index: false, follow: false },
};

export default function UiReviewLayout({ children }: { children: React.ReactNode }) {
  // Review screens are intentionally absent from production. They never read
  // member/admin APIs, and the real /my and /admin authorization stays intact.
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') notFound();

  return (
    <div className={styles.reviewRoot}>
      <div className={styles.reviewBar}>
        <div>
          <strong>UI 검수용 샘플</strong>
          <span>가상 데이터 · 저장/결제/발송 없음 · 실제 계정 화면 아님</span>
        </div>
        <nav aria-label="검수 화면 이동">
          <Link href="/ui-review/my">마이페이지</Link>
          <Link href="/ui-review/admin">관리자</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
