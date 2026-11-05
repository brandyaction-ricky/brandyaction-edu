import {test,expect} from '@playwright/test';
test.setTimeout(120000);
async function library(page:import('@playwright/test').Page,query=''){
 await page.goto('/webinar'+query);await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'공간 이동',exact:true}).click();await page.getByRole('button',{name:'문샷 자료실 입장',exact:true}).click();await expect(page.frameLocator('iframe').locator('#office')).toHaveAttribute('data-room','library');
}
test('public library is a separate walkable space, empty until configured, with a clear return',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await library(page);
 const root=page.frameLocator('iframe').locator('#office');const x=await root.getAttribute('data-player-x');await root.focus();await page.keyboard.down('d');try{await expect(root).not.toHaveAttribute('data-player-x',x!,{timeout:10000});}finally{await page.keyboard.up('d');}
 await page.getByRole('button',{name:'자료·다시보기',exact:true}).click();await expect(page.getByRole('heading',{name:'자료를 준비하고 있어요'})).toBeVisible();
 await page.getByRole('button',{name:'자료·다시보기 닫기',exact:true}).click();await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await page.screenshot({path:test.info().outputPath('library-space.png')});
 await page.frameLocator('iframe').getByRole('button',{name:'오픈 캠퍼스로',exact:true}).click();await expect(root).toHaveAttribute('data-room','live');expect(errors).toEqual([]);
});
test('library filters public materials, downloads a file and loads YouTube only after play',async({page})=>{
 let videoRequests=0;await page.route('https://www.youtube-nocookie.com/**',r=>{videoRequests++;return r.fulfill({contentType:'text/html',body:'<p>QA video player</p>'});});
 await page.context().route('https://files.example.test/moonshot.pdf',r=>r.fulfill({contentType:'application/pdf',headers:{'Content-Disposition':'attachment; filename="moonshot.pdf"'},body:'%PDF-1.4\n%%EOF'}));
 await library(page,'?library=1');await page.getByRole('button',{name:'자료·다시보기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'검수용 무료 자료',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'검수용 다시보기',exact:true})).toBeVisible();await expect(page.getByText('비공개 검수 자료')).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'무료 자료 받기 ↓',exact:true}).click();expect((await download).suggestedFilename()).toBe('moonshot.pdf');
 await page.getByRole('button',{name:'다시보기',exact:true}).click();expect(videoRequests).toBe(0);await page.getByRole('button',{name:'큰 화면으로 보기 ▶',exact:true}).click();await expect(page.locator('iframe[title="검수용 다시보기"]')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/abcdefghijk');await expect.poll(()=>videoRequests).toBeGreaterThan(0);
 await page.getByRole('button',{name:'영상 닫기',exact:true}).click();await expect(page.locator('iframe[title="검수용 다시보기"]')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('operator adds, hides, reorders and saves library resources with the event revision',async({page})=>{
 const event={slug:'moonshot-open',title:'문샷 검수',description:'소개',status:'published',startsAt:'2026-11-07T10:00:00Z',endsAt:'2026-11-07T12:00:00Z',cohortId:'00000000-0000-4000-8000-000000000001',detailPath:'/classes/moonshot',kakaoUrl:'',youtubeId:'',revision:'00000000-0000-4000-8000-000000000002',resources:[]};let saved:{expectedRevision:string;event:{resources:{title:string;published:boolean}[]}}|undefined;
 await page.route('**/api/admin/campus/webinars',r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();return r.fulfill({json:{event:saved!.event}});}return r.fulfill({json:{events:[event],cohorts:[{id:'00000000-0000-4000-8000-000000000001',name:'3기',courses:{title:'문샷',slug:'moonshot'}}]}});});
 await page.goto('/webinar-admin');await page.getByRole('button',{name:/문샷 검수/}).click();await page.getByRole('button',{name:'+ 자료 추가',exact:true}).click();const first=page.getByRole('group',{name:'자료 1',exact:true});await first.getByLabel('제목',{exact:true}).fill('첫 무료 자료');await first.getByLabel('공개 파일 주소').fill('https://files.example.test/guide.pdf');await first.getByLabel('참여자에게 공개').check();
 await page.getByRole('button',{name:'+ 자료 추가',exact:true}).click();const second=page.getByRole('group',{name:'자료 2',exact:true});await second.getByLabel('종류').selectOption('youtube');await second.getByLabel('제목',{exact:true}).fill('비공개 다시보기');await second.getByLabel('유튜브 영상 주소').fill('https://youtu.be/abcdefghijk');await second.getByRole('button',{name:'위로',exact:true}).click();
 await page.getByRole('button',{name:'설정 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('저장했습니다');expect(saved!.expectedRevision).toBe('00000000-0000-4000-8000-000000000002');expect(saved!.event.resources.map(r=>[r.title,r.published])).toEqual([['비공개 다시보기',false],['첫 무료 자료',true]]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath('library-admin.png'),fullPage:true});
});
