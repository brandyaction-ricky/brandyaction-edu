// Manual QA uses isolated synthetic memory only, never Supabase or real students.
const questions=new Map();
export function lessonQuestionFixture(request,response,url){
 if(url.pathname!=='/api/platform/lesson-questions')return false;
 response.setHeader('Content-Type','application/json');
 if(request.method==='GET'){
  const key=url.searchParams.get('enrollment')+':'+url.searchParams.get('lesson');
  response.end(JSON.stringify({questions:[...(questions.get(key)||[])].reverse(),hasMore:false}));return true;
 }
 if(request.method==='POST'){
  let raw='';request.on('data',chunk=>raw+=chunk);request.on('end',()=>{
   const body=JSON.parse(raw),key=body.enrollmentId+':'+body.lessonId,rows=questions.get(key)||[];
   let question=rows.find(item=>item.id===body.requestId);
   if(!question){question={id:body.requestId,title:body.title,content:body.content,status:'answered',answer:'[합성 검수 답변] 질문과 답변은 해당 학습에서 확인할 수 있습니다.',created_at:new Date().toISOString()};rows.push(question);questions.set(key,rows);}
   response.end(JSON.stringify({question}));
  });return true;
 }
 response.writeHead(405).end();return true;
}
