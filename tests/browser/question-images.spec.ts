import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const id='11111111-1111-4111-8111-111111111119';
const png=readFileSync('public/brandy-action-logo.png');
async function open(page:import('@playwright/test').Page){
 await page.goto('/classroom-questions-test');await page.getByRole('button',{name:'이 학습에 질문하기',exact:true}).click();await page.getByRole('textbox',{name:'질문 제목',exact:true}).fill('사진으로 질문합니다');
}
test('upload a question image, register without body and retry an uncertain save without duplicates or losing the attachment',async({page},testInfo)=>{
 let image='',saved=false,attempt=0;const posts:Record<string,unknown>[]=[];
 await page.route('**/api/platform/question-images',r=>{const b=r.request().postDataJSON();if(b.action==='prepare'){image=b.requestId;return r.fulfill({json:{id:image,signedUrl:'https://storage.test/question-upload',contentType:'image/png'}});}return r.fulfill({json:{id:image,name:'질문.png',size:png.length}});});
 await page.route('https://storage.test/question-upload',r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''}));
 await page.route('**/api/platform/lesson-questions?**',r=>r.fulfill({json:{questions:saved?[{id,title:'사진으로 질문합니다',content:'첨부 이미지에 대한 질문입니다.',image_id:image,status:'open'}]:[]}}));
 await page.route('**/api/platform/lesson-questions',r=>{posts.push(r.request().postDataJSON());saved=++attempt>1;return r.fulfill(saved?{json:{question:{id}}}:{status:503,json:{error:'등록 결과 확인 실패'}});});
 await page.route('**/api/platform/question-images?**',r=>r.fulfill({contentType:'image/png',body:png}));
 await open(page);await page.getByLabel('질문 이미지 (선택)').setInputFiles({name:'질문.png',mimeType:'image/png',buffer:png});await expect(page.getByText('이미지 준비 완료. 질문을 등록하면 함께 저장됩니다.')).toBeVisible();
 await page.getByRole('button',{name:'작성 접기',exact:true}).click();await page.getByRole('button',{name:'이 학습에 질문하기',exact:true}).click();await expect(page.getByAltText('첨부할 질문 이미지')).toBeVisible();
 await page.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(page.getByRole('alert')).toContainText('등록 결과 확인 실패');await expect(page.getByRole('button',{name:'이미지 빼기'})).toBeDisabled();
 await page.getByRole('button',{name:'등록 결과 다시 확인'}).click();expect(posts).toHaveLength(2);expect(posts[0]).toEqual(posts[1]);expect(posts[0]).toMatchObject({content:'',imageId:image});await expect(page.getByAltText('질문 첨부 이미지')).toBeVisible();
 expect(await page.getByAltText('질문 첨부 이미지').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);await page.screenshot({path:testInfo.outputPath('question-image-student.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('failed uploads keep the file and block incomplete questions; same-file retry completes an upload whose response was lost',async({page})=>{
 let image='',complete=0;const requests:string[]=[];
 await page.route('**/api/platform/lesson-questions?**',r=>r.fulfill({json:{questions:[]}}));
 await page.route('**/api/platform/question-images',r=>{const b=r.request().postDataJSON();if(b.action==='prepare'){requests.push(b.requestId);image=b.requestId;return r.fulfill({json:{id:image,signedUrl:'https://storage.test/lost-upload'}});}return r.fulfill(++complete===1?{status:503,json:{error:'파일 확인 실패'}}:{json:{id:image}});});
 await page.route('https://storage.test/lost-upload',r=>r.abort('failed'));
 await open(page);await page.getByRole('textbox',{name:'질문 내용',exact:true}).fill('작성한 내용 유지');await page.getByLabel('질문 이미지 (선택)').setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});
 await expect(page.getByRole('alert')).toContainText('파일 확인 실패');await expect(page.getByRole('button',{name:'질문 등록',exact:true})).toBeDisabled();await page.getByRole('button',{name:'이미지 다시 올리기'}).click();await expect(page.getByText('이미지 준비 완료. 질문을 등록하면 함께 저장됩니다.')).toBeVisible();expect(requests[0]).toBe(requests[1]);
 await page.getByRole('button',{name:'이미지 빼기'}).click();await expect(page.getByAltText('첨부할 질문 이미지')).toHaveCount(0);await expect(page.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue('작성한 내용 유지');await expect(page.getByRole('button',{name:'질문 등록',exact:true})).toBeEnabled();
});
test('invalid image files never upload and the image-only draft warns before navigating away',async({page})=>{
 let calls=0;await page.route('**/api/platform/lesson-questions?**',r=>r.fulfill({json:{questions:[]}}));await page.route('**/api/platform/question-images',r=>{calls++;return r.fulfill({status:503,json:{error:'연결 실패'}});});
 await open(page);await page.getByLabel('질문 이미지 (선택)').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.getByRole('alert')).toContainText('이미지는 JPG');expect(calls).toBe(0);
 await page.getByRole('textbox',{name:'질문 제목',exact:true}).fill('');await page.getByLabel('질문 이미지 (선택)').setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('alert')).toContainText('연결 실패');
 page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'내 질문 전체 보기'}).click();await expect(page).toHaveURL(/classroom-questions-test/);await expect(page.getByAltText('첨부할 질문 이미지')).toBeVisible();
});
test('operator sees the same image in answer dialog and can recover a failed private image read',async({page},testInfo)=>{
 let broken=true;await page.route('**/api/platform/question-thread?**',r=>r.fulfill({json:{question:{id,title:'이미지 질문',content:'사진을 확인해 주세요.',imageId:id,status:'open',resolved:false,archived:false,headId:null},answers:[],canAnswer:true,nextCursor:null}}));
 await page.route('**/api/platform/question-images?**',r=>r.fulfill(broken?{status:403,body:'forbidden'}:{contentType:'image/png',body:png}));
 await page.goto('/question-thread-test');await expect(page.getByText('질문 이미지를 불러오지 못했습니다.')).toBeVisible();broken=false;await page.getByRole('button',{name:'이미지 다시 보기'}).click();await expect(page.getByAltText('질문 첨부 이미지')).toBeVisible();await expect(page.getByRole('textbox',{name:'새 답변',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('question-image-admin.png'),fullPage:true});
});
