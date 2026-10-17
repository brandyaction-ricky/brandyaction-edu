import {test,expect} from '@playwright/test';
import {welcomeBackend} from './fixture/welcome-backend';
const analysis='[선택] 맞춤 추천', overseas='[선택] 해외 분석 서버 (맞춤 추천용, 미국 이전)';
test('each personal checkbox saves only its purpose and leaves marketing, Meta and coupon unchanged',async({page})=>{
 const b=await welcomeBackend(page,{existing:true});await page.goto('/personalization-consent-test');await page.getByRole('checkbox',{name:analysis,exact:true}).uncheck();await expect(page.getByRole('status')).toBeVisible();expect(b.writes[0].scope).toBe('analysis');expect(b.snapshot().personal.choices.overseas).toBe(true);expect(b.snapshot().meta.active).toBe(true);expect(b.snapshot().reward.awarded).toBe(true);
 await page.getByRole('checkbox',{name:overseas,exact:true}).uncheck();await expect(page.getByRole('checkbox',{name:overseas,exact:true})).not.toBeChecked();expect(b.writes[1].scope).toBe('overseas');expect(b.snapshot().marketing.choices.email).toBe(true);
});
test('new terms show fresh empty boxes and retain separate withdrawals even when collection is OFF',async({page})=>{
 const b=await welcomeBackend(page,{existing:true,renewal:true,personalOff:true});await page.goto('/personalization-consent-test');
 await expect(page.getByRole('checkbox',{name:analysis,exact:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:analysis,exact:true})).toBeDisabled();await expect(page.getByRole('checkbox',{name:overseas,exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'기존 맞춤 추천 동의 철회',exact:true}).click();await expect(page.getByRole('button',{name:'기존 맞춤 추천 동의 철회',exact:true})).toHaveCount(0);expect(b.writes[0].scope).toBe('analysis');expect(b.snapshot().personal.choices).toEqual({analysis:false,overseas:true});
 await page.getByRole('button',{name:'기존 해외 분석 서버 동의 철회',exact:true}).click();await expect(page.getByRole('button',{name:'기존 해외 분석 서버 동의 철회',exact:true})).toHaveCount(0);expect(b.snapshot().personal.choices).toEqual({analysis:false,overseas:false});expect(b.snapshot().meta.consented).toBe(true);
 await page.getByRole('button',{name:'기존 Meta 동의 철회',exact:true}).click();await expect(page.getByRole('button',{name:'기존 Meta 동의 철회',exact:true})).toHaveCount(0);expect(b.writes[2].scope).toBe('meta');expect(b.snapshot().reward.awarded).toBe(true);
});
test('unready personal collection disables new grants but does not block marketing-only coupon or dismissal',async({page})=>{
 const b=await welcomeBackend(page,{personalOff:true});await page.goto('/consent-reward-test');await expect(page.getByRole('checkbox',{name:analysis,exact:true})).toBeDisabled();await expect(page.getByRole('checkbox',{name:overseas,exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'모두 동의하고 1만원 쿠폰 받기'})).toBeDisabled();await page.getByRole('checkbox',{name:'[선택] 마케팅 정보 수신 (이메일·카카오) 쿠폰',exact:true}).check();await page.getByRole('button',{name:'선택한 항목 동의하기'}).click();await expect(page.getByRole('status')).toContainText('쿠폰');expect(b.writes[0].choices.analysis).toBe(false);expect(b.writes[0].choices.overseas).toBe(false);expect(b.issues()).toBe(1);
});

test('renewing one purpose does not renew the other older purpose',async({page})=>{
 const b=await welcomeBackend(page,{existing:true,renewal:true});await page.goto('/personalization-consent-test');await page.getByRole('checkbox',{name:analysis,exact:true}).check();await expect(page.getByRole('checkbox',{name:analysis,exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:overseas,exact:true})).not.toBeChecked();expect(b.writes[0].scope).toBe('analysis');await expect(page.getByRole('button',{name:'기존 해외 분석 서버 동의 철회',exact:true})).toBeVisible();
});
