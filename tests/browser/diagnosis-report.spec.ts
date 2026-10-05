import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { reportFiles } from './fixture/diagnosis-report-files.mjs';
const submitted={state:'submitted',revision:8,answers:[],submittedAt:'2026-10-01T00:00:00Z',needsReview:false,survey:{code:'needs6_n30',version:'synthetic',title:'합성 N6 검사',coreQuestionCount:0,questions:[]}};
const report=(state='queued')=>({state,updatedAt:'2026-10-01T00:00:00.000Z',canRetry:false,downloadAvailable:state==='ready'});
async function session(page:Page){await page.route('**/api/platform/diagnosis/session',r=>r.fulfill({json:submitted}));}

test('original HTML keeps its design and contents links while scripts and remote requests are blocked',async({page,context})=>{
  await session(page);
  const {html,markdown}=reportFiles.original,files:string[]=[];let remoteRequests=0;
  await context.addCookies([{name:'diagnosis_download_fixture',value:'original',url:`http://127.0.0.1:${process.env.FIXTURE_PORT || 4173}`}]);
  await page.route('https://invalid.test/**',r=>{remoteRequests++;return r.abort();});
  await context.route('**/api/platform/diagnosis/report*',r=>{const url=new URL(r.request().url());if(url.searchParams.has('html')){files.push('html');return r.fulfill({contentType:'text/html; charset=utf-8',body:html});}if(url.searchParams.has('download')){files.push('download');return r.fulfill({contentType:'text/markdown; charset=utf-8',body:markdown});}return r.fulfill({json:report('ready')});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'정밀 보고서가 준비됐어요.'})).toBeVisible();
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();
  const preview=page.getByRole('region',{name:'나의 정밀 보고서',exact:true}),frame=page.frameLocator('iframe[title="나의 N6 정밀 보고서"]');
  await expect(frame.getByRole('heading',{name:'합성 정밀 보고서'})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'보고서 읽기'})).toBeVisible();
  await expect(page.getByRole('button',{name:'학습으로 돌아가기'})).toHaveCount(0);
  const readerBox=(await preview.boundingBox())!,frameBox=(await page.locator('iframe').boundingBox())!,viewport=page.viewportSize()!;
  expect(readerBox.y).toBe(0);expect(readerBox.height).toBe(viewport.height);
  expect(frameBox.y+frameBox.height).toBe(viewport.height);
  expect(frameBox.height).toBeGreaterThan(viewport.height*.85);
  await expect(frame.locator('body')).toHaveCSS('color','rgb(27, 38, 52)');await expect(frame.locator('h1')).toHaveCSS('font-size','32px');
  await expect(frame.locator('.print-btn')).toBeHidden();
  expect(await frame.locator('body').evaluate(()=>Object.hasOwn(window,'reportExecuted'))).toBe(false);
  expect(await page.evaluate(()=>Object.hasOwn(window,'reportExecuted'))).toBe(false);expect(remoteRequests).toBe(0);
  await frame.getByRole('link',{name:'나의 행동 경향'}).click();
  expect(await frame.locator('#details').evaluate(el=>Math.abs(el.getBoundingClientRect().top))).toBeLessThan(2);
  await expect(page.getByRole('button',{name:'보고서 닫기'})).toBeInViewport();
  await page.screenshot({path:test.info().outputPath('diagnosis-report-reading.png')});
  await page.getByRole('button',{name:'보고서 닫기'}).click();await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button',{name:'보고서 열기',exact:true})).toBeFocused();
  await expect(page.getByRole('button',{name:'학습으로 돌아가기'})).toBeVisible();
  for(const [button,name,body] of [['HTML 파일 받기','N6-정밀보고서.html',html],['MD 파일 받기','N6-검사결과.md',markdown]]){
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:button}).click();const download=await pending;
    expect(download.suggestedFilename().normalize('NFC')).toBe(name);expect(await readFile((await download.path())!,'utf8')).toBe(body);
  }
  expect(files).toEqual(['html','html','download']);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-report-ready.png'),fullPage:true});
});
test('processing polls every 10 seconds and stops once ready',async({page})=>{
  await page.clock.install();await session(page);let state='queued',reads=0;
  await page.route('**/api/platform/diagnosis/report',r=>{reads++;return r.fulfill({json:report(state)});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'검사가 완료됐어요.'})).toBeVisible();const initial=reads;
  await expect(page.getByRole('heading',{name:'검사가 완료됐어요.'})).toHaveCSS('outline-style','none');
  const progress=page.getByRole('list',{name:'검사 진행 단계'});
  await expect(progress.getByRole('listitem')).toHaveCount(3);
  await expect(progress.locator('[aria-current="step"]')).toContainText('결과 분석 중');
  await expect(progress).toContainText('분석 대기');
  await expect(page.getByText('약 30분~1일',{exact:true})).toHaveCount(0);
  await expect(page.getByText('약 30분~3시간',{exact:true})).toBeVisible();
  await expect(page.getByText('화면을 닫아도 보고서는 계속 준비됩니다.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'진행 상태 다시 확인'})).toHaveCount(0);
  expect((await progress.boundingBox())!.y).toBeLessThan((await page.getByRole('heading').boundingBox())!.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-progress-queued.png'),fullPage:true});
  await page.clock.runFor(9000);expect(reads).toBe(initial);state='processing';await page.clock.runFor(1000);await expect(page.getByRole('heading',{name:'정밀 보고서를 만들고 있어요.'})).toBeVisible();
  state='ready';await page.clock.runFor(10000);await expect(page.getByRole('button',{name:'MD 파일 받기'})).toBeVisible();const readyReads=reads;await page.clock.runFor(60000);expect(reads).toBe(readyReads);
  await expect(progress.locator('[aria-current="step"]')).toHaveText('분석 완료');
  await expect(page.getByText('약 30분~1일',{exact:true})).toHaveCount(0);
});

test('review explains the hold with keyboard-accessible details and reflects a later ready status',async({page})=>{
  await page.clock.install();await session(page);let state='needs_review';
  await page.route('**/api/platform/diagnosis/report',r=>r.fulfill({json:report(state)}));
  await page.goto('/diagnosis-test?reports&admin');
  const progress=page.getByRole('list',{name:'검사 진행 단계'});
  await expect(progress.locator('[aria-current="step"]')).toContainText('확인 필요');
  await expect(progress).not.toContainText('결과 분석 중');
  await expect(page.getByText('약 30분~1일',{exact:true})).toHaveCount(0);
  await expect(page.getByText('확인할 항목이 있어 보고서 발급이 보류됐어요.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'MD 파일 받기'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'최신 상태 확인'})).toHaveCount(0);
  const description=page.locator('.diagnosis-report-description span');
  await expect(description).toHaveCount(3);
  expect((await description.nth(1).boundingBox())!.y).toBeGreaterThan((await description.first().boundingBox())!.y);
  const title=page.getByRole('heading',{name:'보고서 발급 전 확인이 필요해요.'});
  expect((await title.boundingBox())!.width).toBeLessThanOrEqual(640);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-progress-review.png'),fullPage:true});
  const toggle=page.locator('summary').filter({hasText:'자세한 안내'});
  await expect(page.getByRole('heading',{name:'얼마나 기다리면 되나요?'})).toBeVisible();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByText('지금은 완료 시간을 안내하기 어렵습니다.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'화면을 닫아도 되나요?'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-progress-review-expanded.png'),fullPage:true});
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'얼마나 기다리면 되나요?'})).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'얼마나 기다리면 되나요?'})).toBeVisible();
  await expect(page.getByText('운영팀에 현재 화면을 알려 주세요.',{exact:true})).toBeVisible();
  state='ready';await page.clock.runFor(10000);
  await expect(page.getByRole('button',{name:'MD 파일 받기'})).toBeVisible();
  await page.getByRole('button',{name:'관리자 화면으로 돌아가기'}).click();
  await expect(page).toHaveURL(url => url.pathname === '/admin');
});
test('printing opens the same original document without an opener and explains blocked popups',async({page})=>{
  await session(page);await page.route('**/api/platform/diagnosis/report*',r=>r.fulfill(new URL(r.request().url()).search?{contentType:'text/html',body:'<!doctype html><style>h1{color:rgb(12,34,56)}</style><h1>인쇄할 원본 보고서</h1>'}:{json:report('ready')}));
  await page.goto('/diagnosis-test?reports');
  await page.evaluate(()=>{const open=window.open.bind(window);window.open=(...args)=>{const popup=open(...args);if(popup)popup.print=()=>{Reflect.set(window,'printedReport',{opener:popup.opener===null,text:popup.document.body.textContent,policy:popup.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),color:popup.getComputedStyle(popup.document.querySelector('h1')!).color});};return popup;};});
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();
  const pending=page.waitForEvent('popup');await page.getByRole('button',{name:'PDF로 저장 · 인쇄'}).click();const popup=await pending;
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'printedReport'))).toMatchObject({opener:true,text:'인쇄할 원본 보고서',color:'rgb(12, 34, 56)'});
  expect((await page.evaluate(()=>Reflect.get(window,'printedReport'))).policy).toContain("script-src 'none'");await popup.close();
  await page.getByRole('button',{name:'보고서 닫기'}).click();
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();await page.evaluate(()=>{window.open=()=>null;});
  await page.getByRole('button',{name:'PDF로 저장 · 인쇄'}).click();await expect(page.getByRole('alert')).toContainText('팝업이 차단');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeInViewport();
});
test('reader keeps the footer out of a small screen and closing restores focus',async({page,browserName})=>{
  await session(page);
  await page.route('**/api/platform/diagnosis/report*',r=>r.fulfill(new URL(r.request().url()).search?{contentType:'text/html',body:'<h1>작은 화면 보고서</h1><p style="height:2000px">긴 보고서 본문</p>'}:{json:report('ready')}));
  await page.goto('/diagnosis-test?reports&admin');
  const open=page.getByRole('button',{name:'보고서 열기',exact:true});await open.click();
  await page.setViewportSize({width:320,height:568});
  const dialog=page.getByRole('dialog',{name:'보고서 읽기'});
  await expect(page.getByRole('button',{name:'관리자 화면으로 돌아가기'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'보고서 닫기'})).toBeInViewport();
  expect((await dialog.boundingBox())!.height).toBe(568);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const frameBox=(await page.locator('iframe').boundingBox())!;
  expect(frameBox.height).toBeGreaterThan(460);expect(frameBox.y+frameBox.height).toBe(568);
  await page.screenshot({path:test.info().outputPath('diagnosis-report-small-screen.png')});
  // WebKit suppresses key listeners inside a script-disabled sandbox; mobile uses the persistent close control.
  if(browserName==='webkit') await page.getByRole('button',{name:'보고서 닫기'}).click();
  else await page.frameLocator('iframe').getByRole('heading').press('Escape');
  await expect(dialog).toHaveCount(0);await expect(open).toBeFocused();
  await expect(page.getByRole('button',{name:'관리자 화면으로 돌아가기'})).toBeVisible();
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
});
test('network failure stops automatic reads until the learner explicitly refreshes',async({page})=>{
  await page.clock.install();await session(page);let failing=true,reads=0;
  await page.route('**/api/platform/diagnosis/report',r=>{reads++;return r.fulfill(failing?{status:503,json:{error:'연결을 확인해 주세요.'}}:{json:report('needs_review')});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('alert')).toContainText('연결을 확인');const failedReads=reads;await page.clock.runFor(60000);expect(reads).toBe(failedReads);
  failing=false;await page.getByRole('button',{name:'다시 연결하기'}).click();await expect(page.getByRole('heading',{name:'보고서 발급 전 확인이 필요해요.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'답변 제출하기'})).toHaveCount(0);await expect(page.getByRole('button',{name:'MD 파일 받기'})).toHaveCount(0);await expect(page.getByText('답변은 안전하게 접수됐어요.',{exact:true})).toBeVisible();
});
test('hidden pages pause polling and do not retain an open result preview',async({page})=>{
  await page.clock.install();await session(page);let reads=0;
  await page.route('**/api/platform/diagnosis/report*',r=>{reads++;return r.fulfill(new URL(r.request().url()).search?{contentType:'text/html',body:'<h1>합성 보고서</h1>'}:{json:report('ready')});});
  await page.goto('/diagnosis-test?reports');await page.getByRole('button',{name:'보고서 열기',exact:true}).click();await expect(page.getByRole('region',{name:'나의 정밀 보고서',exact:true})).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.getByRole('region',{name:'나의 정밀 보고서',exact:true})).toHaveCount(0);const before=reads;await page.clock.runFor(60000);expect(reads).toBe(before);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>reads).toBe(before+1);
});
test('a newly revoked download clears the ready actions and shows the access error',async({page})=>{
  await session(page);await page.route('**/api/platform/diagnosis/report*',r=>new URL(r.request().url()).search? r.fulfill({status:403,json:{error:'검사 결과를 이용할 수 있는 구매·수강 정보를 확인해 주세요.'}}):r.fulfill({json:report('ready')}));
  await page.goto('/diagnosis-test?reports');await page.getByRole('button',{name:'MD 파일 받기'}).click();await expect(page.getByRole('alert')).toContainText('구매·수강 정보를 확인');await expect(page.getByRole('button',{name:'MD 파일 받기'})).toHaveCount(0);
});
test('the rollout-off submitted view never calls the report API',async({page})=>{
  await session(page);let calls=0;await page.route('**/api/platform/diagnosis/report*',r=>{calls++;return r.fulfill({json:report('ready')});});
  await page.goto('/diagnosis-test');await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();expect(calls).toBe(0);
});
test('long-running generation pauses after 60 successful checks and can be refreshed manually',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Timer bound is identical across viewports.');
  await page.clock.install();await session(page);let reads=0;
  // A request arriving does not mean its JSON has been consumed. Wait until
  // the next poll is scheduled before advancing the browser's virtual clock.
  await page.addInitScript(()=>{
    const schedule=window.setTimeout.bind(window);
    Reflect.set(window,'diagnosisPollTimers',0);
    window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>{
      const timer=schedule(handler,delay,...args);
      if(delay===10000)Reflect.set(window,'diagnosisPollTimers',Reflect.get(window,'diagnosisPollTimers')+1);
      return timer;
    }) as typeof window.setTimeout;
  });
  await page.route('**/api/platform/diagnosis/report',async r=>{
    reads++;
    // Exercise a response arriving after the request counter has advanced.
    await new Promise(resolve=>setTimeout(resolve,25));
    await r.fulfill({json:report('processing')});
  });
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'정밀 보고서를 만들고 있어요.'})).toBeVisible();
  const initial=reads;
  for(let i=1;i<60;i++){
    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'diagnosisPollTimers'))).toBe(i);
    await page.clock.runFor(10000);
    await expect.poll(()=>reads).toBe(initial+i);
  }
  await expect(page.getByText('자동 확인을 잠시 멈췄어요.',{exact:false})).toBeVisible();const stopped=reads;await page.clock.runFor(120000);expect(reads).toBe(stopped);
  await page.getByRole('button',{name:'최신 상태 확인'}).click();await expect.poll(()=>reads).toBe(stopped+1);
});


