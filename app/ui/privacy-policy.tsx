import Link from 'next/link';
import { arrivalLiveReminderRetentionLabel } from '@/features/campus/arrival/live-reminder-consent';
import { archivedPrivacyPolicy, ARCHIVED_PRIVACY_VERSION, defaultPolicies, PRIVACY_REVISION_NOTICE, upcomingPrivacyPolicy, UPCOMING_PRIVACY_VERSION } from '@/lib/legal-policies';
import { AdPreferences } from './ad-preferences';
import './privacy-policy.css';

export function PrivacyPolicy({ version }: { version?: string }) {
  const upcoming = version === UPCOMING_PRIVACY_VERSION;
  const copy = upcoming ? upcomingPrivacyPolicy : version === ARCHIVED_PRIVACY_VERSION ? archivedPrivacyPolicy : defaultPolicies.privacy;
  const sections = copy.split(/\n\n(?=\d+\. )/);
  return <div className="wrap"><article className="article-detail privacy-policy">
    <h1>개인정보 처리방침</h1>
    <aside className="privacy-revision-notice" aria-label={upcoming ? '시행 예정 개정안' : '개인정보처리방침 개정 안내'}>
      <span className="privacy-eyebrow">{upcoming ? '시행 예정 개정안' : '개정 안내'}</span>
      <h2>개인정보처리방침 개정안 안내</h2>
      <p>{upcoming ? '이 페이지는 개정안입니다. 본문에 적힌 예정일만으로 자동 적용되지 않으며, 현재 적용 중인 처리방침은 아래 링크에서 확인할 수 있습니다.' : PRIVACY_REVISION_NOTICE}</p>
      <Link href={upcoming ? '/policies/privacy' : `/policies/privacy/${UPCOMING_PRIVACY_VERSION}`}>
        {upcoming ? '현재 적용 중인 처리방침 보기' : '바뀌는 처리방침 보기'} <span aria-hidden="true">→</span>
      </Link>
    </aside>
    <AdPreferences/>
    <div className="privacy-policy-copy">
      {!version && <section className="reading-copy privacy-policy-section" id="moonshot-live-reminder" aria-labelledby="moonshot-live-reminder-title">
        <h2 id="moonshot-live-reminder-title">문샷 무료 라이브 문자 알림</h2>
        <p>이용자가 수신에 동의하면 휴대폰 번호를 문샷 무료 라이브 안내 문자 발송에만 사용합니다. 본 라이브 참여 안내 1회와 앵콜 라이브 참여 안내 1회를 합해 최대 2회 발송합니다. 신청 시 동의 일시와 동의 문구 버전도 함께 기록합니다.</p>
        <p>브랜디액션은 신청 정보를 {arrivalLiveReminderRetentionLabel}에 파기합니다.</p>
        <p>문자 알림 신청은 선택입니다. 신청하지 않아도 체험과 무료 라이브에 참여할 수 있습니다.</p>
      </section>}
      {sections.map((section, index) => <div className="reading-copy privacy-policy-section" key={index}>
        {section}
        {!version && section.startsWith('5. 개인정보 처리업무의 위탁') && <p>문샷 무료 라이브 안내 문자 발송은 솔라피 주식회사에 위탁합니다. 솔라피는 수신번호를 포함한 발송 기록을 발송일로부터 1년간 보관합니다. <a href="https://solapi.com/notices/20261102-104008">솔라피의 발송 기록 보관 안내</a></p>}
      </div>)}
    </div>
    <nav className="privacy-version-links" aria-label="처리방침 버전">
      <Link href="/policies/privacy">현재 적용 중인 처리방침</Link>
      <Link href={`/policies/privacy/${ARCHIVED_PRIVACY_VERSION}`}>2026년 8월 11일 버전 · N6 추가 안내 포함</Link>
      <Link href={`/policies/privacy/${UPCOMING_PRIVACY_VERSION}`}>2026년 10월 20일 개정안 · 적용 전</Link>
    </nav>
  </article></div>;
}
