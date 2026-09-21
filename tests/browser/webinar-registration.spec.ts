import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/api/conversion/followup**',route=>route.fulfill({json:{drafts:[],audienceState:'unmapped',counts:null,asOf:'2026-09-21T00:00:00Z'}}));
 await page.route('**/api/webinar/attendance**',route=>route.fulfill({json:{sessions:[]}}));
 await page.route('**/api/conversion/broadcast**',route=>route.fulfill({json:{sessions:[],offerReady:false,counts:[]}}));
});
test('cohortless application requires explicit agreement, displays success and reloads without duplicate submit',async({page})=>{
 let registered=false,writes=0;
 await page.route(/\/api\/webinar(?:\?|$)/,async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.agreed).toBe(true);expect(body.policy).toBe('2026-08-11');expect(body.user_id).toBeUndefined();registered=true;writes++;}
  return route.fulfill({json:{authenticated:true,revision:1,policy:'2026-08-11',registered}});
 });
 await page.goto('/webinar-test');
 const submit=page.getByRole('button',{name:'무료 웨비나 신청하기',exact:true});await expect(submit).toBeDisabled();expect(writes).toBe(0);
 await page.getByRole('checkbox').check();await submit.click();await expect(page.getByRole('heading',{name:'신청이 완료되었습니다.'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'신청이 완료되었습니다.'})).toBeVisible();expect(writes).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('missing paid mapping remains unknown while free-only campaign saves and generates links',async({page})=>{
 let campaign:null|Record<string,unknown>=null;
 await page.route(/\/api\/conversion\/webinar(?:\?|$)/,async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.paidCohort).toBeNull();campaign={id:'33333333-3333-4333-8333-333333333333',...body,revision:1};}
  return route.fulfill({json:{campaign,registrations:0,purchases:null,purchase_state:'unmapped'}});
 });
 await page.goto('/webinar-admin-test');
 await page.getByRole('combobox',{name:'웨비나 무료 상품',exact:true}).selectOption('22222222-2222-4222-8222-222222222222');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'웨비나 신청 설정 저장'}).click();
 await expect(page.getByText('유료 기수 연결 전 · 구매 실적 미확인',{exact:true})).toBeVisible();
 await expect(page.getByLabel('광고 방 신청 링크',{exact:true})).toHaveValue(/\/paid$/);
 await expect(page.getByText('신청 0건 · 웨비나 실제 참여: 미확인',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('registered member has no separate attendance action or attendance request',async({page})=>{
 let attendanceRequests=0;
 await page.route(/\/api\/webinar(?:\?|$)/,route=>route.fulfill({json:{authenticated:true,revision:1,policy:'2026-08-11',registered:true}}));
 await page.route('**/api/webinar/attendance**',route=>{attendanceRequests++;return route.fulfill({json:{sessions:[]}});});
 await page.goto('/webinar-test');
 await expect(page.getByRole('heading',{name:'신청이 완료되었습니다.'})).toBeVisible();
 await expect(page.getByRole('button',{name:/출석/})).toHaveCount(0);
 expect(attendanceRequests).toBe(0);
});
test('admin saves broadcast link without enabling unmapped paid offer',async({page})=>{
 const code='33333333-3333-4333-8333-333333333333';
 let session={phase:'first',url:null as string|null,enabled:false,offerEnabled:false,revision:1};let writes=0;
 await page.route(/\/api\/conversion\/webinar(?:\?|$)/,route=>route.fulfill({json:{campaign:{id:code,freeCourse:'22222222-2222-4222-8222-222222222222',paidCohort:null,enabled:true,revision:1},registrations:1,purchases:null,purchase_state:'unmapped'}}));
 await page.route('**/api/conversion/broadcast**',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.phase).toBe('first');expect(body.expected).toBe(1);expect(body.offerEnabled).toBe(false);session={...session,url:body.url,enabled:body.enabled,revision:2};writes++;}
  return route.fulfill({json:{sessions:[session],offerReady:false,counts:[]}});
 });
 await page.goto('/webinar-admin-test');
 await expect(page.getByRole('checkbox',{name:'첫 웨비나 유료 교육 안내 링크 활성화',exact:true})).toBeDisabled();
 await page.getByLabel('첫 웨비나 YouTube 주소',{exact:true}).fill('https://www.youtube.com/watch?v=abcdefghijk');
 await page.getByRole('checkbox',{name:'첫 웨비나 방송 이동 링크 활성화',exact:true}).check();
 await page.getByRole('button',{name:'첫 웨비나 링크 설정 저장',exact:true}).click();
 await expect(page.getByText('저장 버전 2 · 방송 링크 활성 · 교육 안내 링크 중지',{exact:true})).toBeVisible();expect(writes).toBe(1);
 await expect(page.getByLabel('첫 웨비나 광고방 방송 링크',{exact:true})).toHaveValue(new RegExp('/go/'+code+'/first/paid/live$'));
 await expect(page.getByLabel('첫 웨비나 오가닉방 방송 링크',{exact:true})).toHaveValue(/first\/organic\/live$/);
 await expect(page.getByLabel('첫 웨비나 공통 방송 링크',{exact:true})).toHaveValue(/first\/unknown\/live$/);
 await expect(page.getByLabel('첫 웨비나 광고방 교육 안내 링크',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('followup separates room and direct drafts, preserves reload and clears audience on denied refresh',async({page})=>{
 const code='33333333-3333-4333-8333-333333333333';let drafts:Record<string,unknown>[]=[];let writes=0,denied=false;
 await page.route(/\/api\/conversion\/webinar(?:\?|$)/,route=>route.fulfill({json:{campaign:{id:code,freeCourse:'22222222-2222-4222-8222-222222222222',paidCohort:null,enabled:true,revision:1},registrations:1,purchases:null,purchase_state:'unmapped'}}));
 await page.route('**/api/conversion/followup**',async route=>{
  if(denied)return route.fulfill({status:403,json:{error:'권한이 회수되었습니다.'}});
  if(route.request().method()==='POST'){const b=route.request().postDataJSON();expect(b.expected).toBe(0);drafts=[...drafts,{...b,revision:1}];writes++;}
  return route.fulfill({json:{drafts,audienceState:'ready',counts:{total:8,candidate:1,inactive:1,order_hold:3,no_consent:2,no_phone:1},asOf:'2026-09-21T00:00:00Z'}});
 });
 await page.goto('/webinar-admin-test');
 await expect(page.getByText('사이트 무료 신청 8명 중 개별 안내 검토 후보 1명',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'카톡방 공지 초안',exact:true}).fill('합성 앵콜 공지');
 await page.getByRole('textbox',{name:'문자·알림톡 개별 안내 초안',exact:true}).fill('합성 개별 안내');
 await page.getByRole('button',{name:'카톡방 공지 초안 저장',exact:true}).click();
 await expect(page.getByText('저장 버전 1 · 미발송 초안',{exact:true})).toHaveCount(1);

 await expect(page.getByRole('textbox',{name:'문자·알림톡 개별 안내 초안',exact:true})).toHaveValue('합성 개별 안내');
 await page.getByRole('button',{name:'문자·알림톡 개별 안내 초안 저장',exact:true}).click();
 await expect(page.getByText('저장 버전 1 · 미발송 초안',{exact:true})).toHaveCount(2);expect(writes).toBe(2);
 await page.reload();await expect(page.getByRole('textbox',{name:'카톡방 공지 초안',exact:true})).toHaveValue('합성 앵콜 공지');
 await expect(page.getByRole('textbox',{name:'문자·알림톡 개별 안내 초안',exact:true})).toHaveValue('합성 개별 안내');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 denied=true;await page.getByRole('button',{name:'후속 안내 초안·대상 다시 확인',exact:true}).click();
 await expect(page.getByText('권한이 회수되었습니다.',{exact:true})).toBeVisible();
 await expect(page.getByText('사이트 무료 신청 8명 중 개별 안내 검토 후보 1명',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'카톡방 공지 초안',exact:true})).toHaveCount(0);
});


test('workspace separates setup, results and followup without losing an unsaved draft',async({page})=>{
 const code='33333333-3333-4333-8333-333333333333';let writes=0;
 await page.route(/\/api\/conversion\/webinar(?:\?|$)/,route=>{
  if(route.request().method()!=='GET')writes++;
  return route.fulfill({json:{campaign:{id:code,freeCourse:'22222222-2222-4222-8222-222222222222',paidCohort:null,enabled:true,revision:4},registrations:1,purchases:null,purchase_state:'unmapped'}});
 });
 await page.goto('/webinar-admin-test?workspace=1');
 await expect(page.getByRole('combobox',{name:'웨비나 무료 상품',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'카톡방 공지 초안',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'2. 신청·구매 현황',exact:true}).click();
 await expect(page.getByText('신청 1건 · 웨비나 실제 참여: 미확인',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'이 무료 교육의 광고·웨비나 성과 보기'})).toHaveAttribute('href','/admin/landing?recruitment=sample&course=22222222-2222-4222-8222-222222222222');
 await expect(page.getByRole('combobox',{name:'웨비나 무료 상품',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'4. 후속 안내',exact:true}).click();
 await page.getByRole('textbox',{name:'카톡방 공지 초안',exact:true}).fill('아직 저장하지 않은 합성 초안');
 await page.getByRole('button',{name:'3. 방송·교육 링크',exact:true}).click();
 await expect(page.getByLabel('첫 웨비나 YouTube 주소',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'4. 후속 안내',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'카톡방 공지 초안',exact:true})).toHaveValue('아직 저장하지 않은 합성 초안');
 expect(writes).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