test('mobile report contents and back-top scroll only within the reader',async({page})=>{
 await page.setViewportSize({width:390,height:844});await session(page);
 const html=`<!doctype html><html><head><style>body{margin:0}.report-topbar{position:sticky;top:0;background:white}.topbar-inner{display:flex;height:68px}.topbar-links{display:flex;gap:28px}.back-top{position:fixed;right:16px;bottom:16px}section{height:1500px}@media(max-width:900px){.topbar-links{display:none}}</style></head><body><nav class="report-topbar"><div class="topbar-inner"><b>MYIN</b><div class="topbar-links"><a href="#part1">욕구 구조</a><a href="#part2">행동 패턴</a></div></div></nav><section id="top"><h1>합성 보고서 시작</h1></section><section id="part1"><h2>욕구 구조 본문</h2></section><section id="part2"><h2>행동 패턴 본문</h2></section><a class="back-top" href="#top" aria-label="맨 위로">↑</a></body></html>`;
 await page.route('**/api/platform/diagnosis/report*',r=>new URL(r.request().url()).searchParams.has('html')?r.fulfill({contentType:'text/html',body:html}):r.fulfill({json:report('ready')}));
 await page.goto('/diagnosis-test?reports');await page.getByRole('button',{name:'보고서 열기',exact:true}).click();
 const frame=page.frameLocator('iframe[title="나의 N6 정밀 보고서"]');
 const before=await page.locator('iframe').boundingBox();
 for(let i=0;i<3;i++){
  await expect(frame.getByRole('link',{name:'행동 패턴',exact:true})).toBeVisible();
  await frame.getByRole('link',{name:'행동 패턴',exact:true}).click();
  await expect(frame.getByRole('heading',{name:'행동 패턴 본문'})).toBeInViewport();
  expect(await frame.locator('body').evaluate(()=>window.scrollY)).toBeGreaterThan(2000);
  await frame.getByRole('link',{name:'맨 위로'}).click();
  await expect.poll(()=>frame.locator('body').evaluate(()=>window.scrollY)).toBe(0);
  await expect(frame.getByRole('heading',{name:'합성 보고서 시작'})).toBeInViewport();
  expect(await page.locator('iframe').boundingBox()).toEqual(before);
  expect(await page.locator('dialog').evaluate(el=>el.scrollTop)).toBe(0);
 }
 await page.screenshot({path:test.info().outputPath('mobile-report-navigation.png')});
});

