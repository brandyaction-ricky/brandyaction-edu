import {expect,test} from '@playwright/test';
for(const syncFailed of [false,true])test(`EDU Kakao excludes MYIN service terms when Sync read ${syncFailed?'fails':'succeeds'}`,async({page})=>{
 const calls: Array<{provider:string;options:{queryParams?:Record<string,string>;scopes?:string;redirectTo:string}}> = [];
 await page.route('**/synthetic-supabase/auth/v1/settings',r=>r.fulfill({json:{external:{kakao:true,google:true}}}));
 await page.route('**/api/auth/kakao-sync',r=>r.fulfill({status:syncFailed?503:200,json:{options:{scopes:'phone_number,unknown,plusfriends',queryParams:{service_terms:'myin_terms_20261002'}}}}));
 await page.route('**/synthetic-auth/oauth',async r=>{calls.push(r.request().postDataJSON());await r.fulfill({json:{ok:true}});});
 await page.route('**/api/platform?**',r=>r.fulfill({json:{user:null,data:{},support:{}}}));
 await page.goto('/kakao-signup-test?next=%2Fmy%2Fcoupons');await page.getByRole('button',{name:'카카오로 계속하기',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);
 expect(calls[0].provider).toBe('kakao');expect(calls[0].options.queryParams).toEqual({service_terms:'user_age_check'});expect(calls[0].options.scopes).toBe(syncFailed?undefined:'phone_number,plusfriends');
 const callback=new URL(calls[0].options.redirectTo);expect(callback.searchParams.get('next')).toBe('/my/coupons');expect(callback.searchParams.get('provider')).toBe('kakao');
});
test('Google signup never receives Kakao service-term selection',async({page})=>{
 const calls: Array<{provider:string;options:{queryParams?:unknown}}> = [];
 await page.route('**/synthetic-supabase/auth/v1/settings',r=>r.fulfill({json:{external:{kakao:true,google:true}}}));
 await page.route('**/synthetic-auth/oauth',async r=>{calls.push(r.request().postDataJSON());await r.fulfill({json:{ok:true}});});
 await page.route('**/api/platform?**',r=>r.fulfill({json:{user:null,data:{},support:{}}}));
 await page.goto('/kakao-signup-test');await page.getByRole('button',{name:'G Google로 계속하기',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);expect(calls[0].provider).toBe('google');expect(calls[0].options.queryParams).toBeUndefined();
});
