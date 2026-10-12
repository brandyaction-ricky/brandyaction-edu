import {test,expect,type BrowserContext} from '@playwright/test';
const question='22222222-2222-4222-8222-222222222222';
async function backend(context:BrowserContext,options:{enabled?:boolean;lost?:boolean;stale?:boolean;draft?:boolean}={}){
 const writes:Record<string,unknown>[]=[];let publications=0,applied=false;
 await context.route('**/api/platform/question-thread?**',r=>r.fulfill({json:{question:{id:question,title:'비공개 질문 원문',content:'운영자만 읽는 원문',headId:null,archived:false,resolved:false},canAnswer:true,answers:[],nextCursor:null}}));
 await context.route('**/api/admin/questions/lesson-qa**',async r=>{
  if(r.request().method()==='GET'){await r.fulfill({json:{lessonId:'33333333-3333-4333-8333-333333333333',lessonTitle:'시험 학습',publicStamp:'1'.repeat(32),questionStamp:'2'.repeat(32),cohortStamp:'5'.repeat(32),authorHead:null,draftPending:Boolean(options.draft),applied:false,cohorts:[{id:'c1',name:'시험 1기'},{id:'c2',name:'시험 2기'}],anchors:[{blockId:'intro',node:1,label:'정확한 설명 단락'}],canPublish:options.enabled!==false}});return;}
  const body=r.request().postDataJSON();writes.push(body);
  if(body.action==='prepare'){await r.fulfill({json:{id:body.requestId,digest:'3'.repeat(32),title:body.title,answer:body.answer,applied:false}});return;}
  if(options.stale){await r.fulfill({status:409,json:{error:'질문·답변·수업 버전이 바뀌었습니다.'}});return;}
  if(!applied){publications++;applied=true;}
  if(options.lost){options.lost=false;await r.fulfill({status:503,json:{error:'반영 응답 확인 실패'}});return;}
  await r.fulfill({json:{id:body.planId,published:true}});
 });
 return{writes,publications:()=>publications};
}
async function prepare(page:import('@playwright/test').Page){
 await page.goto('/question-thread-test');await page.getByText('수업에 질문·답변 반영 검토',{exact:true}).click();
 await page.getByRole('button',{name:'삽입 위치 확인',exact:true}).click();await page.getByLabel('설명 다음 삽입 위치').selectOption('0');
 await page.getByLabel('개인정보를 지운 질문 제목').fill('검토한 질문');await page.getByLabel('학생 답변과 수업에 사용할 동일한 답변').fill('검토한 답변 <script>window.bad=true</script>');
 await page.getByRole('button',{name:'검토본 고정·미리보기',exact:true}).click();await expect(page.getByRole('region',{name:'고정한 질문·답변 검토본'})).toBeVisible();
}
async function attest(page:import('@playwright/test').Page){await page.getByLabel('개인정보·첨부를 제외했고 공개해도 되는 문구를 확인했습니다.').check();await page.getByLabel('같은 상품의 모든 기수에 영향을 주는 것을 확인했습니다.').check();}
test('exact insertion preview is collapsed, keyboard accessible and requires privacy plus all-cohort review',async({page,context},info)=>{
 const h=await backend(context);await prepare(page);
 const preview=page.getByRole('region',{name:'고정한 질문·답변 검토본'});
 await expect(preview.locator('details')).not.toHaveAttribute('open');
 const summary=preview.locator('summary');await summary.focus();await page.keyboard.press('Enter');await expect(preview.locator('details')).toHaveAttribute('open','');
 await expect(preview.getByText('검토한 답변 <script>window.bad=true</script>',{exact:true})).toBeVisible();expect(await page.evaluate(()=>Object.hasOwn(window,'bad'))).toBe(false);
 const approve=page.getByRole('button',{name:'이 검토본 승인·답변과 수업 반영'});await expect(approve).toBeDisabled();await attest(page);await expect(approve).toBeEnabled();
 await page.screenshot({path:info.outputPath('qa-review.png'),fullPage:true});await approve.click();await expect(page.getByText('답변과 수업 반영을 함께 확인했습니다.',{exact:true})).toBeVisible();
 expect(h.publications()).toBe(1);expect(h.writes.at(-1)).toMatchObject({action:'approve',privacyReviewed:true,allCohortsReviewed:true});expect(h.writes.at(-1)).not.toHaveProperty('answer');
});
test('unknown publication result freezes editing and retries the same immutable plan without duplicate publication',async({page,context})=>{
 const h=await backend(context,{lost:true});await prepare(page);await attest(page);await page.getByRole('button',{name:'이 검토본 승인·답변과 수업 반영'}).click();
 await expect(page.getByLabel('개인정보를 지운 질문 제목')).toBeDisabled();await page.getByRole('button',{name:'같은 검토본으로 반영 결과 재확인'}).click();
 await expect(page.getByText('답변과 수업 반영을 함께 확인했습니다.',{exact:true})).toBeVisible();expect(h.writes[2]).toEqual(h.writes[1]);expect(h.publications()).toBe(1);
});
test('disabled publication and competing author drafts permit no real publication; editing invalidates prior review',async({page,context})=>{
 const h=await backend(context,{enabled:false});await prepare(page);
 await expect(page.getByText('현재는 검토본 준비 단계입니다. 실제 답변·수업 반영은 별도 승인 후 사용할 수 있습니다.',{exact:true})).toBeVisible();expect(h.publications()).toBe(0);
 await page.getByLabel('개인정보를 지운 질문 제목').fill('바뀐 질문');await expect(page.getByRole('region',{name:'고정한 질문·답변 검토본'})).toHaveCount(0);
 await context.unroute('**/api/admin/questions/lesson-qa**');await backend(context,{draft:true});await page.reload();await page.getByText('수업에 질문·답변 반영 검토',{exact:true}).click();await page.getByRole('button',{name:'삽입 위치 확인',exact:true}).click();
 await expect(page.getByText('다른 편집 초안이 있어 반영 준비를 중단했습니다. 기존 초안을 먼저 확인해 주세요.',{exact:true})).toBeVisible();await expect(page.getByLabel('개인정보를 지운 질문 제목')).toHaveCount(0);
});
