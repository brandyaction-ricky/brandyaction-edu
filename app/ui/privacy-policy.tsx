import Link from 'next/link';
import { defaultPolicies, POLICY_VERSION, PRIVACY_REVISION_NOTICE, upcomingPrivacyPolicy, UPCOMING_PRIVACY_VERSION } from '@/lib/legal-policies';
import { AdPreferences } from './ad-preferences';
import './privacy-policy.css';

export function PrivacyPolicy({ version }: { version?: string }) {
  const upcoming = version === UPCOMING_PRIVACY_VERSION;
  const copy = upcoming ? upcomingPrivacyPolicy : defaultPolicies.privacy;
  const sections = copy.split(/\n\n(?=\d+\. )/);
  return <div className="wrap"><article className="article-detail privacy-policy">
    <h1>개인정보 처리방침</h1>
    <aside className="privacy-revision-notice" aria-label={upcoming ? '시행 예정 개정안' : '개인정보처리방침 개정 안내'}>
      <span className="privacy-eyebrow">{upcoming ? '시행 예정 개정안' : '개정 안내'}</span>
      <h2>2026년 10월 20일에 바뀝니다</h2>
      <p>{upcoming ? '앞으로 적용할 내용을 미리 안내합니다. 현재 적용 중인 처리방침은 아래 링크에서 확인할 수 있습니다.' : PRIVACY_REVISION_NOTICE}</p>
      <Link href={upcoming ? '/policies/privacy' : `/policies/privacy/${UPCOMING_PRIVACY_VERSION}`}>
        {upcoming ? '현재 적용 중인 처리방침 보기' : '바뀌는 처리방침 보기'} <span aria-hidden="true">→</span>
      </Link>
    </aside>
    <AdPreferences/>
    <div className="privacy-policy-copy">
      {sections.map((section, index) => <div className="reading-copy privacy-policy-section" key={index}>{section}</div>)}
    </div>
    <nav className="privacy-version-links" aria-label="처리방침 버전">
      <Link href="/policies/privacy">현재 적용 중인 처리방침</Link>
      <Link href={`/policies/privacy/${POLICY_VERSION}`}>2026년 8월 11일 버전 · N6 추가 안내 포함</Link>
      <Link href={`/policies/privacy/${UPCOMING_PRIVACY_VERSION}`}>2026년 10월 20일 시행 예정</Link>
    </nav>
  </article></div>;
}