test('HTML and MD downloads still work when the in-app browser ignores blob links', async ({page,context}) => {
  await session(page);
  const {html,markdown}=reportFiles.embedded;
  await context.addCookies([{name:'diagnosis_download_fixture',value:'embedded',url:`http://127.0.0.1:${process.env.FIXTURE_PORT || 4173}`}]);
  await page.addInitScript(() => {
    const click=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(this.protocol==='blob:')return;click.call(this);};
  });
  await context.route('**/api/platform/diagnosis/report*',r=>{
    const url=new URL(r.request().url());
    if(!url.search)return r.fulfill({json:report('ready')});
    const isHtml=url.searchParams.has('html');
    return r.fulfill({contentType:isHtml?'text/html; charset=utf-8':'text/markdown; charset=utf-8',body:isHtml?html:markdown});
  });
  await page.goto('/diagnosis-test?reports');
  await expect(page.getByRole('heading',{name:'정밀 보고서가 준비됐어요.'})).toBeVisible();
  for(const [label,name,body] of [['HTML 파일 받기','N6-정밀보고서.html',html],['MD 파일 받기','N6-검사결과.md',markdown]]){
    const pending=page.waitForEvent('download',{timeout:6000});
    await page.getByRole('button',{name:label,exact:true}).click();
    const download=await pending;
    expect(download.suggestedFilename().normalize('NFC')).toBe(name);
    expect(await readFile((await download.path())!,'utf8')).toBe(body);
    await expect(page.getByRole('status')).toContainText('파일 저장 창을 확인');
    const again=page.getByRole('link',{name:'저장 창 다시 열기',exact:true});
    await expect(again).toHaveAttribute('href',/\/api\/platform\/diagnosis\/report\?(html|download)=1$/);
    await expect(page.getByRole('heading',{name:'정밀 보고서가 준비됐어요.'})).toBeVisible();
  }
});
