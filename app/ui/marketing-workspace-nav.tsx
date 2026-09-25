'use client';

import Link, { useLinkStatus } from 'next/link';
import { marketingContextHref, recruitmentContext } from '@/lib/marketing-context';
import './marketing-workspace.css';
import type { Section } from '@/lib/platform';

const destinations = [
  ['conversion', '모집·문의 관리', '모집별 카톡방, 문의 내용, 구매 기록 관리'],
  ['landing', '광고·무료강의 결과', '광고별 방문과 신청 숫자 확인'],
  ['analytics', '사이트 방문 결과', '사이트 전체 방문과 클릭 확인'],
  ['campaigns', '안내 문자 보내기', '회원에게 보낼 문자 예약'],
  ['templates', '안내 문구 만들기', '문자와 알림톡 문구 관리'],
  ['automations', '자동 안내 설정', '조건에 따라 나갈 안내 관리'],
  ['seo', '검색 정보 바꾸기', '검색 제목과 사이트 확인 정보'],
  ['settings', '사이트 운영 설정', '문의처, 방문 기록, 카카오 연결'],
] as const;

const guides: Record<string, { heading: string; summary: string; steps: readonly string[]; caution?: string }> = {
  conversion: {
    heading: '모집 정보와 카톡 문의를 여기서 관리해요',
    summary: '모집별 카톡방 정보를 확인하거나, 카톡 문의를 붙여넣고 답변을 준비할 수 있어요.',
    steps: ['문의 내용을 붙여넣으려면 ‘구매 전 문의 검토’를 고르세요. 카톡방이나 모집 정보를 보려면 ‘모집 설정·구매·후속 안내’를 고르세요.', '모집 정보에서는 코드(예: moonshot-4)를 넣고 ‘모집 방 설정 불러오기’를 눌러요. 문의 검토에서는 받은 내용을 붙여넣고 문의 이유와 답변 예시를 읽어요.', '확인한 내용을 저장하세요. 결제 여부는 주문 기록을 직원이 직접 확인한 뒤 표시하세요.'],
    caution: '자동으로 나눈 결과는 참고예요. 고객에게 보낼 답변은 직원이 확인하세요.',
  },
  landing: {
    heading: '광고나 무료강의 결과를 확인해요',
    summary: '선택한 광고나 강의로 방문·신청이 얼마나 있었는지 봅니다.',
    steps: ['위쪽에서 확인할 광고나 강의를 고르세요.', '날짜를 정하고 화면의 숫자를 확인하세요.', '실제 숫자를 따로 알고 있다면 기록을 추가하세요.'],
    caution: '숫자가 비어 있으면 아직 받은 기록이 없는 것입니다. 0명이라는 뜻과 다를 수 있어요.',
  },
  analytics: {
    heading: '사이트 방문과 클릭을 확인해요',
    summary: '정한 기간 동안 어떤 페이지를 몇 번 봤는지 확인합니다.',
    steps: ['시작 날짜와 끝 날짜를 고르세요.', '새로고침을 눌러 숫자를 불러오세요.', '표에서 많이 본 페이지와 버튼 클릭을 살펴보세요.'],
    caution: '방문 횟수는 사람 수와 다를 수 있고, 이 숫자만으로 광고 효과를 정할 수는 없어요.',
  },
  campaigns: {
    heading: '회원에게 보낼 안내를 예약해요',
    summary: '문구와 받을 사람, 보낼 시간을 정한 뒤 실제 안내 발송을 예약합니다.',
    steps: ['캠페인 이름과 보낼 문구를 고르세요.', '받을 사람과 보낼 시간을 확인하세요.', '모든 내용이 맞을 때만 예약을 누르세요.'],
    caution: '예약하면 실제 회원에게 문자나 알림톡이 갈 수 있어요. 시험 발송은 설정된 시험 번호에 문자 한 건을 보냅니다.',
  },
  templates: {
    heading: '반복해서 쓸 안내 문구를 만들어요',
    summary: '문구를 저장해 두면 캠페인이나 자동 안내를 만들 때 다시 고를 수 있습니다.',
    steps: ['문구 이름과 보낼 방법을 정하세요.', '안내 내용을 쓰고 누구에게 쓸 문구인지 확인하세요.', '저장하기를 눌러 목록에 추가하세요.'],
    caution: '카카오 알림톡은 결제·예약 안내에 씁니다. 모집이나 할인 안내는 문자로 설정하세요.',
  },
  automations: {
    heading: '조건에 따라 자동으로 나갈 안내를 정해요',
    summary: '가입·결제 같은 일이 생겼을 때 어떤 문구를 언제 보낼지 정합니다.',
    steps: ['보낼 문구와 시작 조건을 고르세요.', '필요하면 기다릴 시간과 해당 상품을 정하세요.', '내용이 맞는지 확인한 뒤에만 자동 실행을 켜고 저장하세요.'],
    caution: '자동 실행을 켜면 조건에 맞는 회원에게 안내가 나갈 수 있어요.',
  },
  seo: {
    heading: '사이트가 검색될 때 보이는 내용을 바꿔요',
    summary: '검색 결과에 나오는 사이트 이름과 설명을 관리합니다.',
    steps: ['검색·공유, 소유 확인, 측정 코드 중 할 일을 고르세요.', '바꿀 내용을 확인하고 필요한 칸만 입력하세요.', '저장 버튼을 눌러 바뀐 내용을 적용하세요.'],
    caution: '모르는 인증 문구나 코드는 임의로 넣지 말고 담당자에게 확인하세요.',
  },
  settings: {
    heading: '사이트 문의처와 운영 연결을 관리해요',
    summary: '문의받을 주소, 방문 기록, 카카오 가입 연결을 설정합니다.',
    steps: ['바꿀 설정의 제목을 찾아보세요.', '입력한 주소나 연결 정보가 맞는지 확인하세요.', '해당 설정 아래 저장 버튼을 눌러 반영하세요.'],
    caution: '방문 기록이나 카카오 설정을 켜기 전에는 안내 문구와 입력값을 먼저 확인하세요.',
  },
};

