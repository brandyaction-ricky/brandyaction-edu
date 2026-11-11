import {test,expect} from '@playwright/test';
test('student next action, map filtering and private export',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'문샷 동료님의 다음 도약'})).toBeVisible();
 await page.getByRole('button',{name:/DAY 0\d/}).first().click();await expect(page.getByRole('status')).toBeVisible();
 await page.getByRole('button',{name:'수정 필요',exact:true}).click();await expect(page.getByRole('button',{name:/DAY 03/})).toBeVisible();await expect(page.getByRole('button',{name:/DAY 01/})).toHaveCount(0);
 await page.getByRole('button',{name:'내 성장 카드 보기'}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('가상 예시');
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'성장 카드 이미지 저장'}).click();expect((await saved).suggestedFilename()).toBe('moonshot-demo-progress.svg');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
test('admin aggregate drilldown and wait/revision filter',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'관리자 기수 현황'}).click();await expect(page.getByRole('heading',{name:'실행이 멈추지 않도록.'})).toBeVisible();await expect(page.getByRole('table')).toContainText('제출 전');
 await page.getByRole('button',{name:'수정 요청',exact:true}).click();await expect(page.getByRole('link',{name:'검토 화면'}).first()).toBeVisible();await expect(page.getByText(/\d일 대기/)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
test('live learner loads authenticated fixture and clears state on denied refresh',async({page})=>{
 await page.goto('/?live=student');await expect(page.getByRole('heading',{name:'문샷 동료님의 다음 도약'})).toBeVisible();
 await page.route('**/api/campus?*',route=>route.fulfill({status:403,body:'{}'}));await page.getByRole('button',{name:'학습 기록 새로고침'}).click();await expect(page.getByRole('heading',{name:'학습 기록을 확인해 주세요'})).toBeVisible();await expect(page.getByText('문샷 동료님의 다음 도약')).toHaveCount(0);
 await page.getByRole('button',{name:'수강 기수 다시 확인'}).click();await expect(page.getByLabel('내 수강 기수')).toHaveValue('');
 await page.unroute('**/api/campus?*');await page.getByLabel('내 수강 기수').selectOption('00000000-0000-4000-8000-000000000002');await expect(page.getByRole('button',{name:/DAY 0\d/}).first()).toBeVisible();
});
test('live admin loads options then selected cohort, loses data on denial',async({page})=>{
 await page.goto('/?live=admin');await expect(page.getByRole('heading',{name:'실행이 멈추지 않도록.'})).toBeVisible();
 await page.route('**/api/campus/admin?*',route=>route.fulfill({status:403,body:'{}'}));await page.getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.getByRole('alert')).toContainText('권한');await expect(page.getByRole('table')).toHaveCount(0);
});

test('limited admin queue distinguishes filtered slice from full population',async({page})=>{
 await page.route('**/api/campus/admin?*',async route=>{const original=await route.fetch();const data=await original.json();data.queue=[];data.queueTotal=120;await route.fulfill({json:data});});
 await page.goto('/?live=admin');await page.getByRole('button',{name:'수정 요청',exact:true}).click();await expect(page.getByText(/현재 표시된 목록에는/)).toBeVisible();
});
