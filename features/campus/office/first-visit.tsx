import styles from './first-visit.module.css';

export function OfficeFirstVisit({onEmployees,onInbox}:{onEmployees:()=>void;onInbox:()=>void}){
 return <section className={styles.guide} aria-labelledby="office-first-title">
  <small>개인 AI 사무실 · 시작 안내</small>
  <h2 id="office-first-title">내 AI 직원에게 첫 업무 맡기기</h2>
  <p>수업에서 만든 봇에게 텔레그램으로 일을 맡기고, 여기서 진행 상황과 결과를 확인해요.</p>
  <ol>
   <li><strong>내 직원 연결하기</strong><span>‘내 AI 직원’에 봇 주소를 등록하고 ‘직원 보고 연결’을 마치세요. 자리에 배치하지 않아도 보고를 받을 수 있어요.</span></li>
   <li><strong>텔레그램에서 일 맡기기</strong><span>보고 연결이 끝나면 ‘Telegram에서 업무 맡기기’를 눌러 “이번 주 수업 공지 초안을 써줘”라고 보내 보세요. 일상 대화와 일반 질문은 작업함에 남지 않아요.</span></li>
   <li><strong>작업함에서 결과 검토하기</strong><span>‘이 직원의 작업함 열기’에서 맡긴 일의 진행 상태와 결과를 확인하세요. 업무를 눌러 초안을 읽고 승인하거나 수정을 요청하세요.</span></li>
  </ol>
  <div><button type="button" onClick={onEmployees}>직원 등록·연결하기</button><button type="button" onClick={onInbox}>내 작업함 열기</button></div>
 </section>;
}
