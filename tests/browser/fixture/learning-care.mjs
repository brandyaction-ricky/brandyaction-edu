// Disposable local UI fixture. Never imported by the production application.
const asOf='2026-10-08T08:00:00Z';
const learning=Array.from({length:4},(_,i)=>({lessonId:'11112222-2222-4222-8222-'+String(i).padStart(12,'0'),title:['나의 첫 AI 팀 만들기','업무 기록 정리하기','반복 업무 찾아보기','실행 결과 공유하기'][i],week:1,day:i+1,track:'learning',state:'completed',published:true,completedAt:'2026-10-07T08:00:00Z',submittedAt:null,reviewedAt:null,submissionId:null,reason:''}));
const missions=Array.from({length:30},(_,i)=>({...learning[0],lessonId:'22222222-2222-4222-8222-'+String(i).padStart(12,'0'),title:'실행 미션 '+(i+1),week:1+Math.floor(i/5),day:i+1,track:'daily'}));
const rows=['김지민','이수빈','박민준','최유나','정하준','윤서연','한도윤','오지우','강서준','신예린','임준호','서소율'].map((name,i)=>{
 const done=[2,12,24,30,0,18,27,3,22,1,15,29][i];
 return{enrollmentId:'enrollment-'+i,memberId:'33333333-3333-4333-8333-'+String(i).padStart(12,'0'),name,email:'qa'+i+'@example.test',cells:[...learning,...missions.map((c,n)=>({...c,state:n<done?'completed':n===done?['not_submitted','submitted','changes_requested'][i%3]:'locked',completedAt:n<done?c.completedAt:null}))],lastVisitAt:i===0?'2026-10-01T05:30:00Z':'2026-10-08T05:30:00Z',lastContactAt:i===2?'2026-10-08T05:00:00Z':null,openQuestions:i===0?1:0};
});
export function learningCareFixture(request,response,url){
 if(!['/api/admin/learning-care','/api/member/learning-care'].includes(url.pathname))return false;
 response.setHeader('Content-Type','application/json');
 if(request.method!=='GET'){response.statusCode=403;response.end(JSON.stringify({error:'예시 화면에서는 메시지를 보내지 않습니다.'}));return true;}
 response.end(JSON.stringify(url.pathname.includes('/admin/')?{cohorts:[{id:'11111111-1111-4111-8111-111111111111',name:'4기 (예시)',courseTitle:'AI 문샷 챌린지'}],cohortId:'11111111-1111-4111-8111-111111111111',rows,asOf}:{asOf,rows:[{...rows[2],courseTitle:'AI 문샷 챌린지',cohortName:'4기 (예시)'}]}));return true;
}
