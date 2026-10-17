import { expect,test } from '@playwright/test';
import { welcomeBackend } from './fixture/welcome-backend';
const marketing='[선택] 마케팅 정보 수신 (이메일·카카오) 쿠폰';
const meta='[선택] Meta 구매 정보 전송 (광고 성과 측정, 미국 이전)';
test('explicit signup all-consent submits four grants and required terms once, after an unchecked start',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/optional-signup-test');
 await expect(page.getByRole('checkbox')).toHaveCount(5);for(const c of await page.getByRole('checkbox').all())await expect(c).not.toBeChecked();
 const submit=page.getByRole('button',{name:'모두 동의하고 1만원 쿠폰 받아 가입 완료',exact:true});await expect(submit).toBeDisabled();
 await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();await submit.click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.writes).toHaveLength(1);expect(b.auth).toHaveLength(1);expect(b.issues()).toBe(1);
 expect(b.writes[0].choices).toEqual({email:true,kakao:true,analysis:true,overseas:true,meta:true});await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('signup combines required and four optional choices; required-only completes in one submit',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/optional-signup-test');await expect(page.getByRole('checkbox')).toHaveCount(5);
 await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();
 await page.getByRole('button',{name:'필수만 동의하고 가입 완료',exact:true}).click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.auth).toHaveLength(1);expect(b.writes).toHaveLength(1);expect(Object.values(b.writes[0].choices).every(v=>!v)).toBe(true);expect(b.issues()).toBe(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('signup marketing-only choice issues coupon without Meta and finishes without another prompt',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/optional-signup-test');
 await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();
 await page.getByRole('checkbox',{name:marketing,exact:true}).check();
 await page.getByRole('button',{name:'동의하고 1만원 쿠폰 받아 가입 완료',exact:true}).click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.auth).toHaveLength(1);expect(b.issues()).toBe(1);expect(b.writes[0].choices).toEqual({email:true,kakao:true,analysis:false,overseas:false,meta:false});
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('signup never silently grants all when the plain completion button is used without a coupon campaign',async({page})=>{
 const b=await welcomeBackend(page,{unavailable:true});await page.goto('/optional-signup-test');
 await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();
 await page.getByRole('button',{name:'동의하고 가입 완료',exact:true}).click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(Object.values(b.writes[0].choices).every(v=>!v)).toBe(true);expect(b.issues()).toBe(0);
});
test('lost optional acknowledgement is retried using the same request before final signup',async({page})=>{
 const b=await welcomeBackend(page,{lost:true});await page.goto('/optional-signup-test');
 await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();
 await page.getByRole('checkbox',{name:marketing,exact:true}).check();
 await page.getByRole('button',{name:'동의하고 1만원 쿠폰 받아 가입 완료',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();expect(b.auth).toHaveLength(0);
 await page.getByRole('button',{name:'같은 선택으로 다시 확인하고 가입 완료',exact:true}).click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.writes[0]).toEqual(b.writes[1]);expect(b.issues()).toBe(1);expect(b.auth).toHaveLength(1);
});
test('optional backend failure does not prevent required-only signup',async({page})=>{
 const b=await welcomeBackend(page,{failure:true});await page.goto('/optional-signup-test');
 await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();
 await page.getByRole('button',{name:'필수만 동의하고 가입 완료',exact:true}).click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.auth).toHaveLength(1);expect(b.issues()).toBe(0);
});
test('retrying required consent never repeats saved optional receipts or coupon issuance',async({page})=>{
 const b=await welcomeBackend(page);let fail=true;
 await page.route('**/synthetic-auth/consent',async r=>r.fulfill({status:fail?503:200,json:{ok:!fail}}));
 await page.goto('/optional-signup-test');await page.getByRole('checkbox',{name:'[필수] 이용약관 및 개인정보처리방침 동의',exact:true}).check();
 await page.getByRole('checkbox',{name:marketing,exact:true}).check();await page.getByRole('button',{name:'동의하고 1만원 쿠폰 받아 가입 완료',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('약관 동의를 저장하지 못했습니다');expect(b.writes).toHaveLength(1);fail=false;
 await page.getByRole('button',{name:'동의하고 1만원 쿠폰 받아 가입 완료',exact:true}).click();await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.writes).toHaveLength(1);expect(b.issues()).toBe(1);
});
test('E card has only four empty round choices and individual details, with no group row',async({page},info)=>{
 await welcomeBackend(page);await page.goto('/consent-reward-test');const card=page.getByRole('dialog',{name:'선택 동의'});
 await expect(card.getByRole('checkbox')).toHaveCount(4);for(const c of await card.getByRole('checkbox').all())await expect(c).not.toBeChecked();
 await expect(card.getByText(/아래 4개/)).toHaveCount(0);await expect(card.getByRole('button',{name:'괜찮아요',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('welcome-e-collapsed.png'),fullPage:true});
 await card.getByRole('button',{name:'Meta 구매 정보 전송 (광고 성과 측정, 미국 이전) 자세히',exact:true}).click();await expect(card.getByText('합성 Meta 수신처')).toBeVisible();await expect(card.getByText('합성 구매액·이메일 해시·브라우저 정보')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('welcome-e-card.png'),fullPage:true});
});
test('marketing line only selects two channels; email-only still qualifies without analysis, overseas or Meta',async({page})=>{
 const b=await welcomeBackend(page);await page.goto('/consent-reward-test');await page.getByRole('checkbox',{name:marketing,exact:true}).check();
 await expect(page.getByRole('checkbox',{name:meta,exact:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'[선택] 맞춤 추천',exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'마케팅 정보 수신 (이메일·카카오) 자세히',exact:true}).click();await expect(page.getByRole('checkbox',{name:'이메일',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'카카오',exact:true})).toBeChecked();await page.getByRole('checkbox',{name:'카카오',exact:true}).uncheck();
 await page.getByRole('button',{name:'선택한 항목 동의하기',exact:true}).click();await expect(page.getByRole('status')).toContainText('1만원 쿠폰');expect(b.writes[0].choices).toEqual({email:true,kakao:false,analysis:false,overseas:false,meta:false});expect(b.issues()).toBe(1);
});
test('settings withdraws only the changed purpose; previously issued coupon stays',async({page})=>{
 const b=await welcomeBackend(page,{existing:true});await page.goto('/optional-consent-test');await page.getByRole('checkbox',{name:meta,exact:true}).uncheck();await expect(page.getByRole('status')).toContainText('저장');expect(b.writes[0].scope).toBe('meta');expect(b.snapshot().personal.choices).toEqual({analysis:true,overseas:true});expect(b.snapshot().reward.awarded).toBe(true);
});
test('lost settings acknowledgement can be read back before withdrawing without replaying a grant',async({page})=>{
 const b=await welcomeBackend(page,{lost:true});await page.goto('/optional-consent-test');await page.getByRole('checkbox',{name:marketing,exact:true}).check();await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'저장된 설정 다시 불러오기',exact:true}).click();await expect(page.getByRole('checkbox',{name:marketing,exact:true})).toBeChecked();await page.getByRole('checkbox',{name:marketing,exact:true}).uncheck();await expect(page.getByRole('status')).toBeVisible();expect(b.writes).toHaveLength(2);expect(b.writes[1].expected.marketing).toBe(b.writes[0].requestId);expect(b.issues()).toBe(1);
});
test('stale settings must be reloaded rather than silently overwriting another tab',async({page})=>{
 const b=await welcomeBackend(page,{conflict:true});await page.goto('/optional-consent-test');await page.getByRole('checkbox',{name:marketing,exact:true}).check();await expect(page.getByRole('alert')).toContainText('다른 화면');await expect(page.getByRole('button',{name:'같은 선택 다시 확인하기'})).toHaveCount(0);await page.getByRole('button',{name:'저장된 설정 다시 불러오기'}).click();await expect(page.getByRole('checkbox',{name:marketing,exact:true})).not.toBeChecked();expect(b.writes).toHaveLength(1);
});
