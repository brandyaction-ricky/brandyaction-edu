import { BookOpen, ChevronRight, FileText, LayoutDashboard, MessageCircle, Star, Target, Ticket, UserRound } from 'lucide-react';
import styles from '../review.module.css';

const learningLinks = [
  [LayoutDashboard, '마이페이지'], [BookOpen, '내 클래스'], [Target, '내 미션'], [MessageCircle, '질문·답변'],
] as const;
const accountLinks = [
  [FileText, '신청·주문 내역'], [Ticket, '내 쿠폰'], [Star, '내 상품 후기'], [UserRound, '회원 정보'],
] as const;

export default function MyReviewPage() {
  return (
    <main className={styles.memberPage}>
      <div className={styles.memberLayout}>
        <aside className={styles.memberSidebar} aria-label="샘플 마이페이지 메뉴">
          <div className={styles.memberProfile}><span className={styles.avatar}>샘</span><div><b>샘플 회원님</b><small>나의 배움과 실행</small></div></div>
          <span className={styles.navLabel}>나의 학습</span>
          {learningLinks.map(([Icon, label], index) => <div className={`${styles.memberNavItem} ${index === 0 ? styles.memberNavActive : ''}`} key={label}><Icon size={18}/>{label}</div>)}
          <span className={styles.navLabel}>내 계정</span>
          {accountLinks.map(([Icon, label]) => <div className={styles.memberNavItem} key={label}><Icon size={18}/>{label}</div>)}
        </aside>
        <div className={styles.memberMain}>
          <header className={styles.pageHeading}><div><h1>마이페이지</h1><p>샘플 회원님, 오늘의 학습과 실행을 이어가세요.</p></div><span className={styles.outlineControl}>회원 정보</span></header>
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
        </div>
      </div>
    </main>
  );
}
