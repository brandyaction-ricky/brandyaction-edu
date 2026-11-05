import {test,expect} from '@playwright/test';
test('operator copies scoped welcome and member links without publishing or changing enrollment',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const cohort='00000000-0000-4000-8000-000000000003';let writes=0;
 await page.route('**/api/admin/campus/webinars*',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{events:[],cohorts:[{id:cohort,name:'3기',courses:{title:'문샷',slug:'moonshot'}}]}});});
 await page.goto('/webinar-admin');await page.getByRole('button',{name:'새 행사 만들기'}).click();
 const hub=page.getByRole('region',{name:'대상별 캠퍼스 입장 링크'});
 await expect(hub.getByRole('button')).toHaveCount(0);
 await page.getByLabel('연결할 교육 기수').selectOption(cohort);
 await hub.getByRole('button',{name:'구매자 웰컴용 링크 복사'}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(new URL('/campus/enter?cohort='+cohort+'&welcome=1',page.url()).href);
 await expect(hub.getByRole('link',{name:'수강생 전용 열기 ↗'})).toHaveAttribute('href','/campus/enter?cohort='+cohort);
 await expect(hub.getByRole('link',{name:'웨비나 참여자용 열기 ↗'})).toHaveCount(0);
 expect(writes).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
test.setTimeout(120000);
async function enter(page:import('@playwright/test').Page,path='/webinar') {await page.goto(path);await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});await expect(page.getByRole('button',{name:'공간 전체 보기',exact:true})).toBeEnabled();}
async function gate(page:import('@playwright/test').Page,name='문샷 공부방'){await page.getByRole('button',{name:'공간 이동',exact:true}).click();await page.getByRole('button',{name:name+' 입장',exact:true}).click();return page.getByRole('dialog',{name:'공간 입장 안내',exact:true});}
async function activity(page:import('@playwright/test').Page,name:string){await page.getByRole('button',{name:'이 공간에서 할 일',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();}
test('anonymous visitor customizes, walks, views map and explores private-space invitations without private calls',async({page,isMobile})=>{
 const errors:string[]=[],calls:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))calls.push(r.url());});
 await page.goto('/webinar');await page.getByRole('button',{name:'캐릭터 꾸미고 입장',exact:true}).click({timeout:90000});const world=page.frameLocator('iframe'),editor=world.getByRole('dialog',{name:'캐릭터 꾸미기'});
 await editor.getByLabel('닉네임').fill('첫 도약 방문자');await editor.getByLabel('캐릭터 유형').selectOption('female');await editor.getByLabel('외형 스타일').selectOption('4');await editor.getByRole('button',{name:'저장하기',exact:true}).click();await expect(editor).toBeHidden();await expect(page.getByRole('region',{name:'방문자 입장'})).toHaveCount(0);
 await expect(page.getByLabel('입장 권한 체험',{exact:true})).toHaveCount(0);await expect(page.getByLabel('지도에서 권한 체험')).toHaveCount(0);
 const root=world.locator('#office');await expect(root).toHaveAttribute('data-room','live');const x=await root.getAttribute('data-player-x');
 if(isMobile){const b=(await world.getByRole('button',{name:'오른쪽 이동',exact:true}).boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}else{await root.focus();await page.keyboard.down('d');}try{await expect(root).not.toHaveAttribute('data-player-x',x!,{timeout:10000});}finally{if(isMobile)await page.mouse.up();else await page.keyboard.up('d');}
 await expect(root).toHaveAttribute('data-camera-mode','third');await page.getByRole('button',{name:'1인칭으로 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','first');await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','overall');
 await world.getByRole('button',{name:'내 AI 사무실',exact:true}).click();await expect(page.getByRole('dialog',{name:'공간 입장 안내'}).getByRole('heading',{name:'내 AI 사무실',exact:true})).toBeVisible();await page.getByRole('button',{name:'공간 입장 안내 닫기'}).click();
 for(const name of ['문샷 공부방','내 AI 사무실','문샷 웰컴 존']){const d=await gate(page,name);await expect(d.getByRole('heading',{name,exact:true})).toBeVisible();await expect(d.getByRole('link',{name:'문샷 과정 자세히 보기'})).toBeVisible();await expect(d.getByRole('link',{name:'카카오 채널로 문의하기'})).toBeVisible();await expect(root).toHaveAttribute('data-room','live');await d.getByRole('button',{name:'공간 입장 안내 닫기'}).click();}
 await activity(page,'고객 발견 체험');await page.getByRole('button',{name:'O 맞아요',exact:true}).click();await expect(page.getByText('정답이에요!',{exact:true})).toBeVisible();await page.getByRole('button',{name:'고객 발견 체험 닫기'}).click();
 await page.reload();await page.getByRole('button',{name:'캐릭터 꾸미고 입장',exact:true}).click({timeout:90000});await expect(editor.getByLabel('닉네임')).toHaveValue('첫 도약 방문자');await expect(editor.getByLabel('외형 스타일')).toHaveValue('4');await editor.getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'이 캐릭터로 바로 입장'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();expect(errors).toEqual([]);expect(calls).toEqual([]);
});
test('public exploration never embeds video even when an old event has a video ID',async({page})=>{
 const youtube:string[]=[];page.on('request',r=>{if(/youtube|googlevideo/.test(r.url()))youtube.push(r.url());});await enter(page,'/webinar?video');await expect(page.getByRole('banner').getByText('문샷 오픈 캠퍼스',{exact:true})).toBeVisible();await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);await expect(page.frameLocator('iframe').getByRole('button',{name:'라이브 보기',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'이 공간에서 할 일',exact:true}).click();await expect(page.getByRole('button',{name:'문샷 라이브',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'고객 발견 체험',exact:true})).toBeVisible();expect(youtube).toEqual([]);
});
test('configured conversion links and deliberate member check preserve server decisions and failed-access retry',async({page})=>{
 let result:{kind?:string;href?:string;error?:string}={kind:'member',href:'/campus/workspace?enrollmentId=abc'},status=200;const events:string[]=[],privateCalls:string[]=[];
 await page.route('**/api/campus/webinar/*/events',r=>{events.push(r.request().postDataJSON().event);return r.fulfill({status:204});});await page.route('**/api/campus/webinar/*/access*',r=>{privateCalls.push(r.request().url());return r.fulfill({status,json:result});});
 await enter(page,'/webinar?api');let d=await gate(page);expect(privateCalls).toHaveLength(0);await expect(d.getByRole('link',{name:'문샷 과정 자세히 보기'})).toHaveAttribute('href','/classes/moonshot');await expect(d.getByRole('link',{name:'카카오 채널로 문의하기'})).toHaveAttribute('href','https://pf.kakao.com/_moonshot/chat');await expect(d.getByRole('link',{name:'문샷 과정 자세히 보기'})).toHaveAttribute('target','_blank');
 await d.getByText('이미 구매한 수강생인가요?',{exact:true}).click();await d.getByRole('button',{name:'내 수강권으로 입장하기'}).click();await expect(d.getByRole('link',{name:'내 문샷 공간으로 이동'})).toHaveAttribute('href',result.href!);await page.keyboard.press('Escape');
 result={kind:'offer'};d=await gate(page,'내 AI 사무실');await d.getByText('이미 구매한 수강생인가요?',{exact:true}).click();await d.getByRole('button',{name:'내 수강권으로 입장하기'}).click();await expect(d.getByText(/이 행사와 연결된 기수의 수강권이 없어요/)).toBeVisible();await page.keyboard.press('Escape');
 status=503;result={error:'연결 확인이 필요합니다.'};d=await gate(page);await d.getByText('이미 구매한 수강생인가요?',{exact:true}).click();await d.getByRole('button',{name:'내 수강권으로 입장하기'}).click();await expect(d.getByRole('alert')).toContainText('연결 확인이 필요합니다.');await expect(d.getByRole('link',{name:'내 문샷 공간으로 이동'})).toHaveCount(0);status=200;result={kind:'login',href:'/login?next=webinar'};await d.getByRole('button',{name:'내 수강권으로 입장하기'}).click();await expect(d.getByRole('link',{name:'에듀 계정으로 로그인'})).toHaveAttribute('href',result.href!);
 expect(events.filter(x=>x==='entry')).toHaveLength(1);expect(events.filter(x=>x==='gate')).toHaveLength(1);
});
test('course information opens from the activity panel and leaves the visitor in the campus',async({page,context})=>{
 await page.route('**/api/campus/webinar/*/events',r=>r.fulfill({status:204}));
 await context.route('**/classes/moonshot',r=>r.fulfill({contentType:'text/html',body:'<h1>Course information destination</h1>'}));
 await enter(page,'/webinar?api');await activity(page,'문샷에서 배우는 것');
 const opened=page.waitForEvent('popup');await page.getByRole('dialog',{name:'문샷에서 배우는 것',exact:true}).getByRole('link',{name:'상세페이지 크게 보기 ↗'}).click();
 const destination=await opened;await expect(destination.getByRole('heading',{name:'Course information destination'})).toBeVisible();await destination.close();
 await expect(page.getByRole('dialog',{name:'문샷에서 배우는 것',exact:true})).toBeVisible();await page.getByRole('button',{name:'문샷에서 배우는 것 닫기'}).click();await expect(page.frameLocator('iframe').locator('#office')).toHaveAttribute('data-room','live');
});
test('admin loads, edits, handles a conflict and exposes aggregate click counts accurately',async({page})=>{
 const event={slug:'moonshot-open',title:'문샷 테스트',description:'소개',status:'published',startsAt:'2026-11-07T10:00:00Z',endsAt:'2026-11-07T12:00:00Z',cohortId:'c1',detailPath:'/classes/moonshot',kakaoUrl:'',youtubeId:'',revision:'r1'};let saves=0;
 await page.route('**/api/admin/campus/webinars*',r=>{if(r.request().method()==='POST'){saves++;return r.fulfill({status:409,json:{error:'다른 운영자가 수정했습니다.'}});}if(r.request().url().includes('?'))return r.fulfill({json:{trackingEnabled:false,counts:{entry:10,experience:4,gate:3,detail:2,consult:1,checkout:2}}});return r.fulfill({json:{events:[event],cohorts:[{id:'c1',name:'3기',courses:{title:'문샷',slug:'moonshot'}}]}});});
 await page.goto('/webinar-admin');await page.getByRole('button',{name:/문샷 테스트/}).click();await page.getByRole('textbox',{name:'제목',exact:true}).fill('수정 제목');await page.getByRole('button',{name:'설정 저장'}).click();await expect(page.getByRole('status')).toContainText('다른 운영자');expect(saves).toBe(1);await page.getByRole('button',{name:'집계 새로고침'}).click();await expect(page.getByText(/새 이벤트가 저장되지 않습니다/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:test.info().outputPath('webinar-admin.png'),fullPage:true});
});

test('unavailable 3D still lets visitors read space benefits without private APIs',async({page})=>{await page.route('**/campus/world/office/vendor/office3d.js',r=>r.abort());await page.goto('/webinar');await page.getByRole('button',{name:'공간 안내로 입장',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'내 AI 사무실 입장',exact:true}).click();await expect(page.getByRole('dialog',{name:'공간 입장 안내'}).getByRole('heading',{name:'내 AI 사무실',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'문샷 과정 자세히 보기'})).toBeVisible();});
