import { expect, test, type Page } from '@playwright/test';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
async function backend(page:Page){
 const writes:string[]=[],reads:string[]=[];let contentError=false;
 await page.route('**/api/platform/curriculum-review?**',async route=>{
  const req=route.request(),p=new URL(req.url()).searchParams;
  if(req.method()!=='GET'){writes.push(req.method());await route.fulfill({status:405});return;}
  if(p.has('lesson')){
   reads.push(p.get('lesson')!);
   if(contentError){await route.fulfill({status:503,json:{error:'검수용 조회 실패'}});return;}
   if(p.has('asset')){await route.fulfill({json:{name:'검수 자료.pdf',size:123,kind:'file'}});return;}
   await route.fulfill({json:{revision:id(15),body:'기존 본문',video:'',external:'',resourceName:'수업 자료',document:{schemaVersion:1,blocks:[{id:'heading',type:'heading',content:p.get('lesson')===id(7)?'둘째 수업 본문':'첫 수업 본문'},{id:'answer',type:'question',question:{kind:'text',label:'실습 입력',required:true}},{id:'file',type:'file',assetId:id(16)}],checklist:[]}}});return;
  }
  const cohort=p.get('cohort')||id(3);
  await route.fulfill({json:{cohorts:[{id:id(3),courseId:id(2),title:'문샷 챌린지 · 직원 검수'},{id:id(4),courseId:id(2),title:'문샷 챌린지 · 다른 기수'}],cohortId:cohort,enrollmentId:cohort===id(3)?id(10):null,studentStateError:false,lessons:[{id:id(6),title:'첫 수업',description:'안내',week:1,weekTitle:'실행 시작',day:1,completed:cohort===id(3),studentUnlocked:cohort===id(3)},{id:id(7),title:'둘째 수업',description:'안내',week:1,weekTitle:'실행 시작',day:2,completed:false,studentUnlocked:false}]}});
 });
 return{writes,reads,fail:(v:boolean)=>{contentError=v;}};
}
async function openNav(page:Page){const button=page.getByRole('button',{name:'학습 목록',exact:true});if(await button.isVisible()&&await button.getAttribute('aria-expanded')==='false')await button.click();}
test('staff review opens locked lessons, switches student locks and never writes progress or answers',async({page},info)=>{
 const api=await backend(page);await page.goto('/staff-curriculum-review-test');await expect(page.getByRole('heading',{name:'첫 수업 본문',exact:true})).toBeVisible();
 await openNav(page);await page.getByRole('button',{name:/DAY 2.*둘째 수업/}).click();await expect(page.getByRole('heading',{name:'둘째 수업 본문',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'실습 입력'})).toHaveAttribute('readonly','');await expect(page.getByRole('button',{name:'학습 완료하기',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'학생 기준 잠금 보기',exact:true}).click();await expect(page.getByText(/학생 기준으로 잠긴 수업입니다/)).toBeVisible();await expect(page.getByRole('heading',{name:'둘째 수업 본문',exact:true})).toHaveCount(0);
 await openNav(page);await expect(page.getByRole('button',{name:/DAY 2.*잠김.*둘째 수업/})).toHaveAttribute('aria-disabled','true');const before=api.reads.length;await page.getByRole('button',{name:/DAY 2.*잠김.*둘째 수업/}).click({force:true});expect(api.reads.length).toBe(before);
 await page.getByRole('button',{name:'전체 수업 열람',exact:true}).click();await expect(page.getByRole('heading',{name:'둘째 수업 본문',exact:true})).toBeVisible();
 await expect(page.getByText(/1개 학습 완료/)).toBeVisible();await expect(page.getByRole('link',{name:/검수 자료.pdf 다운로드/})).toHaveAttribute('href',/curriculum-review.*cohort=.*lesson=.*asset=/);
 expect(api.writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('staff-review.png'),fullPage:true});
});
test('cohort changes, missing enrollment and read failures hide stale lesson contents',async({page})=>{
 const api=await backend(page);await page.goto('/staff-curriculum-review-test');await expect(page.getByRole('heading',{name:'첫 수업 본문',exact:true})).toBeVisible();
 await page.getByLabel('검수할 과정·기수').selectOption(id(4));await expect(page.getByText(/0개 학습 완료/)).toBeVisible();await page.getByRole('button',{name:'학생 기준 잠금 보기',exact:true}).click();await expect(page.getByText(/유효한 수강권이 없어/)).toBeVisible();await expect(page.getByRole('heading',{name:'첫 수업 본문',exact:true})).toHaveCount(0);
 api.fail(true);await page.getByRole('button',{name:'전체 수업 열람',exact:true}).click();await expect(page.getByRole('alert')).toContainText('검수용 조회 실패');await expect(page.getByRole('heading',{name:'첫 수업 본문',exact:true})).toHaveCount(0);
 api.fail(false);await page.getByRole('button',{name:'수업 다시 확인'}).click();await expect(page.getByRole('heading',{name:'첫 수업 본문',exact:true})).toBeVisible();expect(api.writes).toEqual([]);
});
