import {test,expect} from '@playwright/test';
const code='33333333-3333-4333-8333-333333333333',template='44444444-4444-4444-8444-444444444444';
const setup={state:'ready',period:'moonshot-4',templates:[{id:template,name:'합성 LMS',channel:'lms'}],reservations:[],delivery:{enabled:false}};
const review={token:'a'.repeat(32),counts:{total:5,candidate:2,order_hold:1,no_consent:1,duplicate:1},template:{name:'합성 LMS',channel:'lms',content:'합성 안내 문구'},asOf:new Date().toISOString()};
test('review is read-only; scheduling requires explicit review and confirmation; changes invalidate it',async({page})=>{
 const writes:Record<string,unknown>[]=[];
 await page.route('**/api/conversion/delivery**',r=>{if(r.request().method()==='POST'){writes.push(r.request().postDataJSON());return r.fulfill({json:{campaignId:code}});}return r.fulfill({json:new URL(r.request().url()).searchParams.has('template')?review:setup});});
 await page.goto('/delivery-test');await expect(page.getByText('대상 모집: moonshot-4 · 사이트 신청자 기준')).toBeVisible();
 await page.getByLabel('발송에 사용할 템플릿').selectOption(template);await page.getByRole('button',{name:'발송 대상·문구 검토',exact:true}).click();
 await expect(page.getByText('검토 결과 · 2명')).toBeVisible();expect(writes).toHaveLength(0);
 await page.getByLabel('모집 안내 예약 이름',{exact:true}).fill('QA 합성 예약');
 await page.getByLabel('모집 안내 예약 시각 (현재 기기 시간)',{exact:true}).fill('2030-01-01T12:00');
 await expect(page.getByRole('button',{name:'검토한 모집 안내 예약',exact:true})).toBeDisabled();
 await page.getByRole('checkbox').check();await page.getByRole('combobox',{name:'개별 안내 목적',exact:true}).selectOption('offer');
 await expect(page.getByText('검토 결과 · 2명')).toHaveCount(0);
 await page.getByRole('button',{name:'발송 대상·문구 검토',exact:true}).click();await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'검토한 모집 안내 예약',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);expect(writes[0]).toMatchObject({code,template,purpose:'offer',token:review.token});expect(writes[0].recipientIds).toBeUndefined();
 await expect(page.getByRole('status')).toContainText('예약을 저장했습니다');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('unpublished paid course blocks review and reservation; denied read gives no form',async({page})=>{
 await page.route('**/api/conversion/delivery**',r=>r.fulfill({json:{...setup,state:'unavailable'}}));await page.goto('/delivery-test');
 await page.getByLabel('발송에 사용할 템플릿').selectOption(template);await expect(page.getByRole('button',{name:'발송 대상·문구 검토',exact:true})).toBeDisabled();
 await expect(page.getByText('연결된 유료 상품이 아직 공개되지 않아 대상 검토·예약을 보류합니다.')).toBeVisible();
 await page.route('**/api/conversion/delivery**',r=>r.fulfill({status:403,json:{error:'권한이 없습니다.'}}));await page.reload();
 await expect(page.getByRole('status')).toHaveText('권한이 없습니다.');await expect(page.getByLabel('발송에 사용할 템플릿')).toHaveCount(0);
});
