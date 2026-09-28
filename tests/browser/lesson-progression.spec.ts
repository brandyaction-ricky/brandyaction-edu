import {expect,test,type Page} from '@playwright/test';
const id=(n:number)=>`aaaaaaac-1111-4111-8111-${String(n).padStart(12,'0')}`;
async function studentBackend(page:Page){
 const completed=new Set<string>(),reads:string[]=[],drafts=new Map<string,Record<string,unknown>>(),submissions=new Map<string,Record<string,unknown>>();let fail=false;
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  const params=new URL(route.request().url()).searchParams;
  if(route.request().method()==='GET'){
   if(params.get('action')==='progression'){
    if(fail){await route.fulfill({status:503,json:{error:'학습 상태 조회 실패'}});return;}
    await route.fulfill({json:{lessons:[10,11,12,13].map(n=>({lessonId:id(n),track:n<12?'daily':'learning',dayNumber:n%2+1,isUnlocked:n%2===0||completed.has(id(n-1)),automaticApproval:n<12,reason:n%2===1?'이전 학습을 완료해 주세요.':''}))}});return;
   }
   const lesson=params.get('lesson')!;reads.push(lesson);const daily=[id(10),id(11)].includes(lesson);
   await route.fulfill({json:{document:{schemaVersion:1,blocks:[{id:'t',type:'text',content:daily?'데일리 미션 본문':'별도 학습 본문'}],checklist:[],completion:{mode:daily?'mentor':'self',requireAnswers:false,requireQuizPass:!daily}},revision:id(99),currentRevision:id(99),draft:drafts.get(lesson)||null,submission:submissions.get(lesson)||null,previousDrafts:[],editable:true}});return;
  }
  const body=route.request().postDataJSON(),lesson=body.lessonId;
  if(body.action==='draft'){const draft={writeId:body.requestId,values:body.values,updatedAt:new Date().toISOString()};drafts.set(lesson,draft);await route.fulfill({json:draft});return;}
  expect(body.action).toBe('submit');const daily=[id(10),id(11)].includes(lesson);
  const submission={id:body.requestId,stateId:body.requestId,revision:id(99),writeId:body.writeId,outcome:daily?'submitted':'completed',state:daily?'approved':'completed',approvalKind:daily?'automatic':null,createdAt:new Date().toISOString()};completed.add(lesson);submissions.set(lesson,submission);await route.fulfill({json:submission});
 });
 return{reads,complete:(n:number)=>completed.add(id(n)),fail:(value:boolean)=>{fail=value;}};
}
test('locked deep links and failed gate reads hide the body and do not request its private block document',async({page})=>{
 const server=await studentBackend(page);await page.goto(`/learn/${id(1)}/${id(11)}`);
 await expect(page.getByRole('heading',{name:'이전 학습을 완료해 주세요.'})).toBeVisible();expect(server.reads).toHaveLength(0);await expect(page.getByText('숨겨야 할 기존 본문')).toHaveCount(0);await expect(page.locator('iframe')).toHaveCount(0);
 server.fail(true);await page.getByRole('button',{name:'학습 상태 다시 확인'}).click();await expect(page.getByRole('heading',{name:'학습 상태 조회 실패'})).toBeVisible();expect(server.reads).toHaveLength(0);
 server.fail(false);server.complete(10);await page.getByRole('button',{name:'학습 상태 다시 확인'}).click();await expect(page.getByText('데일리 미션 본문',{exact:true})).toBeVisible();expect(server.reads).toContain(id(11));
});
test('automatic daily approval opens the next lesson; separate learning has its own sequence',async({page},info)=>{
 await studentBackend(page);await page.goto('/lesson-progression-test');await expect(page.getByRole('button',{name:'다음 학습 · 잠김'})).toBeDisabled();
 await page.getByRole('button',{name:'미션 제출하기'}).click();await expect(page.getByText('자동승인되어 학습을 완료했습니다.',{exact:true})).toBeVisible();
 await expect(page.locator('.lesson-header')).toContainText('학습 완료');await page.getByRole('link',{name:'다음 학습',exact:true}).click();await expect(page.locator('.lesson-header')).toContainText('데일리 둘째 날');
 if(info.project.name!=='desktop')await page.getByRole('button',{name:/학습 목차|학습 목록/}).click();
 await page.getByRole('navigation',{name:'학습 종류'}).getByRole('link',{name:'별도 학습',exact:true}).click();await expect(page.getByText('별도 학습 본문',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'다음 학습 · 잠김'})).toBeDisabled();
 await page.getByRole('button',{name:'학습 완료하기',exact:true}).click();await expect(page.getByRole('link',{name:'다음 학습',exact:true})).toHaveAttribute('href',`/learn/${id(1)}/${id(13)}`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('separate-learning.png'),fullPage:true});
});
test('settings retry the identical write after a lost acknowledgment and retain saved values on reopening',async({page},info)=>{
 let saved={cohortId:id(3),writeId:null as string|null,autoApproveThroughWeek:null as number|null},lost=true;const writes:Record<string,unknown>[]=[];
 await page.route('**/api/admin/lesson-progression**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:saved});return;}
  const body=route.request().postDataJSON();writes.push(body);saved={cohortId:body.cohortId,writeId:body.requestId,autoApproveThroughWeek:body.autoApproveThroughWeek};
  if(lost){lost=false;await route.fulfill({status:503,json:{error:'응답 확인 실패'}});return;}await route.fulfill({json:saved});
 });
 await page.goto('/lesson-progression-test?settings');await page.getByRole('combobox',{name:'설정할 기수'}).selectOption(id(3));await page.getByRole('combobox',{name:'데일리 미션 자동승인 범위'}).selectOption('2');await page.getByRole('button',{name:'자동승인 설정 저장'}).click();await expect(page.getByRole('alert')).toContainText('응답 확인 실패');await expect(page.getByRole('combobox',{name:'설정할 기수'})).toBeDisabled();
 await page.getByRole('button',{name:'같은 설정 저장 다시 확인'}).click();await expect(page.getByRole('status')).toContainText('저장했습니다');expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);
 await page.reload();await page.getByRole('combobox',{name:'설정할 기수'}).selectOption(id(3));await expect(page.getByRole('combobox',{name:'데일리 미션 자동승인 범위'})).toHaveValue('2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('settings.png'),fullPage:true});
});
test('settings preserve a conflicting choice until explicit reload and never save over a failed read',async({page})=>{
 let readError=true;const writes:unknown[]=[];
 await page.route('**/api/admin/lesson-progression**',async route=>{
  if(route.request().method()==='POST'){writes.push(route.request().postDataJSON());await route.fulfill({status:409,json:{error:'다른 화면에서 설정을 바꿨습니다.'}});return;}
  if(readError){await route.fulfill({status:503,json:{error:'기수 설정 조회 실패'}});return;}
  await route.fulfill({json:{cohortId:id(3),writeId:id(40),autoApproveThroughWeek:1}});
 });
 await page.goto('/lesson-progression-test?settings');await page.getByRole('combobox',{name:'설정할 기수'}).selectOption(id(3));await expect(page.getByRole('alert')).toContainText('조회 실패');await expect(page.getByRole('button',{name:'자동승인 설정 저장'})).toHaveCount(0);
 readError=false;await page.getByRole('button',{name:'설정 조회 다시 시도'}).click();await page.getByRole('combobox',{name:'데일리 미션 자동승인 범위'}).selectOption('2');await page.getByRole('button',{name:'자동승인 설정 저장'}).click();await expect(page.getByRole('alert')).toContainText('다른 화면');await expect(page.getByRole('combobox',{name:'데일리 미션 자동승인 범위'})).toHaveValue('2');await expect(page.getByRole('button',{name:'자동승인 설정 저장'})).toBeDisabled();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'저장된 설정 다시 불러오기'}).click();await expect(page.getByRole('combobox',{name:'데일리 미션 자동승인 범위'})).toHaveValue('1');expect(writes).toHaveLength(1);
});
