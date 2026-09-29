import {test,expect,type BrowserContext} from '@playwright/test';
const q='22222222-2222-4222-8222-222222222222',legacy='33333333-3333-4333-8333-333333333333';
async function backend(context:BrowserContext,options:{lost?:boolean;stale?:boolean;empty?:boolean;failRead?:boolean;older?:boolean}={}){
 const replies=options.empty?[]:[{id:legacy,authorName:'운영자',content:'기존 답변',createdAt:'2026-09-01T00:00:00Z'}];
 let resolved=false;const writes:Record<string,unknown>[]=[];let ai=0;
 await context.route('**/api/platform/question-thread?**',async route=>{
  if(route.request().method()==='GET'){
   if(options.failRead){options.failRead=false;await route.fulfill({status:503,json:{error:'조회 실패, 다시 확인해 주세요.'}});return;}
   const before=new URL(route.request().url()).searchParams.get('before');await route.fulfill({json:{question:{id:q,title:'실행 질문',content:'내 고객을 어떻게 고를까요?',status:replies.length||resolved?'answered':'open',headId:replies.at(-1)?.id||null,resolved,archived:false},canAnswer:true,answers:before?[{id:'older',authorName:'첫 멘토',content:'더 오래된 답변',createdAt:'2026-08-01T00:00:00Z'}]:replies,nextCursor:options.older&&!before?'10':null}});return;
  }
  const body=route.request().postDataJSON();writes.push(body);
  if(options.stale){options.stale=false;replies.push({id:'44444444-4444-4444-8444-444444444444',authorName:'다른 멘토',content:'방금 등록된 답변',createdAt:new Date().toISOString()});await route.fulfill({status:409,json:{error:'다른 답변이 등록됐습니다.'}});return;}
  if(body.action==='resolve')resolved=true;else if(!replies.some(a=>a.id===body.requestId))replies.push({id:body.requestId,authorName:'담당 멘토',content:body.content,createdAt:new Date().toISOString()});
  if(options.lost){options.lost=false;await route.fulfill({status:503,json:{error:'결과를 확인하지 못했습니다.'}});return;}
  await route.fulfill({json:body.action==='resolve'?{id:q,resolved:true}:{id:body.requestId,questionId:q}});
 });
 await context.route('**/api/admin/questions/answer-draft',async route=>{ai++;await route.fulfill({json:{draft:'검수할 AI 초안'}});});
 return{writes,replies,ai:()=>ai};
}
test('operators append answers while learners can inspect every answer and earlier pages as literal text',async({page,context},info)=>{
 const server=await backend(context,{older:true});await page.goto('/question-thread-test');await expect(page.getByText('기존 답변',{exact:true})).toBeVisible();await page.getByRole('textbox',{name:'새 답변'}).fill('새 조언 <script>window.bad=true</script>');await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByRole('status').filter({hasText:'답변을 추가했습니다'})).toBeVisible();
 expect(server.writes[0].expectedHeadId).toBe(legacy);expect(server.replies).toHaveLength(2);await expect(page.getByText('기존 답변',{exact:true})).toBeVisible();await expect(page.getByText('새 조언 <script>window.bad=true</script>',{exact:true})).toBeVisible();
 const student=await context.newPage();await student.goto('/question-thread-test?student=1');await student.getByRole('button',{name:'답변 전체 보기'}).click();await expect(student.getByText('새 조언 <script>window.bad=true</script>',{exact:true})).toBeVisible();await student.getByRole('button',{name:'이전 답변 더 보기'}).click();await expect(student.getByText('더 오래된 답변',{exact:true})).toBeVisible();expect(await student.evaluate(()=>Object.hasOwn(window,'bad'))).toBe(false);
 await page.screenshot({path:info.outputPath('question-thread-admin.png'),fullPage:true});await student.screenshot({path:info.outputPath('question-thread-member.png'),fullPage:true});expect(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('uncertain writes freeze input and prevent escape, then retry the same payload once without duplication',async({page,context})=>{
 const server=await backend(context,{lost:true});await page.goto('/question-thread-test');await page.getByRole('textbox',{name:'새 답변'}).fill('재확인할 답변');await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByRole('textbox',{name:'새 답변'})).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'같은 요청 결과 확인'}).click();await expect(page.getByRole('status').filter({hasText:'답변을 추가했습니다'})).toBeVisible();expect(server.writes).toHaveLength(2);expect(server.writes[1]).toEqual(server.writes[0]);expect(server.replies).toHaveLength(2);
});
test('a concurrent answer conflict preserves typed text and reloads the current head before resubmission',async({page,context})=>{
 const server=await backend(context,{stale:true});await page.goto('/question-thread-test');await page.getByRole('textbox',{name:'새 답변'}).fill('유지할 답변');await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByRole('status')).toContainText('다른 답변');await expect(page.getByRole('textbox',{name:'새 답변'})).toHaveValue('유지할 답변');await expect(page.getByRole('button',{name:'답변 추가하기'})).toBeDisabled();
 await page.getByRole('button',{name:'최신 답변 확인',exact:true}).click();await expect(page.getByText('방금 등록된 답변',{exact:true})).toBeVisible();await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByRole('status').filter({hasText:'답변을 추가했습니다'})).toBeVisible();expect(server.writes[1].expectedHeadId).toBe('44444444-4444-4444-8444-444444444444');expect(server.writes[1].requestId).not.toBe(server.writes[0].requestId);
});
test('resolve without reply changes only the completion state and remains retryable',async({page,context})=>{
 const server=await backend(context,{empty:true,lost:true});await page.goto('/question-thread-test');await page.getByRole('button',{name:'답변 없이 처리 완료'}).click();await page.getByRole('button',{name:'같은 요청 결과 확인'}).click();await expect(page.getByText('질문을 처리 완료했습니다.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'답변 없이 처리 완료'})).toHaveCount(0);expect(server.replies).toHaveLength(0);expect(server.writes[1]).toEqual(server.writes[0]);
});
test('read failures have no editable success state and AI drafts require explicit registration',async({page,context})=>{
 const server=await backend(context,{failRead:true});await page.goto('/question-thread-test');await expect(page.getByRole('alert')).toContainText('조회 실패',{timeout:15000});await expect(page.getByRole('textbox',{name:'새 답변'})).toHaveCount(0);await page.getByRole('button',{name:'답변 다시 불러오기'}).click();await page.getByRole('button',{name:'AI 답변 초안'}).click();await expect(page.getByRole('textbox',{name:'새 답변'})).toHaveValue('검수할 AI 초안');expect(server.ai()).toBe(1);expect(server.writes).toHaveLength(0);await expect(page.getByRole('button',{name:'AI 답변 초안'})).toBeDisabled();
 await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByRole('status').filter({hasText:'답변을 추가했습니다'})).toBeVisible();expect(server.writes).toHaveLength(1);
});
