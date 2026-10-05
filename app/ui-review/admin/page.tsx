import { BarChart3, BookOpen, CalendarDays, ChevronDown, CreditCard, LayoutDashboard, MessageCircle, Package, Search, Settings, Target, UsersRound } from 'lucide-react';
import styles from '../review.module.css';

const groups = [
  { title: '클래스 관리', links: [[Package,'상품·커리큘럼 관리'],[CalendarDays,'기수·회차 관리'],[BookOpen,'학습 콘텐츠 관리'],[Target,'미션 관리'],[UsersRound,'회원 미션관리']] },
  { title: '고객 관리', links: [[UsersRound,'고객 관리'],[MessageCircle,'질문·답변'],[CreditCard,'쿠폰 관리']] },
  { title: '주문·매출', links: [[CreditCard,'주문·결제 관리']] },
  { title: '마케팅·설정', links: [[BarChart3,'성과 분석'],[Settings,'운영 설정']] },
] as const;

export default function AdminReviewPage() {
  return (
    <main className={styles.adminPage}>
      <aside className={styles.adminSidebar} aria-label="샘플 관리자 메뉴">
        <div className={styles.adminBrand}><b>Brandy Act<span>!</span>on</b><small>EDU / ADMIN</small></div>
        <div className={styles.workspace}>B <span>클래스 운영 워크스페이스</span></div>
        <div className={`${styles.adminNavItem} ${styles.adminNavActive}`}><LayoutDashboard size={17}/> 운영 홈</div>
        {groups.map(group => <div className={styles.adminNavGroup} key={group.title}><div className={styles.adminGroupTitle}>{group.title}<ChevronDown size={14}/></div>{group.links.map(([Icon,label]) => <div className={styles.adminNavItem} key={label}><Icon size={17}/>{label}</div>)}</div>)}
        <div className={styles.adminIdentity}><span className={styles.avatar}>운</span><div><b>샘플 운영자</b><small>관리자 · 가상 계정</small></div></div>
      </aside>
      <div className={styles.adminMain}>
        <div className={styles.adminTopbar}>관리자 <span>/</span> 운영 홈 <div className={styles.topbarRight}><MessageCircle size={17}/> 질문함 <span className={styles.avatar}>운</span></div></div>
        <div className={styles.adminContent}>
          <header className={styles.adminHeading}><div><span className={styles.redEyebrow}>OPERATIONS OVERVIEW</span><h1>운영 홈</h1><p>오늘 확인할 학습·미션·주문 현황을 한눈에 살펴보세요.</p></div><span className={styles.outlineControl}>운영 가이드</span></header>
          <section className={styles.adminMetrics} aria-label="운영 요약">
            {[['오늘 주문','8건','전일 대비 +2'],['검토 대기 미션','3건','우선 확인 필요'],['결제 실패','1건','예외 상태'],['미답변 질문','2건','답변 대기']].map(([label,value,note],index) => <div className={styles.adminMetric} key={label}><span>{label}</span><strong>{value}</strong><small className={index === 2 ? styles.alertText : ''}>{note}</small></div>)}
          </section>
          <section className={styles.adminPanel}><div className={styles.adminPanelHeading}><div><h2>처리가 필요한 항목</h2><p>예외 상태를 먼저 확인하세요.</p></div><span className={styles.outlineControl}>전체 보기</span></div><div className={styles.quickFilters}><span className={styles.quickFilterActive}>전체 6</span><span>미션 검토 3</span><span>결제 실패 1</span><span>질문 2</span></div><div className={styles.adminTableWrap}><table className={styles.adminTable}><thead><tr><th>유형</th><th>대상</th><th>내용</th><th>상태</th><th>접수 시각</th></tr></thead><tbody><tr><td>미션</td><td>샘플 회원 A</td><td>1주차 미션 제출</td><td><span className={styles.warningBadge}>검토 필요</span></td><td>오늘 10:42</td></tr><tr><td>주문</td><td>샘플 회원 B</td><td>AI 문샷 챌린지</td><td><span className={styles.errorBadge}>결제 실패</span></td><td>오늘 09:35</td></tr><tr><td>질문</td><td>샘플 회원 C</td><td>학습 자료 문의</td><td><span className={styles.infoBadge}>답변 대기</span></td><td>어제 18:20</td></tr></tbody></table></div></section>
          <section className={styles.adminPanel}><div className={styles.adminPanelHeading}><div><h2>최근 주문</h2><p>실제 주문이 아닌 레이아웃 검수용 예시입니다.</p></div><span className={styles.outlineControl}>주문·결제 관리</span></div><div className={styles.filterSample}><span><Search size={16}/> 주문번호·회원명 검색</span><span>전체 상태 <ChevronDown size={14}/></span><span>최근 7일 <ChevronDown size={14}/></span></div></section>
        </div>
      </div>
    </main>
  );
}
