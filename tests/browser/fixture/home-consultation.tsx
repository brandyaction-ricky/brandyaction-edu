import { HomeConsultation } from '../../../app/ui/final/home-consultation';

export function HomeConsultationFixture() {
  return <main style={{minHeight:'160vh',padding:32,fontFamily:'sans-serif'}}>
    <p>상담 화면 미리보기 · 가상 답변이며 실제 AI 호출·대화 전송은 없습니다.</p>
    <h1>브랜디에듀</h1><p>배운 것을 실행으로 옮기는 클래스</p>
    <a href="#classes">클래스 둘러보기</a>
    <HomeConsultation channelUrl="https://pf.kakao.com/example/chat" respond={async question => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (question.includes('오류')) throw new Error('synthetic failure');
      if (question.includes('모르')) return {text:'확인된 안내 자료에서 답을 찾지 못했어요. 정확한 내용은 담당자가 확인해 드릴게요.',sources:[],needsStaff:true};
      return {text:'클래스별 일정과 학습 방식은 각 클래스 소개에서 확인하실 수 있어요. 관심 있는 클래스를 골라 안내를 확인해 주세요.',sources:[{title:'클래스 안내',url:'https://brandyaction-edu.com/classes'}]};
    }}/>
  </main>;
}
