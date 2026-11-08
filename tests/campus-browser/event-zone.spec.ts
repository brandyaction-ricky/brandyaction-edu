import {test,expect} from '@playwright/test';
const slug='moonshot-winners-1108',cid='00000000-0000-4000-8000-000000000001';
const view={slug,title:'당첨을 축하합니다!',description:'라이브에 함께해 주셔서 감사합니다.',claimed:true,claimEndsAt:'2026-11-09T14:59:00Z',couponEndsAt:'2026-11-12T14:59:00Z',liveEndsAt:'2026-11-08T14:59:59.999Z',liveOwned:false,liveAvailable:true,resources:[{id:cid,title:'고객의 마음을 발견하는 AI 질문 모음',description:'내 사업에 맞는 질문을 골라 바로 실행해 보세요.',fileName:'문샷-당첨자료.pdf',published:true}],quote:{couponCode:'WIN_TEST',couponDiscount:100000,totalAmount:900000},detailPath:'/classes/moonshot'};
test('guest sees benefits before login, preserves invite and has no download',async({page})=>{
 await page.goto('/event-preview?invite='+'a'.repeat(64));
 await expect(page.getByRole('link',{name:'로그인하고 이벤트 자료 받기'})).toHaveAttribute('href',/login\?next=.*invite/);
 await expect(page.getByRole('link',{name:'자료 다운로드'})).toHaveCount(0);
 await expect(page.getByText('10만원 쿠폰 지급 완료')).toHaveCount(0);
 await expect(page.getByText('라이브 쿠폰 중복 가능')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('claim, receive live coupon, download and move to detail on mobile and desktop',async({page})=>{
 let claimed=0,live=0;
 await page.route('**/api/campus/event',async r=>{const body=r.request().postDataJSON();if(body.action==='claim')claimed++;if(body.action==='live')live++;await r.fulfill({json:body.action==='live'?{...view,liveOwned:true,quote:{couponCode:'1108+WIN_TEST',couponDiscount:400000,totalAmount:600000}}:view});});
 await page.goto('/event-preview?member=1&invite='+'a'.repeat(64));
 await expect(page.getByText('10만원 쿠폰이 내 계정에 지급됐어요.')).toBeVisible();expect(claimed).toBe(1);
 await expect(page.getByText('10만원 쿠폰 지급 완료')).toBeVisible();
 await expect(page.getByText('10만원은 이미 지급됐어요. 라이브 쿠폰은 아래 버튼을 눌러야 추가로 지급돼요.')).toBeVisible();
 await expect(page.getByRole('link',{name:'100,000원 혜택으로 문샷 과정 보기'})).toBeVisible();
 expect(live).toBe(0);
 await expect(page.getByText('받지 않으면 10만원 할인만 적용돼요!')).toBeVisible();
 await page.screenshot({path:test.info().outputPath('event-before-live-'+test.info().project.name+'.png'),fullPage:true});
 expect(page.url()).not.toContain('invite=');
 await expect(page.getByRole('link',{name:'자료 다운로드'})).toHaveAttribute('href',/file=/);
 await page.getByRole('button',{name:'30만원 더 받고 총 40만원 할인받기 (클릭)'}).click();
 await expect(page.getByText('라이브 쿠폰 수령 완료')).toBeVisible();expect(live).toBe(1);
 await expect(page.getByRole('button',{name:'30만원 더 받고 총 40만원 할인받기 (클릭)'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'라이브 30만원 쿠폰도 받았어요'})).toBeVisible();
 await expect(page.getByText('받지 않으면 10만원 할인만 적용돼요!')).toHaveCount(0);
 await expect(page.getByRole('link',{name:'400,000원 혜택으로 문샷 과정 보기'})).toHaveAttribute('href','/classes/moonshot?event='+slug);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('event-zone-'+test.info().project.name+'.png'),fullPage:true});
});
test('wrong or reused invitation displays retryable error and no documents',async({page})=>{
 await page.route('**/api/campus/event',r=>r.fulfill({status:403,json:{error:'이미 다른 계정에서 받은 초대 링크입니다.'}}));
 await page.goto('/event-preview?member=1&invite='+'b'.repeat(64));await expect(page.getByRole('alert')).toContainText('다른 계정');await expect(page.getByRole('link',{name:'자료 다운로드'})).toHaveCount(0);
});
test('admin can edit save and generate one-use invitations with readable fields',async({page})=>{
 let zone:Record<string,unknown>|null=null;
 await page.route('**/api/admin/campus/events*',async r=>{if(r.request().method()==='GET'){await r.fulfill({json:{zones:zone?[zone]:[],cohorts:[{id:cid,name:'5기',courses:{title:'문샷'}}],invites:[],counts:{},liveCoupon:{discount_value:300000,discount_type:'fixed',is_active:true,is_draft:false}}});return;}
 const b=r.request().postDataJSON();if(b.action==='save'){zone={...b.settings,revision:cid,shared_link:b.settings.sharedLink,cohort_id:cid,claim_ends_at:b.settings.claimEndsAt};await r.fulfill({json:{ok:true}});}else await r.fulfill({json:{links:[{id:cid,label:'당첨자 1',path:'/campus/event/'+slug+'?invite='+'a'.repeat(64)}]}});
 });
 await page.goto('/event-admin-preview');await page.getByLabel('이벤트 주소').fill(slug);await page.getByLabel('연결할 교육 기수').selectOption(cid);
 await page.getByLabel('혜택 수령 마감 · 한국 시간').fill('2026-11-09T23:59');await page.getByLabel('10만원 쿠폰 사용 마감 · 한국 시간').fill('2026-11-12T23:59');
 await page.getByRole('button',{name:'이벤트 설정 저장'}).click();await expect(page.getByRole('status')).toContainText('저장');
 await expect(page.getByRole('heading',{name:'공통 입장 링크'})).toBeVisible();await expect(page.getByRole('link',{name:/campus\/event/})).toHaveAttribute('href','/campus/event/'+slug);expect((zone as Record<string,unknown>|null)?.claimEndsAt).toBe('2026-11-09T14:59:59.999Z');
 await page.getByLabel('입장 방식',{exact:true}).selectOption('individual');await page.getByRole('button',{name:'이벤트 설정 저장'}).click();await expect(page.getByRole('status')).toContainText('저장');
 await page.getByRole('button',{name:'개별 링크 생성'}).click();await expect(page.getByRole('link',{name:/campus\/event/})).toHaveAttribute('href',/invite=/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('event-admin-'+test.info().project.name+'.png'),fullPage:true});
});

