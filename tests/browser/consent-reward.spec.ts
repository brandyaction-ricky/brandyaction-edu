import {test,expect} from '@playwright/test';
import {welcomeBackend} from './fixture/welcome-backend';
const ad='[선택] 마케팅 정보 수신 (이메일·카카오) 쿠폰';
test('one explicit all-consent button grants all four, issues once, and the account is not asked again',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/consent-reward-test');await page.getByRole('button',{name:'모두 동의하고 1만원 쿠폰 받기',exact:true}).click();await expect(page.getByRole('status')).toContainText('1만원 쿠폰');expect(b.writes[0].choices).toEqual({email:true,kakao:true,analysis:true,overseas:true,meta:true});expect(b.writes[0].copyVersion).toBe('edu-welcome-e-20261017');expect(b.issues()).toBe(1);await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'이어서 학습하기'})).toBeVisible();
});
test('괜찮아요 persists a server-side answer with no grants or coupon and does not reappear',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/consent-reward-test');await page.getByRole('button',{name:'괜찮아요',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(b.writes[0].scope).toBe('dismiss');expect(b.issues()).toBe(0);expect(b.snapshot().personal.choices).toEqual({analysis:false,overseas:false});await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('coupon unavailability suppresses the promotional card and never blocks signup',async({page})=>{
 const b=await welcomeBackend(page,{unavailable:true});await page.goto('/consent-reward-test');await expect(page.getByRole('dialog')).toHaveCount(0);await page.goto('/optional-signup-test');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'동의하고 가입 완료'}).click();await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.writes).toHaveLength(0);
});
test('Meta alone receives no marketing grant and no coupon',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/consent-reward-test');await page.getByRole('checkbox',{name:'[선택] Meta 구매 정보 전송 (광고 성과 측정, 미국 이전)',exact:true}).check();await page.getByRole('button',{name:'선택한 항목 동의하기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(b.snapshot().marketing.choices.marketingUse).toBe(false);expect(b.issues()).toBe(0);expect(b.snapshot().meta.active).toBe(true);
});
test('response loss retries the identical atomic request without issuing twice',async({page})=>{
 const b=await welcomeBackend(page,{lost:true});await page.goto('/consent-reward-test');await page.getByRole('checkbox',{name:ad,exact:true}).check();await page.getByRole('button',{name:'선택한 항목 동의하기'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('checkbox',{name:ad,exact:true})).toBeDisabled();await page.getByRole('button',{name:'같은 선택 다시 확인하기'}).click();await expect(page.getByRole('status')).toContainText('쿠폰');expect(b.writes[0]).toEqual(b.writes[1]);expect(b.issues()).toBe(1);
});
test('missing Meta disclosure blocks only Meta and all-consent, marketing still issues a coupon',async({page})=>{
 const b=await welcomeBackend(page,{termsUnavailable:true});await page.goto('/consent-reward-test');await expect(page.getByRole('checkbox',{name:/^\[선택\] Meta/})).toBeDisabled();await expect(page.getByRole('button',{name:'모두 동의하고 1만원 쿠폰 받기'})).toBeDisabled();await page.getByRole('checkbox',{name:ad,exact:true}).check();await page.getByRole('button',{name:'선택한 항목 동의하기'}).click();await expect(page.getByRole('status')).toContainText('쿠폰');expect(b.issues()).toBe(1);expect(b.writes[0].choices.meta).toBe(false);
});
test('failed save stays visible, records no answer, and can retry the original choice',async({page})=>{
 const b=await welcomeBackend(page,{failure:true});await page.goto('/consent-reward-test');await page.getByRole('button',{name:'괜찮아요'}).click();await expect(page.getByRole('alert')).toBeVisible();expect(b.snapshot().handled).toBe(false);b.setFailure(false);await page.getByRole('button',{name:'같은 선택 다시 확인하기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(b.writes[0]).toEqual(b.writes[1]);
});
