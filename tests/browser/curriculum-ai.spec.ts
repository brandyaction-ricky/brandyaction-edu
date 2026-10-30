import {test,expect,type Page} from '@playwright/test';
const id='11111111-1111-4111-8111-111111111111';
const context={enrollmentId:id,lessonId:id,label:'문샷 3기 · 고객 인터뷰',recent:true};
const answer={answer:'고객의 최근 경험을 묻는 열린 질문을 작성해 주세요.',needsMentor:false,searchedLessons:20,sources:[{id:'S1',lessonId:id,title:'고객 인터뷰 수업',revision:null,excerpt:'고객 질문은 열린 질문으로 작성합니다.'}]};
async function backend(page:Page,{fail=false,delay=0}={}){
 const ai:Record<string,unknown>[]=[],questions:Record<string,unknown>[]=[],usage:string[]=[];
 await page.route('**/api/platform/curriculum-ai',async route=>{ai.push(route.request().postDataJSON());if(delay)await new Promise(r=>setTimeout(r,delay));await route.fulfill(fail?{status:429,json:{error:'오늘의 이용 한도에 도달했어요.'}}:{json:answer});});
 await page.route('**/api/platform/question-hub**',route=>{if(route.request().method()==='POST'){questions.push(route.request().postDataJSON());return route.fulfill({json:{question:{id}}});}return route.fulfill({json:new URL(route.request().url()).searchParams.get('mode')==='contexts'?{contexts:[context]}:{answers:[]}});});
 await page.route('**/api/admin/ai-usage?**',route=>{usage.push(route.request().url());return route.fulfill({json:{rows:[{cohort_id:id,cohort_name:'문샷 3기',course_title:'AI 문샷 챌린지',requests:3,succeeded:2,failed:1,pending:0,calls:{api_calls:3,input_tokens:1000,cached_tokens:100,output_tokens:200,estimated_usd:0.001,unmeasured_calls:1,unpriced_calls:1}}]}});});
 return{ai,questions,usage};
}
test('student sees grounded sources then reviews a private mentor handoff before saving',async({page},info)=>{
 const h=await backend(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/curriculum-ai-test');
 await page.getByRole('textbox',{name:'궁금한 점'}).fill('고객 인터뷰 질문을 어떻게 작성하나요?');await page.getByRole('button',{name:'AI 답변 받기'}).click();
 await expect(page.getByText(answer.answer,{exact:true})).toBeVisible();await page.getByText('고객 인터뷰 수업 · 근거 보기').click();await expect(page.getByText(answer.sources[0].excerpt,{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'참고 수업 새 창으로 열기'})).toHaveAttribute('href',`/learn/${id}/${id}`);expect(h.questions).toHaveLength(0);
 await page.getByRole('button',{name:'멘토에게 질문',exact:true}).click();const content=page.getByRole('textbox',{name:'질문 내용',exact:true});await expect(content).toHaveValue(new RegExp(answer.answer));await expect(page.getByRole('radio',{name:'비밀 질문',exact:true})).toBeChecked();
 expect(h.questions).toHaveLength(0);await page.screenshot({path:info.outputPath('mentor-handoff.png')});await page.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-question-created','true');
 expect(h.questions[0]).toMatchObject({enrollmentId:id,lessonId:id,visibility:'private'});expect(errors).toEqual([]);
});
test('follow-up sends bounded history, busy actions cannot duplicate calls and mobile layout fits',async({page},info)=>{
 const h=await backend(page,{delay:300});await page.goto('/curriculum-ai-test');const input=page.getByRole('textbox',{name:'궁금한 점'});await input.fill('첫 번째 질문');await page.getByRole('button',{name:'AI 답변 받기'}).click();
 await expect(page.getByRole('button',{name:'멘토에게 질문',exact:true})).toBeDisabled();await expect(input).toBeDisabled();await expect(input).toHaveValue('');
 await input.fill('후속 질문');await page.getByRole('button',{name:'AI 답변 받기'}).click();await expect(input).toHaveValue('');expect(h.ai).toHaveLength(2);expect(h.ai[1].history).toEqual([{role:'user',text:'첫 번째 질문'},{role:'assistant',text:answer.answer}]);
 await page.screenshot({path:info.outputPath('ai-conversation.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('API failure preserves input and mentor remains available without automatically registering a question',async({page})=>{
 const h=await backend(page,{fail:true});await page.goto('/curriculum-ai-test');await page.getByRole('textbox',{name:'궁금한 점'}).fill('실패해도 질문은 남겨 주세요');await page.getByRole('button',{name:'AI 답변 받기'}).click();await expect(page.getByRole('alert')).toContainText('이용 한도');await expect(page.getByRole('textbox',{name:'궁금한 점'})).toHaveValue('실패해도 질문은 남겨 주세요');await page.getByRole('button',{name:'멘토에게 질문',exact:true}).click();await expect(page.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue(/실패해도 질문은 남겨 주세요/);expect(h.questions).toHaveLength(0);
});
test('usage loads only on opening, distinguishes unmeasured costs and filters by cohort and period',async({page})=>{
 const h=await backend(page);await page.goto('/curriculum-ai-test');expect(h.usage).toHaveLength(0);await page.getByText('기수별 AI API 사용량',{exact:true}).click();await expect(page.getByRole('cell',{name:'토큰 미확인 1건',exact:false})).toBeVisible();await expect(page.getByText('금액 미확인 1건 별도')).toBeVisible();await page.getByLabel('AI 사용량 기수').selectOption(id);await expect(page.getByRole('rowheader')).toContainText('문샷 3기');await page.getByLabel('AI 사용량 기간').selectOption('7');await expect.poll(()=>h.usage.length).toBe(2);expect(h.usage[1]).toContain('days=7');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
