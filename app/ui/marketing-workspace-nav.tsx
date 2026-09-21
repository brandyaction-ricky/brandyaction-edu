'use client';

import Link from 'next/link';
import './marketing-workspace.css';
import type { Section } from '@/lib/platform';

const destinations = [
  ['conversion', '모집 운영', '상품·카톡방 연결, 신청 이후 구매, 후속 초안'],
  ['landing', '광고·웨비나 성과', '광고 캠페인별 측정값과 실측 기록'],
  ['analytics', '전체 유입', '사이트 전체 유입과 행동 분석'],
  ['campaigns', '메시지 발송', '발송 캠페인과 실행 결과'],
  ['templates', '메시지 템플릿', '발송용 채널별 문구'],
  ['automations', '자동 메시지', '자동 발송 조건과 실행 관리'],
  ['seo', '검색 설정', '검색 노출과 인증 코드'],
  ['settings', '운영·측정 설정', '운영 규칙과 측정 연결'],
] as const;

export function MarketingWorkspaceNav({ current, available }: { current: string; available: Section[] }) {
  if (!destinations.some(([key]) => key === current)) return null;
  return <section className="marketing-workspace" aria-label="마케팅·전환 작업 공간">
    <strong>마케팅·전환</strong>
    <p>모집을 준비하고 성과를 확인한 뒤 필요한 후속 안내를 진행하세요.</p>
    <nav aria-label="마케팅·전환 메뉴">
      {destinations.filter(([key]) => available.some(section => section.key === key)).map(([key, label, description]) =>
        <Link key={key} href={`/admin/${key}`} aria-current={current === key ? 'page' : undefined} title={description}>{label}</Link>)}
    </nav>
    <p className="meta">모집의 신청 이후 구매와 광고 캠페인의 귀속 성과는 집계 기준이 다릅니다. 후속 초안은 발송 캠페인에 자동 등록되지 않습니다.</p>
  </section>;
}
