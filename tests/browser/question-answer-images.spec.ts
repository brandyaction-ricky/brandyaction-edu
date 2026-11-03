import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const q='22222222-2222-4222-8222-222222222222',png=readFileSync('public/brandy-action-logo.png');
async function backend(context:BrowserContext,{lost=false,uploadFails=false,conflict=false}={}){
 const answers:Record<string,unknown>[]=[];const posts:Record<string,unknown>[]=[];const uploads:Record<string,unknown>[]=[];let file='';
 await context.route('**/api/platform/question-thread?**',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{question:{id:q,title:'지난 강의를 보려면 어디를 누르나요?',content:'지난 강의 찾는 방법을 알려 주세요.',status:answers.length?'answered':'open',headId:answers.at(-1)?.id||null,resolved:false,archived:false,visibility:'private'},answers,canAnswer:true,canFollowUp:true,nextCursor:null}});
  const b=r.request().postDataJSON();posts.push(b);
  if(conflict){conflict=false;answers.push({id:'33333333-3333-4333-8333-333333333333',content:'먼저 남긴 답변',authorName:'운영자',createdAt:new Date().toISOString()});return r.fulfill({status:409,json:{error:'다른 답변이 등록됐습니다.'}});}
  if(!answers.some(a=>a.id===b.requestId))answers.push({id:b.requestId,content:b.content,imageId:b.imageId,authorName:'운영자',createdAt:new Date().toISOString()});
  if(lost){lost=false;return r.fulfill({status:503,json:{error:'등록 결과를 확인하지 못했습니다.'}});}
  return r.fulfill({json:{id:b.requestId,questionId:q}});
 });
 await context.route('**/api/platform/question-images',r=>{const b=r.request().postDataJSON();uploads.push(b);expect(b.purpose).toBe('answer');expect(b.questionId).toBe(q);
  if(b.action==='prepare'){file=b.requestId;return r.fulfill({json:{id:file,signedUrl:'https://storage.test/answer-image',contentType:'image/png'}});}
  if(uploadFails){uploadFails=false;return r.fulfill({status:503,json:{error:'이미지 연결 확인 실패'}});}return r.fulfill({json:{id:file}});
 });
 await context.route('https://storage.test/answer-image',r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''}));
 await context.route('**/api/platform/question-images?**',r=>{const u=new URL(r.request().url());expect(u.searchParams.get('question')).toBe(q);expect(answers.some(a=>a.id===u.searchParams.get('answer'))).toBe(true);return r.fulfill({contentType:'image/png',body:png});});
 return {posts,uploads,answers};
}
async function choose(page:Page){await page.getByLabel('답변 이미지 (선택)').setInputFiles({name:'커리큘럼 화면.png',mimeType:'image/png',buffer:png});}
async function paste(page:Page){await page.getByRole('textbox',{name:'새 답변'}).evaluate((e,bytes)=>{const clipboardData=new DataTransfer();clipboardData.items.add(new File([new Uint8Array(bytes)],'capture.png',{type:'image/png'}));e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},[...png]);}
test('operator attaches a photo with explanation; learner sees and enlarges it without expanding history',async({page,context},info)=>{
 const b=await backend(context);await page.goto('/question-thread-test');await expect(page.getByRole('button',{name:'사진·화면 캡처 첨부'})).toBeVisible();await page.getByRole('textbox',{name:'새 답변'}).fill('커리큘럼 화면의 좌측 상단을 눌러 주세요.');await choose(page);
 await expect(page.getByText('이미지 준비 완료. 답변을 등록하면 함께 저장됩니다.')).toBeVisible();await expect(page.getByAltText('첨부할 답변 이미지')).toBeVisible();
 await page.screenshot({path:info.outputPath('answer-photo-admin.png'),fullPage:true});await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByAltText('답변 첨부 이미지')).toBeVisible();expect(b.posts[0].imageId).toBe(b.uploads[0].requestId);
 const student=await context.newPage();await student.goto('/question-thread-test?student=1');await expect(student.getByAltText('답변 첨부 이미지')).toBeVisible();const pop=student.waitForEvent('popup');await student.getByRole('link',{name:'답변 이미지 크게 보기'}).click();const image=await pop;await image.waitForLoadState();expect(new URL(image.url()).searchParams.get('answer')).toBe(b.posts[0].requestId);await image.close();
 await student.getByRole('button',{name:'답변 전체 보기'}).click();await expect(student.getByText('커리큘럼 화면의 좌측 상단을 눌러 주세요.',{exact:true})).toBeVisible();await expect(student.getByAltText('답변 첨부 이미지')).toBeVisible();
 expect(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await student.screenshot({path:info.outputPath('answer-photo-student.png'),fullPage:true});
});
test('pasted image-only answer survives uncertain save and retries exact payload without duplicate upload',async({page,context})=>{
 const b=await backend(context,{lost:true});await page.goto('/question-thread-test');await paste(page);await expect(page.getByText('이미지 준비 완료. 답변을 등록하면 함께 저장됩니다.')).toBeVisible();await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByRole('button',{name:'같은 요청 결과 확인'})).toBeVisible();await expect(page.getByRole('button',{name:'이미지 빼기'})).toBeDisabled();await expect(page.getByLabel('답변 이미지 (선택)')).toBeDisabled();
 await page.getByRole('button',{name:'같은 요청 결과 확인'}).click();await expect(page.getByAltText('답변 첨부 이미지')).toBeVisible();expect(b.posts[1]).toEqual(b.posts[0]);expect(b.answers).toHaveLength(1);expect(b.posts[0].content).toBe('첨부 이미지를 확인해 주세요.');expect(b.uploads).toHaveLength(2);
});
test('failed upload blocks send, retries same file and removal preserves text; unsaved photo warns on close',async({page,context})=>{
 const b=await backend(context,{uploadFails:true});await page.goto('/question-thread-test');const input=page.getByRole('textbox',{name:'새 답변'});await input.fill('사진과 함께 안내');await choose(page);await expect(page.getByRole('alert')).toContainText('이미지 연결 확인 실패');await expect(page.getByRole('button',{name:'답변 추가하기'})).toBeDisabled();await page.getByRole('button',{name:'이미지 다시 올리기'}).click();await expect(page.getByText('이미지 준비 완료. 답변을 등록하면 함께 저장됩니다.')).toBeVisible();expect(b.uploads[0].requestId).toBe(b.uploads[2].requestId);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'닫기',exact:true}).last().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'이미지 빼기'}).click();await expect(input).toHaveValue('사진과 함께 안내');await expect(page.getByAltText('첨부할 답변 이미지')).toHaveCount(0);await page.getByRole('button',{name:'답변 추가하기'}).click();expect(b.posts[0].imageId).toBeUndefined();
});
test('concurrent answer keeps attachment until current head is refreshed',async({page,context})=>{
 const b=await backend(context,{conflict:true});await page.goto('/question-thread-test');await choose(page);await expect(page.getByText('이미지 준비 완료. 답변을 등록하면 함께 저장됩니다.')).toBeVisible();await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByText(/다른 답변이 등록됐습니다/)).toBeVisible();await expect(page.getByAltText('첨부할 답변 이미지')).toBeVisible();await page.getByRole('button',{name:'최신 답변 확인',exact:true}).click();await expect(page.getByText('먼저 남긴 답변')).toBeVisible();await page.getByRole('button',{name:'답변 추가하기'}).click();await expect(page.getByAltText('답변 첨부 이미지')).toBeVisible();expect(b.posts[1].imageId).toBe(b.posts[0].imageId);expect(b.posts[1].requestId).not.toBe(b.posts[0].requestId);
});