function NavigationHint() {
  const { pending } = useLinkStatus();
  return <span className="marketing-navigation-hint" data-pending={pending} role="status" aria-label={pending ? '화면 이동 중' : undefined} />;
}

export function MarketingWorkspaceNav({ current, available, search = "", prefetchSection }: { current: string; available: Section[]; search?: string; prefetchSection: (section: string) => void }) {
  if (!destinations.some(([key]) => key === current)) return null;
  const guide = guides[current];
  const selectedRecruitment = recruitmentContext(new URLSearchParams(search).get("recruitment"));

  return <section className="marketing-workspace" aria-label="마케팅·전환 작업 공간">
    <strong>마케팅·전환</strong>
    <p>아래에서 할 일을 고르면, 그 화면에서 무엇을 하면 되는지 알려드려요.</p>
    {selectedRecruitment && <p>지금 보고 있는 모집: <strong>{selectedRecruitment}</strong></p>}
    <nav aria-label="마케팅·전환 메뉴">
      {destinations.filter(([key]) => available.some(section => section.key === key)).map(([key, label, description]) =>
        <Link key={key} prefetch={true} scroll={false} href={key === "conversion" || key === "landing" ? marketingContextHref(key, search) : "/admin/" + key} aria-current={current === key ? 'page' : undefined} title={description} onPointerEnter={() => prefetchSection(key)} onFocus={() => prefetchSection(key)}>{label}<NavigationHint /></Link>)}
    </nav>
    {guide && <section className="marketing-workspace-guide" aria-labelledby="marketing-workspace-guide-title">
      <h2 id="marketing-workspace-guide-title">{guide.heading}</h2>
      <p>{guide.summary}</p>
      <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {guide.caution && <p className="marketing-workspace-guide-caution">{guide.caution}</p>}
    </section>}
    <p className="meta">광고 결과와 문의 뒤의 결제는 따로 확인합니다. 문의 화면의 답변 초안은 발송 예약에 자동으로 들어가지 않으니, 보낼 문구는 다시 확인해 주세요.</p>
  </section>;
}
