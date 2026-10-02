import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const submitted={state:'submitted',revision:8,answers:[],submittedAt:'2026-10-01T00:00:00Z',needsReview:false,survey:{code:'needs6_n30',version:'synthetic',title:'합성 N6 검사',coreQuestionCount:0,questions:[]}};
const report=(state='queued')=>({state,updatedAt:'2026-10-01T00:00:00.000Z',canRetry:false,downloadAvailable:state==='ready'});
async function session(page:Page){await page.route('**/api/platform/diagnosis/session',r=>r.fulfill({json:submitted}));}

test('original HTML keeps its design and contents links while scripts and remote requests are blocked',async({page})=>{
  await session(page);
  const html='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;color:rgb(27,38,52)}h1{font:700 32px serif}.gap{height:1200px}#details{min-height:1400px}.print-btn{display:block}</style></head><body><h1>합성 정밀 보고서</h1><a href="#details">나의 행동 경향</a><button class="print-btn">기존 인쇄</button><script>window.reportExecuted=true;parent.reportExecuted=true</script><img src="https://invalid.test/image" onerror="window.reportExecuted=true"><div class="gap"></div><section id="details"><h2>나의 행동 경향</h2></section></body></html>';
  const markdown='# 합성 검사 결과\n\n다음 학습에서 사용합니다.',files:string[]=[];let remoteRequests=0;
  await page.route('https://invalid.test/**',r=>{remoteRequests++;return r.abort();});
  await page.route('**/api/platform/diagnosis/report*',r=>{const url=new URL(r.request().url());if(url.searchParams.has('html')){files.push('html');return r.fulfill({contentType:'text/html; charset=utf-8',body:html});}if(url.searchParams.has('download')){files.push('download');return r.fulfill({contentType:'text/markdown; charset=utf-8',body:markdown});}return r.fulfill({json:report('ready')});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'정밀 보고서가 준비됐어요.'})).toBeVisible();
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();
  const preview=page.getByRole('region',{name:'나의 정밀 보고서',exact:true}),frame=page.frameLocator('iframe[title="나의 N6 정밀 보고서"]');
  await expect(frame.getByRole('heading',{name:'합성 정밀 보고서'})).toBeVisible();
  await expect(frame.locator('body')).toHaveCSS('color','rgb(27, 38, 52)');await expect(frame.locator('h1')).toHaveCSS('font-size','32px');
  await expect(frame.locator('.print-btn')).toBeHidden();
  expect(await frame.locator('body').evaluate(()=>Object.hasOwn(window,'reportExecuted'))).toBe(false);
  expect(await page.evaluate(()=>Object.hasOwn(window,'reportExecuted'))).toBe(false);expect(remoteRequests).toBe(0);
  await frame.getByRole('link',{name:'나의 행동 경향'}).click();
  expect(await frame.locator('#details').evaluate(el=>Math.abs(el.getBoundingClientRect().top))).toBeLessThan(2);
  await page.getByRole('button',{name:'보고서 닫기'}).click();await expect(preview).toHaveCount(0);
  for(const [button,name,body] of [['HTML 파일 받기','N6-정밀보고서.html',html],['MD 파일 받기','N6-검사결과.md',markdown]]){
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:button}).click();const download=await pending;
    expect(download.suggestedFilename()).toBe(name);expect(await readFile((await download.path())!,'utf8')).toBe(body);
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
  await expect(page.getByText('약 30분~1일',{exact:true})).toBeVisible();
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
  expect((await title.boundingBox())!.width).toBeLessThanOrEqual(600);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-progress-review.png'),fullPage:true});
  const toggle=page.locator('summary').filter({hasText:'자세한 안내'});
  await expect(page.getByRole('heading',{name:'얼마나 기다리면 되나요?'})).toBeHidden();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(page.getByText('지금은 완료 시간을 안내하기 어렵습니다.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'화면을 닫아도 되나요?'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-progress-review-expanded.png'),fullPage:true});
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'얼마나 기다리면 되나요?'})).toBeHidden();
  await expect(page.getByText('운영팀에 현재 화면을 알려 주세요.',{exact:true})).toBeVisible();
  state='ready';await page.clock.runFor(10000);
  await expect(page.getByRole('button',{name:'MD 파일 받기'})).toBeVisible();
  await page.getByRole('button',{name:'관리자 화면으로 돌아가기'}).click();
  await expect(page).toHaveURL(/\/admin$/);
});
test('printing opens the same original document without an opener and explains blocked popups',async({page})=>{
  await session(page);await page.route('**/api/platform/diagnosis/report*',r=>r.fulfill(new URL(r.request().url()).search?{contentType:'text/html',body:'<!doctype html><style>h1{color:rgb(12,34,56)}</style><h1>인쇄할 원본 보고서</h1>'}:{json:report('ready')}));
  await page.goto('/diagnosis-test?reports');
  await page.evaluate(()=>{const open=window.open.bind(window);window.open=(...args)=>{const popup=open(...args);if(popup)popup.print=()=>{Reflect.set(window,'printedReport',{opener:popup.opener===null,text:popup.document.body.textContent,policy:popup.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),color:popup.getComputedStyle(popup.document.querySelector('h1')!).color});};return popup;};});
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();
  const pending=page.waitForEvent('popup');await page.getByRole('button',{name:'PDF로 저장 · 인쇄'}).click();const popup=await pending;
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'printedReport'))).toMatchObject({opener:true,text:'인쇄할 원본 보고서',color:'rgb(12, 34, 56)'});
  expect((await page.evaluate(()=>Reflect.get(window,'printedReport'))).policy).toContain("script-src 'none'");await popup.close();
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();await page.evaluate(()=>{window.open=()=>null;});
  await page.getByRole('button',{name:'PDF로 저장 · 인쇄'}).click();await expect(page.getByRole('alert')).toContainText('팝업이 차단');
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
