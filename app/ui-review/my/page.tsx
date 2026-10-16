import Link from 'next/link';
import { BookOpen, ChevronRight, FileText, LayoutDashboard, MessageCircle, Star, Target, Ticket, UserRound } from 'lucide-react';
import styles from '../review.module.css';

const learningLinks = [
  { key: 'dashboard', label: '마이페이지', icon: LayoutDashboard },
  { key: 'classes', label: '내 클래스', icon: BookOpen },
  { key: 'missions', label: '내 미션', icon: Target },
  { key: 'questions', label: '질문·답변', icon: MessageCircle },
] as const;
const accountLinks = [
  { key: 'orders', label: '신청·주문 내역', icon: FileText },
  { key: 'coupons', label: '내 쿠폰', icon: Ticket },
  { key: 'reviews', label: '내 상품 후기', icon: Star },
  { key: 'profile', label: '회원 정보', icon: UserRound },
] as const;
const links = [...learningLinks, ...accountLinks];
type MyTab = (typeof links)[number]['key'];

function DashboardSample() {
  return <>
    <section className={styles.learningCard} aria-labelledby="sample-learning-title">
      <div className={styles.cardTop}><div><span className={styles.redEyebrow}>나의 학습</span><h2 id="sample-learning-title">AI 문샷 챌린지</h2><p>4기 · 현재 공개된 학습을 이어가세요.</p></div><span className={styles.primaryControl}>이어서 학습하기 <ChevronRight size={18}/></span></div>
      <div className={styles.nextLesson}><small>다음 학습</small><b>DAY 02 · 고객 질문에서 콘텐츠 주제 찾기</b><span>이어보기를 눌러 학습을 시작하세요.</span></div>
      <div className={styles.weekSteps}><div><span>W0</span><b>온보딩</b><small>1 / 1개 완료</small></div><div><span>W1</span><b>고객 질문 이해</b><small>1 / 4개 완료</small></div><div><span>W2</span><b>콘텐츠 기획</b><small>공개 예정</small></div></div>
    </section>
    <section className={styles.stats} aria-label="학습 현황">
      {[['수강 중','1개','클래스별 학습 이어가기'],['학습 완료','2개','완료한 학습 기록'],['검토 대기','1건','보완 필요 0건'],['사용 가능 쿠폰','1개','결제 전에 확인하기']].map(([label,value,note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
    </section>
    <div className={styles.memberBottom}>
      <section className={styles.simplePanel}><div className={styles.panelTitle}><h2>지금 할 일</h2><Target size={20}/></div><div className={styles.taskRow}><span className={styles.taskIcon}><Target size={18}/></span><div><b>1주차 미션 제출하기</b><p>오늘의 학습을 내 업무에 적용해 보세요.</p></div><ChevronRight size={18}/></div><div className={styles.taskRow}><span className={styles.taskIcon}><MessageCircle size={18}/></span><div><b>운영팀 답변 확인하기</b><p>학습 중 남긴 질문의 답변을 확인해 보세요.</p></div><ChevronRight size={18}/></div></section>
      <section className={styles.simplePanel}><div className={styles.panelTitle}><h2>학습 일정</h2><BookOpen size={20}/></div><p className={styles.eventDate}>10월 5일 월요일</p><b>1주차 학습 시작</b><p>학습 자료를 확인하고 미션을 진행해 보세요.</p></section>
    </div>
  </>;
}

function MemberTabSample({ tab }: { tab: Exclude<MyTab, 'dashboard'> }) {
  if (tab === 'classes') return <><div className={styles.reviewTabs}><span className={styles.reviewTabActive}>수강 중 1</span><span>수강 완료 0</span></div><section className={styles.simplePanel}><span className={styles.redEyebrow}>수강 중 · 4기</span><h2 className={styles.sampleTitle}>AI 문샷 챌린지</h2><p>현재 공개된 학습을 이어가세요.</p><div className={styles.sampleProgress}><span style={{width:'25%'}}/></div><small>2 / 8개 학습 완료</small></section></>;
  if (tab === 'missions') return <><div className={styles.stats}><div><span>진행 중</span><strong>2건</strong><small>이번 주 미션</small></div><div><span>검토 대기</span><strong>1건</strong><small>운영팀 확인 중</small></div><div><span>승인 완료</span><strong>3건</strong><small>실행 기록</small></div><div><span>보완 요청</span><strong>0건</strong><small>추가 작업 없음</small></div></div><section className={styles.simplePanel}><h2>나의 미션</h2>{[['1주차','고객 질문에서 콘텐츠 주제 찾기','제출 전'],['0주차','나의 실행 목표 정리하기','검토 대기']].map(([week,title,status]) => <div className={styles.taskRow} key={title}><span className={styles.taskIcon}><Target size={18}/></span><div><small>{week}</small><b>{title}</b></div><span className={styles.mutedBadge}>{status}</span></div>)}</section></>;
  if (tab === 'questions') return <section className={styles.simplePanel}><h2>질문·답변</h2><p>학습 중 남긴 질문과 운영팀의 답변을 확인합니다.</p>{[['답변 완료','학습 자료는 어디에서 받을 수 있나요?'],['답변 대기','미션 제출 기한을 확인하고 싶어요']].map(([status,title]) => <div className={styles.taskRow} key={title}><span className={styles.taskIcon}><MessageCircle size={18}/></span><div><small>{status}</small><b>{title}</b></div><ChevronRight size={18}/></div>)}</section>;
  if (tab === 'orders') return <section className={styles.simplePanel}><h2>신청·주문 내역</h2><p>클래스 신청과 결제 상태를 확인합니다.</p><div className={styles.sampleOrder}><span>2026.10.01 · 샘플 주문</span><h3>AI 문샷 챌린지 4기</h3><strong>결제 완료 · 1,650,000원</strong></div></section>;
  if (tab === 'coupons') return <section className={styles.simplePanel}><h2>내 쿠폰</h2><p>사용할 수 있는 할인 혜택을 확인합니다.</p><div className={styles.sampleCoupon}><strong>10% 할인</strong><b>클래스 신청 감사 쿠폰</b><small>사용 가능 · 2026.10.31까지</small></div></section>;
  if (tab === 'reviews') return <section className={styles.simplePanel}><h2>내 상품 후기</h2><p>수강 후 작성한 후기를 확인합니다.</p><div className={styles.taskRow}><span className={styles.taskIcon}><Star size={18}/></span><div><small>작성 완료 · 2026.09.28</small><b>배운 내용을 바로 실행할 수 있었어요.</b></div><ChevronRight size={18}/></div></section>;
  return <section className={styles.simplePanel}><h2>회원 정보</h2><p>계정에 등록된 정보를 관리합니다. 아래 값은 실제 회원 정보가 아닙니다.</p><div className={styles.sampleFields}><div><span>이름</span><b>샘플 회원</b></div><div><span>이메일</span><b>sample@example.invalid</b></div><div><span>연락처</span><b>표시하지 않음</b></div></div></section>;
}

export default async function MyReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const requested = (await searchParams).tab;
  const tab: MyTab = links.some(link => link.key === requested) ? requested as MyTab : 'dashboard';
  const title = links.find(link => link.key === tab)?.label || '마이페이지';
  return <main className={styles.memberPage}>
    <div className={styles.memberLayout}>
      <aside className={styles.memberSidebar} aria-label="샘플 마이페이지 메뉴">
        <div className={styles.memberProfile}><span className={styles.avatar}>샘</span><div><b>샘플 회원님</b><small>나의 배움과 실행</small></div></div>
        <span className={styles.navLabel}>나의 학습</span>
        {learningLinks.map(({ key, label, icon: Icon }) => <Link href={key === 'dashboard' ? '/ui-review/my' : `/ui-review/my?tab=${key}`} aria-current={tab === key ? 'page' : undefined} className={`${styles.memberNavItem} ${tab === key ? styles.memberNavActive : ''}`} key={key}><Icon size={18}/>{label}</Link>)}
        <span className={styles.navLabel}>내 계정</span>
        {accountLinks.map(({ key, label, icon: Icon }) => <Link href={`/ui-review/my?tab=${key}`} aria-current={tab === key ? 'page' : undefined} className={`${styles.memberNavItem} ${tab === key ? styles.memberNavActive : ''}`} key={key}><Icon size={18}/>{label}</Link>)}
      </aside>
      <div className={styles.memberMain}>
        <header className={styles.pageHeading}><div><h1>{title}</h1><p>{tab === 'dashboard' ? '샘플 회원님, 오늘의 학습과 실행을 이어가세요.' : `${title} 화면의 레이아웃 검수용 예시입니다.`}</p></div><span className={styles.outlineControl}>샘플 화면</span></header>
        <nav className={styles.mobileReviewNav} aria-label="모바일 마이페이지 검수 메뉴">{links.map(link => <Link key={link.key} href={link.key === 'dashboard' ? '/ui-review/my' : `/ui-review/my?tab=${link.key}`} aria-current={tab === link.key ? 'page' : undefined}>{link.label}</Link>)}</nav>
        {tab === 'dashboard' ? <DashboardSample/> : <MemberTabSample tab={tab}/>}
      </div>
    </div>
  </main>;
}
