import Link from 'next/link';
import { BarChart3, BookOpen, CalendarDays, ChevronDown, CreditCard, LayoutDashboard, MessageCircle, Package, Search, Settings, Target, UsersRound } from 'lucide-react';
import styles from '../review.module.css';

const groups = [
  { title: '클래스 관리', links: [
    { key: 'products', label: '상품·커리큘럼 관리', icon: Package },
    { key: 'cohorts', label: '기수·회차 관리', icon: CalendarDays },
    { key: 'learning', label: '학습 콘텐츠 관리', icon: BookOpen },
    { key: 'missions', label: '미션 관리', icon: Target },
    { key: 'member-missions', label: '회원 미션관리', icon: UsersRound },
  ] },
  { title: '고객 관리', links: [
    { key: 'members', label: '고객 관리', icon: UsersRound },
    { key: 'questions', label: '질문·답변', icon: MessageCircle },
    { key: 'coupons', label: '쿠폰 관리', icon: CreditCard },
  ] },
  { title: '주문·매출', links: [{ key: 'orders', label: '주문·결제 관리', icon: CreditCard }] },
  { title: '마케팅·설정', links: [
    { key: 'analytics', label: '성과 분석', icon: BarChart3 },
    { key: 'settings', label: '운영 설정', icon: Settings },
  ] },
] as const;
const links: { key: string; label: string }[] = groups.flatMap(group => group.links.map(({ key, label }) => ({ key, label })));
type AdminTab = 'home' | (typeof groups)[number]['links'][number]['key'];

const sampleRows: Record<Exclude<AdminTab, 'home'>, { columns: [string, string, string, string]; rows: [string, string, string, string][] }> = {
  products: { columns: ['상품', '유형', '상태', '최근 수정'], rows: [['AI 문샷 챌린지', '유료 클래스', '판매 중', '2026.10.04'], ['내 일 찾기', '무료 클래스', '공개', '2026.10.02']] },
  cohorts: { columns: ['기수', '상품', '기간', '상태'], rows: [['4기', 'AI 문샷 챌린지', '10.05 – 11.15', '진행 예정'], ['3기', 'AI 문샷 챌린지', '08.10 – 09.20', '종료']] },
  learning: { columns: ['주차', '콘텐츠', '유형', '공개'], rows: [['0주차', '온보딩 안내', '디지털 상품', '공개'], ['1주차', '고객 질문에서 주제 찾기', '동영상', '공개']] },
  missions: { columns: ['미션', '연결 주차', '제출', '상태'], rows: [['고객 질문 정리하기', '1주차', '8건', '운영 중'], ['콘텐츠 주제 선정', '2주차', '0건', '대기']] },
  'member-missions': { columns: ['회원', '미션', '제출일', '상태'], rows: [['샘플 회원 A', '고객 질문 정리하기', '10.04', '검토 필요'], ['샘플 회원 B', '실행 목표 세우기', '10.03', '승인 완료']] },
  members: { columns: ['회원', '이메일', '가입일', '상태'], rows: [['샘플 회원 A', 'member-a@example.invalid', '10.01', '활성'], ['샘플 회원 B', 'member-b@example.invalid', '09.28', '활성']] },
  questions: { columns: ['질문', '회원', '접수일', '상태'], rows: [['학습 자료 문의', '샘플 회원 A', '10.04', '답변 대기'], ['미션 제출 문의', '샘플 회원 B', '10.03', '답변 완료']] },
  coupons: { columns: ['쿠폰', '할인', '유효 기간', '상태'], rows: [['클래스 신청 감사', '10%', '10.31까지', '사용 가능'], ['첫 수강 혜택', '5%', '11.30까지', '사용 가능']] },
  orders: { columns: ['주문', '회원', '상품', '상태'], rows: [['SAMPLE-001', '샘플 회원 A', 'AI 문샷 챌린지', '결제 완료'], ['SAMPLE-002', '샘플 회원 B', 'AI 문샷 챌린지', '결제 실패']] },
  analytics: { columns: ['지표', '이번 주', '지난주', '변화'], rows: [['신규 신청', '8건', '6건', '+2건'], ['학습 완료', '12건', '10건', '+2건']] },
  settings: { columns: ['설정', '설명', '현재 값', '상태'], rows: [['결제 완료 안내', '완료 후 안내 발송', '꺼짐', '검수 예시'], ['운영 알림', '관리자 알림 설정', '켜짐', '검수 예시']] },
};

