// Disposable local UI fixture. Never imported by the production application.
const asOf='2026-10-08T08:00:00Z';
const cells=Array.from({length:8},(_,i)=>({lessonId:'22222222-2222-4222-8222-'+String(i).padStart(12,'0'),title:['나의 첫 AI 팀 만들기','업무 기록 정리하기','반복 업무 찾아보기','실행 결과 공유하기'][i%4],week:1+Math.floor(i/4),day:i%4+1,track:i<4?'learning':'daily',state:'completed',published:true,completedAt:'2026-10-07T08:00:00Z',submittedAt:null,reviewedAt:null,submissionId:null,reason:''}));
const rows=['합성 지민','합성 수빈','합성 민준','합성 유나','합성 하준','합성 서연'].map((name,i)=>({enrollmentId:'enrollment-'+i,memberId:'33333333-3333-4333-8333-'+String(i).padStart(12,'0'),name,email:'qa'+i+'@example.test',cells:cells.map((c,n)=>({...c,state:n<i+2?'completed':n===i+2?['not_submitted','submitted','changes_requested'][i%3]:'locked',completedAt:n<i+2?c.completedAt:null})),lastVisitAt:'2026-10-08T05:30:00Z',lastContactAt:i===2?'2026-10-08T05:00:00Z':null,openQuestions:i===0?1:0}));
export function learningCareFixture(request,response,url){
 if(!['/api/admin/learning-care','/api/member/learning-care'].includes(url.pathname))return false;
 response.setHeader('Content-Type','application/json');
 if(request.method!=='GET'){response.statusCode=403;response.end(JSON.stringify({error:'합성 미리보기에서는 실제 발송하지 않습니다.'}));return true;}
 response.end(JSON.stringify(url.pathname.includes('/admin/')?{cohorts:[{id:'11111111-1111-4111-8111-111111111111',name:'4기 · 합성 미리보기',courseTitle:'AI 문샷 챌린지'}],cohortId:'11111111-1111-4111-8111-111111111111',rows,asOf}:{asOf,rows:[{...rows[2],courseTitle:'AI 문샷 챌린지',cohortName:'4기 · 합성 미리보기'}]}));return true;
}
