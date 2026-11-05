/** Preview policy only. Production must resolve identity and entitlement on the server. */
export type TourRole='guest'|'waiting'|'student'|'admin'|'expired';
export type TourRoom='live'|'welcome'|'study'|'office'|'library';
export const roleNames:Record<TourRole,string>={guest:'방문자',waiting:'개강 전 구매자',student:'수강생',admin:'관리자',expired:'수강권 종료'};
export const rooms:{id:TourRoom;name:string;tag:string;description:string;access:string}[]=[
 {id:'live',name:'문샷 라이브홀',tag:'OPEN CAMPUS',description:'동료를 만나고, AI 마케팅의 첫 실행을 체험해요.',access:'누구나 입장'},
 {id:'library',name:'문샷 자료실',tag:'OPEN LIBRARY',description:'무료 자료를 꺼내 보고, 유튜브 다시보기로 복습해요.',access:'누구나 입장'},
 {id:'welcome',name:'문샷 웰컴 존',tag:'FIRST STEP',description:'영상과 작은 퀴즈로 개강을 준비해요.',access:'구매자부터'},
 {id:'study',name:'문샷 공부방',tag:'LEARN TOGETHER',description:'수업을 실행하고, 동료와 결과를 나눠요.',access:'개강한 수강생'},
 {id:'office',name:'내 AI 사무실',tag:'MY AI OFFICE',description:'내 AI 직원에게 일을 맡기고 결과를 확인해요.',access:'개강한 수강생 · 개인 공간'},
];
export function canEnter(role:TourRole,room:TourRoom){return room==='live'||room==='library'||role==='admin'||role==='student'||role==='waiting'&&room==='welcome';}
export const oxQuestions=[
 {question:'AI가 만들어 준 답변은 확인 없이 바로 고객에게 보내도 된다.',answer:false,explanation:'AI도 틀릴 수 있어요. 사실·표현·개인정보를 확인한 뒤 사용하세요.'},
 {question:'AI에게 목표, 대상, 원하는 결과물 형태를 함께 알려 주면 도움이 된다.',answer:true,explanation:'구체적인 맥락이 있으면 내가 원하는 답변에 가까워져요.'},
 {question:'다른 사람의 비밀번호나 고객 개인정보를 AI 질문에 그대로 넣어도 된다.',answer:false,explanation:'개인정보는 지우거나 가상 예시로 바꿔서 질문하세요.'},
];
export const levelQuestions=[
 {question:'AI에게 콘텐츠 초안을 부탁할 때 가장 좋은 요청은?',options:['알아서 써 줘','대상 고객·목표·분량을 정해 주기','어려운 단어만 많이 사용하기'],answer:1},
 {question:'AI가 제시한 매출 통계의 출처가 없다면?',options:['숫자가 구체적이니 사용한다','그대로 고객에게 보낸다','원자료를 찾아 사실을 확인한다'],answer:2},
 {question:'고객 문의를 AI로 분류하고 싶다면 먼저 할 일은?',options:['개인정보를 제거한 예시와 분류 기준 준비','고객 목록 전체 업로드','결과 확인 없이 자동 발송'],answer:0},
 {question:'처음 업무 자동화를 만들 때 적절한 방법은?',options:['모든 업무를 한 번에 연결한다','작은 업무부터 시험하고 결과를 점검한다','실패 기록은 지운다'],answer:1},
];
export function levelResult(answers:number[]){const score=levelQuestions.reduce((n,q,i)=>n+Number(answers[i]===q.answer),0);return{score,title:score<=1?'기초부터 차근차근':score<=3?'작은 실습부터 시작':'실행 과제로 확장',recommendation:score<=1?'AI에게 목표와 맥락을 알려 주는 연습부터 시작해 보세요.':score<=3?'반복하는 업무 하나를 골라 작은 결과물을 만들어 보세요.':'실행 결과를 검증하고 개선하는 과정까지 연습해 보세요.'};}