function OverviewSample() {
  return <>
    <section className={styles.adminMetrics} aria-label="운영 요약">
      {[['오늘 주문','8건','전일 대비 +2'],['검토 대기 미션','3건','우선 확인 필요'],['결제 실패','1건','예외 상태'],['미답변 질문','2건','답변 대기']].map(([label,value,note],index) => <div className={styles.adminMetric} key={label}><span>{label}</span><strong>{value}</strong><small className={index === 2 ? styles.alertText : ''}>{note}</small></div>)}
    </section>
    <section className={styles.adminPanel}><div className={styles.adminPanelHeading}><div><h2>처리가 필요한 항목</h2><p>예외 상태를 먼저 확인하세요.</p></div><span className={styles.outlineControl}>샘플 화면</span></div><div className={styles.quickFilters}><span className={styles.quickFilterActive}>전체 6</span><span>미션 검토 3</span><span>결제 실패 1</span><span>질문 2</span></div><div className={styles.adminTableWrap}><table className={styles.adminTable}><thead><tr><th>유형</th><th>대상</th><th>내용</th><th>상태</th><th>접수 시각</th></tr></thead><tbody><tr><td>미션</td><td>샘플 회원 A</td><td>1주차 미션 제출</td><td><span className={styles.warningBadge}>검토 필요</span></td><td>오늘 10:42</td></tr><tr><td>주문</td><td>샘플 회원 B</td><td>AI 문샷 챌린지</td><td><span className={styles.errorBadge}>결제 실패</span></td><td>오늘 09:35</td></tr><tr><td>질문</td><td>샘플 회원 C</td><td>학습 자료 문의</td><td><span className={styles.infoBadge}>답변 대기</span></td><td>어제 18:20</td></tr></tbody></table></div></section>
  </>;
}

function SectionSample({ tab }: { tab: Exclude<AdminTab, 'home'> }) {
  const data = sampleRows[tab];
  return <section className={styles.adminPanel}>
    <div className={styles.adminPanelHeading}><div><h2>목록</h2><p>실제 데이터가 아닌 레이아웃 검수용 예시입니다.</p></div><span className={styles.outlineControl}>샘플 화면</span></div>
    <div className={styles.filterSample}><span><Search size={16}/> 검색 영역</span><span>전체 상태 <ChevronDown size={14}/></span><span>최근 7일 <ChevronDown size={14}/></span></div>
    <div className={styles.adminTableWrap}><table className={styles.adminTable}><thead><tr>{data.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div>
  </section>;
}

export default async function AdminReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const requested = (await searchParams).tab;
  const tab: AdminTab = links.some(link => link.key === requested) ? requested as AdminTab : 'home';
  const title = tab === 'home' ? '운영 홈' : links.find(link => link.key === tab)?.label || '운영 홈';
  const allLinks = [{ key: 'home', label: '운영 홈' }, ...links];
  return <main className={styles.adminPage}>
    <aside className={styles.adminSidebar} aria-label="샘플 관리자 메뉴">
      <div className={styles.adminBrand}><b>Brandy Act<span>!</span>on</b><small>EDU / ADMIN</small></div>
      <div className={styles.workspace}>B <span>클래스 운영 워크스페이스</span></div>
      <Link href="/ui-review/admin" aria-current={tab === 'home' ? 'page' : undefined} className={`${styles.adminNavItem} ${tab === 'home' ? styles.adminNavActive : ''}`}><LayoutDashboard size={17}/> 운영 홈</Link>
      {groups.map(group => <div className={styles.adminNavGroup} key={group.title}><div className={styles.adminGroupTitle}>{group.title}<ChevronDown size={14}/></div>{group.links.map(({ key, icon: Icon, label }) => <Link href={`/ui-review/admin?tab=${key}`} aria-current={tab === key ? 'page' : undefined} className={`${styles.adminNavItem} ${tab === key ? styles.adminNavActive : ''}`} key={key}><Icon size={17}/>{label}</Link>)}</div>)}
      <div className={styles.adminIdentity}><span className={styles.avatar}>운</span><div><b>샘플 운영자</b><small>관리자 · 가상 계정</small></div></div>
    </aside>
    <div className={styles.adminMain}>
      <div className={styles.adminTopbar}>관리자 <span>/</span> {title} <div className={styles.topbarRight}><MessageCircle size={17}/> 질문함 <span className={styles.avatar}>운</span></div></div>
      <div className={styles.adminContent}>
        <header className={styles.adminHeading}><div><span className={styles.redEyebrow}>UI REVIEW · SAMPLE DATA</span><h1>{title}</h1><p>{tab === 'home' ? '오늘 확인할 학습·미션·주문 현황을 한눈에 살펴보세요.' : `${title} 화면의 레이아웃 검수용 예시입니다.`}</p></div><span className={styles.outlineControl}>샘플 화면</span></header>
        <nav className={styles.mobileReviewNav} aria-label="모바일 관리자 검수 메뉴">{allLinks.map(link => <Link key={link.key} href={link.key === 'home' ? '/ui-review/admin' : `/ui-review/admin?tab=${link.key}`} aria-current={tab === link.key ? 'page' : undefined}>{link.label}</Link>)}</nav>
        {tab === 'home' ? <OverviewSample/> : <SectionSample tab={tab}/>}
      </div>
    </div>
  </main>;
}
