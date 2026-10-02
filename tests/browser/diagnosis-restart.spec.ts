import { test, expect } from '@playwright/test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session={attemptId:id(1),adminTest:true,canRestart:true,state:'submitted',revision:8,answers:[],submittedAt:'2026-10-01T00:00:00Z',needsReview:true,survey:{code:'needs6_n30',version:'synthetic',title:'합성 N6 검사',coreQuestionCount:1,questions:[{id:id(10),code:'P001',text:'합성 비교 문항',type:'pair_choice',section:'두 문장 비교',required:true,core:true,pickExactly:null,exclusiveOptionIds:[],confirmationOptionId:null,reconfirmInstructions:false,placeholder:'',pair:{left:'왼쪽 합성 문장',right:'오른쪽 합성 문장'},options:[1,2,3,4,5].map(n=>({id:id(10+n),label:String(n)}))}]}};
test('admin can cancel or restart held and ongoing tests, preserving the old attempt and fencing new saves',async({page})=>{
 let current={...session},restarts=0,fail=false;const writes:{action:string;attemptId?:string}[]=[];
 await page.route('**/api/platform/diagnosis/session',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:current});
  const body=route.request().postDataJSON();writes.push(body);
  if(body.action==='restart'){
   if(fail)return route.fulfill({status:503,json:{error:'새 검사를 준비하지 못했습니다.'}});
   expect(body.attemptId).toBe(current.attemptId);restarts++;
   current={...current,attemptId:id(100+restarts),state:'in_progress',revision:0,answers:[],submittedAt:null as unknown as string,needsReview:false};
  }
  if(body.action==='save'){expect(body.attemptId).toBe(current.attemptId);current={...current,revision:current.revision+1,answers:body.answers};}
  return route.fulfill({json:current});
 });
 await page.route('**/api/platform/diagnosis/report',r=>r.fulfill({json:{state:'needs_review',updatedAt:'2026-10-01T00:00:00.000Z',canRetry:false,downloadAvailable:false}}));
 await page.goto('/diagnosis-test?reports&admin');
 await page.getByRole('button',{name:'다시 진단하기',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('이전 답변과 보고서는 기록에 보관됩니다.');
 await expect(dialog.getByRole('button',{name:'취소',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(restarts).toBe(0);
 await page.getByRole('button',{name:'다시 진단하기',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('admin-restart-dialog.png'),fullPage:true});
 fail=true;await dialog.getByRole('button',{name:'새 검사 시작',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('준비하지 못했습니다');expect(restarts).toBe(0);
 fail=false;await dialog.getByRole('button',{name:'새 검사 시작',exact:true}).click();
 await expect(page.getByRole('button',{name:'시작하기',exact:true})).toBeVisible();expect(restarts).toBe(1);
 await page.getByRole('button',{name:'시작하기',exact:true}).click();
 await page.getByRole('radio').first().click();
 await expect.poll(()=>writes.filter(b=>b.action==='save').length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'다시 진단하기',exact:true}).click();await page.keyboard.press('2');
 await dialog.getByRole('button',{name:'새 검사 시작',exact:true}).click();
 await expect(page.getByRole('button',{name:'시작하기',exact:true})).toBeVisible();expect(restarts).toBe(2);
});
test('student and disabled-pilot screens never offer an admin restart',async({page})=>{
 await page.route('**/api/platform/diagnosis/session',r=>r.fulfill({json:{...session,adminTest:false,canRestart:false}}));
 await page.route('**/api/platform/diagnosis/report',r=>r.fulfill({json:{state:'queued',updatedAt:'2026-10-01T00:00:00.000Z',canRetry:false,downloadAvailable:false}}));
 for(const url of ['/diagnosis-test?reports','/diagnosis-test?reports&admin']){
  await page.goto(url);await expect(page.getByRole('heading',{name:'검사가 완료됐어요.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'다시 진단하기',exact:true})).toHaveCount(0);
 }
});
