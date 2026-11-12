import styles from './first-visit.module.css';

export function OfficeFirstVisit({onEmployees,onInbox}:{onEmployees:()=>void;onInbox:()=>void}){
 return <section className={styles.guide} aria-labelledby="office-first-title">
  <small>개인 AI 사무실 · 시작 안내</small>
  <h2 id="office-first-title">내 AI 직원에게 첫 업무 맡기기</h2>
  <p>수업에서 만든 봇에게 텔레그램으로 일을 맡기고, 여기서 진행 상황과 결과를 확인해요.</p>
  <ol>
   <li><strong>보고 스킬 설치하기</strong><span>‘내 AI 직원’의 ‘Aside 보고 스킬 받기’로 받은 폴더를 내 Aside 계정의 skills/user에 넣고, 직원(봇) 대화에 /new를 한 번 보내세요.</span></li>
   <li><strong>내 직원 등록하고 연결하기</strong><span>‘내 AI 직원’에 봇을 등록한 뒤(여러 명은 한 번에 등록), 봇 대화에 ‘캠퍼스 연결 준비’를 보내 받은 코드를 입력하세요. Aside 앱에 폴더 허용 요청이 뜨면 허용해 주세요.</span></li>
   <li><strong>텔레그램에서 일 맡기기</strong><span>보고 연결이 끝나면 ‘Telegram에서 업무 맡기기’를 눌러 “이번 주 수업 공지 초안을 써줘”라고 보내 보세요. 일상 대화와 일반 질문은 작업함에 남지 않아요.</span></li>
   <li><strong>작업함에서 결과 검토하기</strong><span>‘이 직원의 작업함 열기’에서 진행 상태와 결과를 확인하고 내 검토를 기록하세요. 승인·수정 요청은 내 기록으로만 남아요. 다시 맡길 때는 텔레그램으로 보내 주세요.</span></li>
  </ol>
  <div><button type="button" onClick={onEmployees}>직원 등록·연결하기</button><button type="button" onClick={onInbox}>내 작업함 열기</button></div>
 </section>;
}
