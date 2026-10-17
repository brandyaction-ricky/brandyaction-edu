import Link from 'next/link';
import { archivedPrivacyPolicy, ARCHIVED_PRIVACY_VERSION, CURRENT_PRIVACY_DATE, defaultPolicies, upcomingPrivacyPolicy, UPCOMING_PRIVACY_VERSION } from '@/lib/legal-policies';
import { AdPreferences } from './ad-preferences';
import './privacy-policy.css';

export function PrivacyPolicy({ version }: { version?: string }) {
  const upcoming = version === UPCOMING_PRIVACY_VERSION;
  const archived = version === ARCHIVED_PRIVACY_VERSION;
  const copy = upcoming ? upcomingPrivacyPolicy : version === ARCHIVED_PRIVACY_VERSION ? archivedPrivacyPolicy : defaultPolicies.privacy;
  const sections = copy.split(/\n\n(?=\d+\. )/);
  return <div className="wrap"><article className="article-detail privacy-policy">
    <h1>개인정보 처리방침</h1>
    <aside className="privacy-revision-notice" aria-label={upcoming ? '시행 예정 개정안' : '개인정보처리방침 개정 안내'}>
      <span className="privacy-eyebrow">{upcoming ? '시행 예정 개정안' : archived ? '이전 처리방침' : '개정 안내'}</span>
      <h2>{upcoming ? '2026년 10월 20일 시행 예정안' : archived ? '2026년 8월 11일 버전' : `${CURRENT_PRIVACY_DATE}부터 시행합니다`}</h2>
      <p>{archived ? '이 페이지는 이전 처리방침입니다. 현재 적용 중인 내용은 아래 링크에서 확인할 수 있습니다.' : upcoming ? '앞으로 적용할 내용을 미리 안내합니다. 현재 적용 중인 처리방침은 아래 링크에서 확인할 수 있습니다.' : '네 선택 동의와 내부 팁스 맞춤 분석, Modal 국외 이전, Meta 구매 정보 전송을 각각 안내합니다. 선택하지 않아도 가입·결제·수강할 수 있어요.'}</p>
      <Link href={upcoming || archived ? '/policies/privacy' : `/policies/privacy/${UPCOMING_PRIVACY_VERSION}`}>
        {upcoming || archived ? '현재 적용 중인 처리방침 보기' : '바뀌는 처리방침 보기'} <span aria-hidden="true">→</span>
      </Link>
    </aside>
    <AdPreferences/>
    <div className="privacy-policy-copy">
      {sections.map((section, index) => <div className="reading-copy privacy-policy-section" key={index}>{section}</div>)}
    </div>
    <nav className="privacy-version-links" aria-label="처리방침 버전">
      <Link href="/policies/privacy">현재 적용 중인 처리방침</Link>
      <Link href={`/policies/privacy/${ARCHIVED_PRIVACY_VERSION}`}>2026년 8월 11일 버전 · N6 추가 안내 포함</Link>
      <Link href={`/policies/privacy/${UPCOMING_PRIVACY_VERSION}`}>2026년 10월 20일 시행 예정</Link>
    </nav>
  </article></div>;
}
