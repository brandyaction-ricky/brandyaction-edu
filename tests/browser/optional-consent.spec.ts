import { expect, test, type Page } from '@playwright/test';
const no={marketingUse:false,sms:false,kakao:false,email:false};
const at='2026-10-19T16:10:00Z';
async function backend(page:Page,options:{failure?:boolean;lost?:boolean;existing?:boolean;conflict?:boolean}={}){
 let stored={choices:options.existing?{...no,marketingUse:true,kakao:true}:no,revision:options.existing?'11111111-1111-4111-8111-111111111111':null as string|null,dates:{marketingUse:options.existing?at:null,sms:null,kakao:options.existing?at:null,email:null},updatedAt:options.existing?at:null,legacyRetired:true};
 let failure=options.failure,lost=options.lost;const writes:Record<string,unknown>[]=[],auth:Record<string,unknown>[]=[];
 const receipts=new Map<string,unknown>();
 await page.route('**/api/account/marketing-consent',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:stored});return;}
  const body=route.request().postDataJSON();writes.push(body);
  if(failure){await route.fulfill({status:503,json:{error:'수신 설정을 저장하지 못했어요.'}});return;}
  if(options.conflict){await route.fulfill({status:409,json:{error:'다른 화면에서 수신 설정을 바꿨어요. 저장된 설정을 다시 불러와 주세요.'}});return;}
  if(!receipts.has(body.requestId)){
   const changed=Object.entries(body.choices).flatMap(([kind,value])=>stored.revision&&stored.choices[kind as keyof typeof no]===value?[]:[{kind,action:value?'consent':stored.choices[kind as keyof typeof no]?'withdrawal':'refusal'}]);
   stored={...stored,choices:body.choices,revision:body.requestId,updatedAt:at,dates:Object.fromEntries(Object.entries(body.choices).map(([k,v])=>[k,v?at:null])) as typeof stored.dates};
   receipts.set(body.requestId,{...stored,changed});
  }
  if(lost){lost=false;await route.abort();return;}await route.fulfill({json:receipts.get(body.requestId)});
 });
 await page.route('**/synthetic-auth/consent',async route=>{auth.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
 return{writes,auth,setFailure:(v:boolean)=>{failure=v;}};
}
async function required(page:Page){await page.getByRole('checkbox',{name:'[필수] 이용약관 동의',exact:true}).check();await page.getByRole('checkbox',{name:'[필수] 개인정보처리방침 동의',exact:true}).check();}
test('signup is unchecked, skippable, contains no SMS choice and does not trust Auth marketing metadata',async({page})=>{
 const b=await backend(page);await page.goto('/optional-signup-test');
 for(const checkbox of await page.getByRole('checkbox').all())await expect(checkbox).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:/문자/})).toHaveCount(0);await required(page);await page.getByRole('button',{name:'동의하고 가입 완료'}).click();
 await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.writes).toHaveLength(0);expect(b.auth[0].data).not.toHaveProperty('marketing_consent');
});
test('signup with Kakao choice shows a dated receipt and continue, records no SMS and guards its dependency',async({page},info)=>{
 const b=await backend(page);await page.goto('/optional-signup-test');await required(page);await page.getByRole('checkbox',{name:'카카오톡 광고 받기',exact:true}).check();
 await page.getByRole('button',{name:'동의하고 가입 완료'}).click();await expect(page.getByRole('alert').last()).toContainText('내 정보');expect(b.writes).toHaveLength(0);
 await page.getByRole('checkbox',{name:'맞춤 소식에 내 정보를 사용하는 데 동의해요',exact:true}).check();await page.getByRole('button',{name:'동의하고 가입 완료'}).click();
 await expect(page.getByRole('status')).toContainText('2026년 10월 20일');expect(b.writes[0].choices).toEqual({...no,marketingUse:true,kakao:true});
 await page.screenshot({path:info.outputPath('consent-signup.png'),fullPage:true});
 await page.getByRole('button',{name:'계속하기',exact:true}).click();await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();
});
test('optional save failure never blocks signup once the user deselects optional news',async({page})=>{
 const b=await backend(page,{failure:true});await page.goto('/optional-signup-test');await required(page);await page.getByRole('checkbox',{name:'[선택] 교육·할인·행사 소식 받기 (광고)',exact:true}).check();await page.getByRole('button',{name:'동의하고 가입 완료'}).click();await expect(page.getByRole('alert')).toContainText('해제하고 가입');
 await page.getByRole('checkbox',{name:'[선택] 교육·할인·행사 소식 받기 (광고)',exact:true}).uncheck();await page.getByRole('button',{name:'동의하고 가입 완료'}).click();await expect(page.getByRole('heading',{name:'가입 완료 목적지'})).toBeVisible();expect(b.writes).toHaveLength(1);
});
test('profile withdraws immediately, handles a lost response with the same request and keeps dates truthful',async({page},info)=>{
 const b=await backend(page,{existing:true,lost:true});await page.goto('/optional-consent-test');await expect(page.getByRole('checkbox',{name:/카카오톡 광고 받기/})).toBeChecked();
 await page.getByRole('checkbox',{name:/카카오톡 광고 받기/}).uncheck();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('status')).toHaveCount(0);
 await page.getByRole('button',{name:'다시 저장하기'}).click();await expect(page.getByRole('status')).toContainText('카카오톡 광고 동의 철회');expect(b.writes[0]).toEqual(b.writes[1]);
 await page.screenshot({path:info.outputPath('consent-profile.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
test('stale profile settings never silently overwrite another tab',async({page})=>{
 const b=await backend(page,{conflict:true});await page.goto('/optional-consent-test');await page.getByRole('checkbox',{name:'맞춤 소식에 내 정보를 사용하는 데 동의해요',exact:true}).check();await expect(page.getByRole('alert')).toContainText('다른 화면');
 await page.getByRole('button',{name:'저장된 설정 다시 불러오기'}).click();await expect(page.getByRole('checkbox',{name:'맞춤 소식에 내 정보를 사용하는 데 동의해요',exact:true})).not.toBeChecked();expect(b.writes).toHaveLength(1);
});
