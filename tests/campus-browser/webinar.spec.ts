import {test,expect} from '@playwright/test';
test('operator copies scoped welcome and member links without publishing or changing enrollment',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const cohort='00000000-0000-4000-8000-000000000003';let writes=0;
 await page.route('**/api/admin/campus/webinars*',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{events:[],cohorts:[{id:cohort,name:'3기',courses:{title:'문샷',slug:'moonshot'}}]}});});
 await page.goto('/webinar-admin');await page.getByRole('button',{name:'새 행사 만들기'}).click();
 const hub=page.getByRole('region',{name:'대상별 캠퍼스 입장 링크'});
 await expect(hub.getByRole('button')).toHaveCount(0);
 await page.getByLabel('판매·권한 확인 기수').selectOption(cohort);
 await hub.getByRole('button',{name:'구매자 웰컴용 링크 복사'}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(new URL('/campus/enter?cohort='+cohort+'&welcome=1',page.url()).href);
 await expect(hub.getByRole('link',{name:'수강생 전용 열기 ↗'})).toHaveAttribute('href','/campus/enter?cohort='+cohort);
 await expect(hub.getByRole('link',{name:'웨비나 참여자용 열기 ↗'})).toHaveCount(0);
 expect(writes).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
test('anonymous preview enters, completes experience and opens a keyboard-accessible member gate without external calls',async({page})=>{
 const errors:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 await page.goto('/webinar');await page.getByRole('button',{name:'무료 캠퍼스 입장하기'}).click();await expect(page.getByRole('heading',{name:'배운 것을, 내 일의 성과로.'})).toBeVisible();
 await page.getByRole('button',{name:'문샷 체험존',exact:true}).click();await page.getByRole('button',{name:/고객·해결할 문제/}).click();await expect(page.getByText('첫 미션 완료!',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/문샷 공부방/}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('link',{name:'문샷 수강 신청'})).toBeVisible();await expect(dialog.getByRole('link',{name:'카카오 채널 상담'})).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('webinar-experience.png'),fullPage:true});expect(errors).toEqual([]);expect(writes).toEqual([]);
});
test('video remains disconnected until a deliberate click',async({page})=>{
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'Video fixture'}));
 await page.goto('/webinar?video');await expect(page.locator('iframe')).toHaveCount(0);await page.getByRole('button',{name:'무료 캠퍼스 입장하기'}).click();await expect(page.locator('iframe')).toHaveCount(0);await page.getByRole('button',{name:'영상 재생하기'}).click();await expect(page.locator('iframe')).toHaveAttribute('src',/youtube-nocookie.com\/embed\/abcdefghijk/);
});
test('member, nonmember, and failed access states use server decision and never silently send errors to checkout',async({page})=>{
 let result:{kind?:string;href?:string;error?:string}={kind:'member',href:'/campus/workspace?enrollmentId=abc'},status=200;
 await page.route('**/api/campus/webinar/*/events',r=>r.fulfill({status:204}));await page.route('**/api/campus/webinar/*/access*',r=>r.fulfill({status,json:result}));
 await page.goto('/webinar?api');await page.getByRole('button',{name:'무료 캠퍼스 입장하기'}).click();await page.getByRole('button',{name:/문샷 공부방/}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('link',{name:'내 문샷 공간으로 이동'})).toHaveAttribute('href',result.href!);await page.keyboard.press('Escape');
 result={kind:'offer'};await page.getByRole('button',{name:/문샷 공부방/}).click();await expect(modal.getByRole('link',{name:'문샷 수강 신청'})).toBeVisible();await page.keyboard.press('Escape');
 status=503;result={error:'연결 확인이 필요합니다.'};await page.getByRole('button',{name:/문샷 공부방/}).click();await expect(modal.getByRole('alert')).toHaveText('연결 확인이 필요합니다.');await expect(modal.getByRole('link',{name:'문샷 수강 신청'})).toHaveCount(0);
});
test('admin loads, edits, handles a conflict and exposes aggregate click counts accurately',async({page})=>{
 const event={slug:'moonshot-open',title:'문샷 테스트',description:'소개',status:'published',startsAt:'2026-11-07T10:00:00Z',endsAt:'2026-11-07T12:00:00Z',cohortId:'c1',detailPath:'/classes/moonshot',kakaoUrl:'',youtubeId:'',revision:'r1'};let saves=0;
 await page.route('**/api/admin/campus/webinars*',r=>{if(r.request().method()==='POST'){saves++;return r.fulfill({status:409,json:{error:'다른 운영자가 수정했습니다.'}});}if(r.request().url().includes('?'))return r.fulfill({json:{trackingEnabled:false,counts:{entry:10,experience:4,gate:3,detail:2,consult:1,checkout:2}}});return r.fulfill({json:{events:[event],cohorts:[{id:'c1',name:'3기',courses:{title:'문샷',slug:'moonshot'}}]}});});
 await page.goto('/webinar-admin');await page.getByRole('button',{name:/문샷 테스트/}).click();await page.getByRole('textbox',{name:'제목',exact:true}).fill('수정 제목');await page.getByRole('button',{name:'설정 저장'}).click();await expect(page.getByRole('status')).toContainText('다른 운영자');expect(saves).toBe(1);await page.getByRole('button',{name:'집계 새로고침'}).click();await expect(page.getByText(/새 이벤트가 저장되지 않습니다/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:test.info().outputPath('webinar-admin.png'),fullPage:true});
});
