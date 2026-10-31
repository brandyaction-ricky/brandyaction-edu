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
test('usage summaries follow the cohort filter and do not double count cached tokens',async({page})=>{
 const h=await backend(page);const other='22222222-2222-4222-8222-222222222222';
 await page.route('**/api/admin/ai-usage?**',route=>{h.usage.push(route.request().url());return route.fulfill({json:{rows:[
  {cohort_id:id,cohort_name:'문샷 3기',course_title:'AI 문샷 챌린지',requests:3,succeeded:2,failed:1,pending:0,calls:{api_calls:3,input_tokens:1000,cached_tokens:100,output_tokens:200,estimated_usd:0.001,unmeasured_calls:0,unpriced_calls:0}},
  {cohort_id:other,cohort_name:'문샷 4기',course_title:'AI 문샷 챌린지',requests:5,succeeded:5,failed:0,pending:0,calls:{api_calls:5,input_tokens:2000,cached_tokens:400,output_tokens:300,estimated_usd:0.002,unmeasured_calls:0,unpriced_calls:0}},
 ]}});});
 await page.goto('/curriculum-ai-test');expect(h.usage).toHaveLength(0);await page.getByText('기수별 AI API 사용량',{exact:true}).click();
 const summary=page.getByLabel('선택 범위 AI 사용량 요약');await expect(summary).toContainText('3,500');await expect(summary).toContainText('$0.0030');await expect(summary).toContainText('완료 7 · 실패 1 · 대기 0');
 await page.getByLabel('AI 사용량 기수').selectOption(id);await expect(summary).toContainText('1,200');await expect(summary).toContainText('$0.0010');await expect(summary).not.toContainText('3,500');await expect(page.getByRole('rowheader')).toHaveCount(1);expect(h.usage).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('fully unpriced calls show pending cost rather than zero and failed reads retain retry',async({page})=>{
 await backend(page);let fail=false;
 await page.route('**/api/admin/ai-usage?**',route=>route.fulfill(fail?{status:503,json:{error:'사용량 조회를 잠시 사용할 수 없습니다.'}}:{json:{rows:[{cohort_id:id,cohort_name:'문샷 3기',course_title:'AI 문샷 챌린지',requests:1,succeeded:0,failed:1,pending:0,calls:{api_calls:1,unmeasured_calls:1,unpriced_calls:1}}]}}));
 await page.goto('/curriculum-ai-test');await page.getByText('기수별 AI API 사용량',{exact:true}).click();const summary=page.getByLabel('선택 범위 AI 사용량 요약');await expect(summary).toContainText('집계 대기');await expect(summary).not.toContainText('$0.0000');await expect(page.getByRole('cell',{name:'집계 대기 금액 미확인 1건 별도'})).toBeVisible();
 await expect(page.getByText('금액 미확인 1건 별도')).toBeVisible();fail=true;await page.getByRole('button',{name:'사용량 새로고침'}).click();await expect(page.getByRole('alert')).toContainText('사용량 조회를 잠시 사용할 수 없습니다.');await expect(summary).toHaveCount(0);await expect(page.getByRole('button',{name:'사용량 새로고침'})).toBeEnabled();
});
async function screenshotUpload(page:Page,{delay=0,fail=false}={}){
 const uploads:Record<string,unknown>[]=[],puts:string[]=[];let imageId='';
 await page.route('**/api/platform/question-images',async route=>{const body=route.request().postDataJSON();uploads.push(body);if(body.action==='prepare'){imageId=body.requestId;return route.fulfill({json:{id:imageId,ready:false,signedUrl:new URL('/synthetic-question-upload',page.url()).href}});}if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return route.fulfill(fail?{status:503,json:{error:'이미지 업로드 시험 오류'}}:{json:{id:imageId}});});
 await page.route('**/synthetic-question-upload',route=>{puts.push(route.request().method());return route.fulfill({status:200,body:''});});
 return{uploads,puts};
}
async function pasteScreenshot(page:Page){await page.getByRole('textbox',{name:'궁금한 점'}).evaluate(el=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxjQAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],'screenshot.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});}
test('paste screenshot waits for verified upload then reaches AI and the private mentor handoff without reupload',async({page})=>{
 const h=await backend(page),files=await screenshotUpload(page,{delay:200});await page.goto('/curriculum-ai-test');const input=page.getByRole('textbox',{name:'궁금한 점'});await expect(input).toHaveAttribute('placeholder',/예:.*프롬프트/);await input.fill('캡처의 오류를 확인해 주세요');await pasteScreenshot(page);await expect(page.getByRole('button',{name:'AI 답변 받기',exact:true})).toBeDisabled();await expect(page.getByText('이미지 준비 완료.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'AI 답변 받기',exact:true}).click();await expect(input).toHaveValue('');expect(h.ai[0].imageId).toBe(files.uploads[0].requestId);expect(files.puts).toEqual(['PUT']);await expect(page.getByText('화면 캡처 1장 함께 전달')).toBeVisible();await page.getByRole('button',{name:'멘토에게 질문',exact:true}).click();await expect(page.getByRole('img',{name:'첨부할 질문 이미지'})).toBeVisible();await expect(page.getByRole('radio',{name:'비밀 질문',exact:true})).toBeChecked();await page.getByRole('button',{name:'질문 등록',exact:true}).click();expect(h.questions[0].imageId).toBe(h.ai[0].imageId);expect(files.uploads).toHaveLength(2);
});
test('screenshot upload errors preserve text and block AI until the attachment is removed',async({page})=>{
 const h=await backend(page);await screenshotUpload(page,{fail:true});await page.goto('/curriculum-ai-test');const input=page.getByRole('textbox',{name:'궁금한 점'});await input.fill('이 질문은 보존해 주세요');await pasteScreenshot(page);await expect(page.getByRole('alert')).toContainText('업로드 시험 오류');await expect(page.getByRole('button',{name:'AI 답변 받기',exact:true})).toBeDisabled();await expect(input).toHaveValue('이 질문은 보존해 주세요');expect(h.ai).toHaveLength(0);await page.getByRole('button',{name:'이미지 빼기'}).click();await page.getByRole('button',{name:'AI 답변 받기',exact:true}).click();await expect(input).toHaveValue('');expect(h.ai[0]).not.toHaveProperty('imageId');
});
test('direct question entry requires an explicit lesson, prevents mixing drafts and sends the chosen lesson',async({page})=>{
 const h=await backend(page);const other={...context,lessonId:'22222222-2222-4222-8222-222222222222',label:'16일차 · 문샷 3기 · 상세페이지'};
 await page.route('**/api/platform/question-hub?mode=contexts',route=>route.fulfill({json:{contexts:[{...context,label:'1일차 · 문샷 3기 · 고객 인터뷰'},other]}}));
 await page.goto('/curriculum-ai-test?hub=1');await page.getByRole('tab',{name:'질문하기',exact:true}).click();const select=page.getByRole('combobox',{name:'질문할 수업·일차'});await expect(select).toHaveValue('');await expect(page.getByRole('textbox',{name:'궁금한 점'})).toHaveCount(0);await select.selectOption(id+':'+id);const input=page.getByRole('textbox',{name:'궁금한 점'});await input.fill('1일차 작성 중');page.once('dialog',d=>d.dismiss());await select.selectOption(id+':'+other.lessonId);await expect(input).toHaveValue('1일차 작성 중');await expect(select).toHaveValue(id+':'+id);
 page.once('dialog',d=>d.accept());await select.selectOption(id+':'+other.lessonId);await expect(input).toHaveValue('');await input.fill('16일차 새 질문');await page.getByRole('button',{name:'AI 답변 받기',exact:true}).click();await expect(input).toHaveValue('');expect(h.ai[0].lessonId).toBe(other.lessonId);expect(h.questions).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'멘토에게 질문',exact:true}).click();await page.getByRole('button',{name:'질문 등록',exact:true}).click();await page.getByRole('tab',{name:'내 질문',exact:true}).waitFor();await page.getByRole('tab',{name:'질문하기',exact:true}).click();await expect(select).toHaveValue('');expect(h.questions[0].lessonId).toBe(other.lessonId);
});

async function dragQuestionFiles(page:Page,type:string,{mentor=false,names=['화면 캡처.png'],oversize=false,text=false}={}){
 return page.getByRole('textbox',{name:mentor?'질문 내용':'궁금한 점',exact:true}).evaluate((el,args)=>{
  const dt=new DataTransfer();
  if(args.text)dt.setData('text/plain','드래그한 글');
  else for(const name of args.names)dt.items.add(new File([args.oversize?new Uint8Array(10*1024*1024+1):Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxjQAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],name,{type:name.endsWith('.pdf')?'application/pdf':'image/png'}));
  const event=new DragEvent(args.type,{dataTransfer:dt,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;
 },{type,names,oversize,text});
}
test('file drag highlights the question area, clears on leaving and leaves text drags alone',async({page})=>{
 const h=await backend(page),files=await screenshotUpload(page);await page.goto('/curriculum-ai-test');
 expect(await dragQuestionFiles(page,'dragenter',{text:true})).toBe(false);await expect(page.getByText('사진·화면 캡처를 여기에 놓으세요')).toHaveCount(0);
 expect(await dragQuestionFiles(page,'dragenter')).toBe(true);await expect(page.getByText('사진·화면 캡처를 여기에 놓으세요')).toBeVisible();
 // Crossing descendants must not dismiss the drop target while still inside it.
 await dragQuestionFiles(page,'dragenter');await dragQuestionFiles(page,'dragleave');await expect(page.getByText('사진·화면 캡처를 여기에 놓으세요')).toBeVisible();
 await dragQuestionFiles(page,'dragleave');await expect(page.getByText('사진·화면 캡처를 여기에 놓으세요')).toHaveCount(0);
 expect(await dragQuestionFiles(page,'drop',{text:true})).toBe(false);expect(files.uploads).toHaveLength(0);expect(h.ai).toHaveLength(0);expect(h.questions).toHaveLength(0);
});
test('dropping a screenshot uploads once, preserves the question and cannot replace an in-flight attachment',async({page},info)=>{
 const h=await backend(page,{delay:400}),files=await screenshotUpload(page,{delay:400});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/curriculum-ai-test');
 const input=page.getByRole('textbox',{name:'궁금한 점'});await input.fill('화면의 오류가 왜 생기나요?');await dragQuestionFiles(page,'dragenter');await page.screenshot({path:info.outputPath('screenshot-drop-target.png')});expect(await dragQuestionFiles(page,'drop')).toBe(true);
 await expect(page.getByText('이미지를 올리고 있습니다.')).toBeVisible();expect(await dragQuestionFiles(page,'drop',{names:['다른 사진.png']})).toBe(true);await expect(page.getByRole('button',{name:'AI 답변 받기',exact:true})).toBeDisabled();
 await expect(page.getByText('이미지 준비 완료.',{exact:false})).toBeVisible();await expect(page.getByRole('img',{name:'첨부할 질문 이미지'})).toBeVisible();await expect(input).toHaveValue('화면의 오류가 왜 생기나요?');expect(files.uploads).toHaveLength(2);expect(files.puts).toEqual(['PUT']);expect(h.ai).toHaveLength(0);
 await page.getByRole('button',{name:'AI 답변 받기',exact:true}).click();expect(await dragQuestionFiles(page,'drop',{names:['답변 대기 중.png']})).toBe(true);await expect(page.getByText(answer.answer,{exact:true})).toBeVisible();expect(h.ai[0].imageId).toBe(files.uploads[0].requestId);expect(files.uploads).toHaveLength(2);
 await page.getByRole('button',{name:'이미지 빼기'}).click();await expect(page.getByRole('img',{name:'첨부할 질문 이미지'})).toHaveCount(0);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('mentor accepts a dropped screenshot, rejects invalid replacements and locks drops after an uncertain save',async({page})=>{
 const h=await backend(page),files=await screenshotUpload(page);await page.goto('/curriculum-ai-test');await page.getByRole('button',{name:'멘토에게 질문',exact:true}).click();const input=page.getByRole('textbox',{name:'질문 내용',exact:true});await input.fill('멘토에게 캡처를 보냅니다');
 expect(await dragQuestionFiles(page,'drop',{mentor:true})).toBe(true);await expect(page.getByText('이미지 준비 완료.',{exact:false})).toBeVisible();expect(h.questions).toHaveLength(0);
 await dragQuestionFiles(page,'drop',{mentor:true,names:['잘못된 파일.pdf']});await expect(page.getByRole('alert')).toContainText(/JPG|PNG/);
 await dragQuestionFiles(page,'drop',{mentor:true,names:['하나.png','둘.png']});await expect(page.getByRole('alert')).toContainText('한 장씩');
 await dragQuestionFiles(page,'drop',{mentor:true,oversize:true});await expect(page.getByRole('alert')).toContainText('10MB');await expect(input).toHaveValue('멘토에게 캡처를 보냅니다');await expect(page.getByRole('img',{name:'첨부할 질문 이미지'})).toBeVisible();expect(files.uploads).toHaveLength(2);
 await page.route('**/api/platform/question-hub',route=>{h.questions.push(route.request().postDataJSON());return route.fulfill({status:503,json:{error:'등록 결과 미확인'}});});await page.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(page.getByRole('button',{name:'등록 결과 다시 확인'})).toBeVisible();
 expect(h.questions[0].imageId).toBe(files.uploads[0].requestId);expect(await dragQuestionFiles(page,'drop',{mentor:true,names:['잠금 중.png']})).toBe(true);expect(files.uploads).toHaveLength(2);await expect(input).toHaveValue('멘토에게 캡처를 보냅니다');expect(h.questions).toHaveLength(1);
});
