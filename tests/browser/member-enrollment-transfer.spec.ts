import { expect, test } from '@playwright/test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const target={id:id(4),name:'받는 QA 회원',email:'recipient@example.test'};
const source={id:id(12),course_id:id(10),cohort_id:id(11),status:'active',revoked_at:null,access_starts_at:'2026-01-01T00:00:00Z',access_ends_at:'2099-12-31T00:00:00Z',courses:{id:id(10),title:'문샷 챌린지'},cohorts:{id:id(11),name:'5기'}};
async function open(page:import('@playwright/test').Page) {
 await page.goto('/member-operations-test');await page.getByRole('button',{name:'회원 상세 열기',exact:true}).click();
 await page.getByRole('tab',{name:'수강권',exact:true}).click();
 const area=page.getByRole('region',{name:'회원 간 수강권 이전'});
 await area.getByRole('button',{name:'다른 회원에게 수강권 이전'}).click();return area;
}
test.beforeEach(async({page})=>{
 await page.route('**/api/admin/member-login-email**',route=>route.fulfill({json:{currentEmail:'original@example.test',pendingEmail:'',history:[]}}));
});
test('member transfer checks the destination and reason, invalidates edited identity, then refreshes revoked source without saving the member profile',async({page},info)=>{
 let transferred=false,writes=0;
 await page.route('**/api/admin/member-overview?**',route=>route.fulfill({json:{rows:[transferred?{...source,status:'revoked',revoked_at:new Date().toISOString()}:source],total:1,canTransferEnrollment:true}}));
 await page.route('**/api/admin/member-enrollment-transfer**',async route=>{
  if(route.request().method()==='POST'){
   const value=route.request().postDataJSON();expect(value).toMatchObject({member:id(1),source:id(12),target:target.id,reason:'동일인 확인 후 이용 계정 이전',confirmed:true});
   expect(value.requestId).toMatch(/^[a-f0-9-]{36}$/);writes++;transferred=true;await route.fulfill({json:{ok:true,message:'수강권을 이전했습니다. 기존 계정의 수강 권한은 회수됐습니다.'}});
  }else await route.fulfill({json:{target}});
 });
 const area=await open(page);
 await area.getByLabel('받는 회원의 가입 이메일').fill(target.email);await area.getByLabel('받는 회원의 가입 이메일').press('Enter');
 await expect(area.getByText(target.name,{exact:true})).toBeVisible();await expect(area.getByRole('button',{name:'수강권 이전 실행'})).toBeDisabled();
 await area.getByLabel('이전 사유',{exact:true}).fill('동일인 확인 후 이용 계정 이전');await area.getByRole('checkbox').check();
 await area.getByLabel('받는 회원의 가입 이메일').fill('changed@example.test');await expect(area.getByRole('checkbox')).toHaveCount(0);
 await area.getByLabel('받는 회원의 가입 이메일').fill(target.email);await area.getByRole('button',{name:'회원 확인',exact:true}).click();await area.getByRole('checkbox').check();
 await expect(area).toContainText('학습 진도·제출물·질문·AI 대화는 원래 계정에 남습니다.');
 await area.screenshot({path:info.outputPath('enrollment-transfer-'+info.project.name+'.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await area.getByRole('button',{name:'수강권 이전 실행'}).click();
 await expect(page.getByRole('status').filter({hasText:'수강권을 이전했습니다.'})).toBeVisible();
 await expect(area).toHaveCount(0);expect(writes).toBe(1);await expect(page.getByTestId('saved-member')).toHaveText('{}');
});
test('uncertain outcome locks edited parameters and retries the identical command',async({page})=>{
 const commands:unknown[]=[];
 await page.route('**/api/admin/member-overview?**',route=>route.fulfill({json:{rows:[source],total:1,canTransferEnrollment:true}}));
 await page.route('**/api/admin/member-enrollment-transfer**',async route=>{
  if(route.request().method()==='POST'){commands.push(route.request().postDataJSON());await route.fulfill({status:503,json:{error:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'}});}else await route.fulfill({json:{target}});
 });
 const area=await open(page);await area.getByLabel('받는 회원의 가입 이메일').fill(target.email);await area.getByRole('button',{name:'회원 확인',exact:true}).click();await area.getByLabel('이전 사유',{exact:true}).fill('회원 요청');await area.getByRole('checkbox').check();
 await area.getByRole('button',{name:'수강권 이전 실행'}).click();await expect(area.getByRole('alert')).toContainText('같은 요청');
 await expect(area.getByLabel('받는 회원의 가입 이메일')).toBeDisabled();await expect(area.getByLabel('이전 사유',{exact:true})).toBeDisabled();
 await area.getByRole('button',{name:'같은 요청으로 결과 확인'}).click();await expect.poll(()=>commands.length).toBe(2);expect(commands[0]).toEqual(commands[1]);
});

test('read-only member management does not show the transfer action without administrator capability',async({page})=>{
 await page.route('**/api/admin/member-overview?**',route=>route.fulfill({json:{rows:[source],total:1,canTransferEnrollment:false}}));
 await page.goto('/member-operations-test');await page.getByRole('button',{name:'회원 상세 열기',exact:true}).click();await page.getByRole('tab',{name:'수강권',exact:true}).click();
 await expect(page.getByRole('tabpanel',{name:'수강권',exact:true})).toContainText('문샷 챌린지');
 await expect(page.getByRole('button',{name:'다른 회원에게 수강권 이전'})).toHaveCount(0);
});