test('shared link login return and one automatic claim per account mount',async({page})=>{
 await page.goto('/event-preview?shared=1');
 await expect(page.getByRole('link',{name:'로그인하고 이벤트 자료 받기'})).toHaveAttribute('href','/login?next='+encodeURIComponent('/campus/event/'+slug));
 await expect(page.getByText('10만원 쿠폰 지급 완료')).toHaveCount(0);
 let claims=0;await page.route('**/api/campus/event',async r=>{claims++;expect(r.request().postDataJSON().invite).toBe('');await r.fulfill({json:{...view,sharedLink:true}});});
 await page.goto('/event-preview?shared=1&member=1');
 await expect(page.getByText('10만원 쿠폰이 내 계정에 지급됐어요.')).toBeVisible();expect(claims).toBe(1);
});

test('standalone event admin shares heading controls and responsive fields without writes',async({page,isMobile})=>{
 let writes=0;
 await page.route('**/api/admin/campus/events*',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{zones:[],cohorts:[],invites:[],counts:{},liveCoupon:{discount_value:300000,discount_type:'fixed',is_active:true,is_draft:false}}});});
 await page.goto('/event-admin-preview');
 for(const width of isMobile?[390,320]:[1440,834]){
  await page.setViewportSize({width,height:900});
  await expect(page.getByRole('heading',{level:1})).toHaveCSS('font-size','20px');
  const save=page.getByRole('button',{name:'이벤트 설정 저장'});await expect(save).toBeEnabled();
  await expect(save).toHaveCSS('background-color','rgb(201, 35, 45)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  if(isMobile){expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);await expect(page.getByLabel('이벤트 주소')).toHaveCSS('font-size','16px');}
  if(isMobile){const fieldBox=(await page.getByLabel('자료 추가 · 20MB 이하').boundingBox())!,saveBox=(await save.boundingBox())!;expect(saveBox.y).toBeGreaterThan(fieldBox.y+fieldBox.height);}
  await page.screenshot({path:test.info().outputPath('event-settings-'+width+'.png'),fullPage:true});
 }
 expect(writes).toBe(0);
});
