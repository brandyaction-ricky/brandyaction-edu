import { test, expect, type Page } from '@playwright/test';
const submitted={state:'submitted',revision:8,answers:[],submittedAt:'2026-10-01T00:00:00Z',needsReview:false,survey:{code:'needs6_n30',version:'synthetic',title:'합성 N6 검사',coreQuestionCount:0,questions:[]}};
const report=(state='queued')=>({state,updatedAt:'2026-10-01T00:00:00.000Z',canRetry:false,downloadAvailable:state==='ready'});
async function session(page:Page){await page.route('**/api/platform/diagnosis/session',r=>r.fulfill({json:submitted}));}

test('submitted answers progress to a safe preview and a fixed-name MD download',async({page})=>{
  await session(page);const markdown='---\ntitle: "합성 검사"\nreport_id: "hidden-report-id"\n---\n\n# 합성 검사 결과\n\n## 검사 점수\n\n| 욕구 | 점수 |\n| --- | --- |\n| 성장 | 80 |\n\n<script>window.reportExecuted=true</script>\n<img src="https://invalid.test/image" onerror="window.reportExecuted=true">\n[실행](javascript:alert(1))\n![[private-file]]';
  const files:string[]=[];await page.route('**/api/platform/diagnosis/report*',r=>{const url=new URL(r.request().url());if(url.searchParams.has('preview')){files.push('preview');return r.fulfill({json:{...report('ready'),markdown}});}if(url.searchParams.has('download')){files.push('download');return r.fulfill({contentType:'text/markdown; charset=utf-8',body:markdown});}return r.fulfill({json:report('ready')});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'검사 결과가 준비됐어요.'})).toBeVisible();
  await page.getByRole('button',{name:'결과 보기',exact:true}).click();const preview=page.getByRole('region',{name:'검사 결과 미리보기'});await expect(preview).toContainText('<script>window.reportExecuted=true</script>');
  await expect(preview.getByRole('heading',{name:'합성 검사 결과'})).toBeVisible();await expect(preview.getByRole('table')).toContainText('성장');await expect(preview).not.toContainText('hidden-report-id');await expect(preview).not.toContainText('report_id');
  await expect(preview.locator('script,img,a,iframe')).toHaveCount(0);expect(await page.evaluate(()=>Object.hasOwn(window,'reportExecuted'))).toBe(false);
  const pendingDownload=page.waitForEvent('download');await page.getByRole('button',{name:'MD 파일 받기'}).click();const download=await pendingDownload;expect(download.suggestedFilename()).toBe('N6-검사결과.md');expect(files).toEqual(['preview','download']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('diagnosis-report-ready.png'),fullPage:true});
});
test('processing polls every 10 seconds and stops once ready',async({page})=>{
  await page.clock.install();await session(page);let state='queued',reads=0;
  await page.route('**/api/platform/diagnosis/report',r=>{reads++;return r.fulfill({json:report(state)});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'답변을 받았어요.'})).toBeVisible();const initial=reads;
  await page.clock.runFor(9000);expect(reads).toBe(initial);state='processing';await page.clock.runFor(1000);await expect(page.getByRole('heading',{name:'나를 이해하는 결과를 만들고 있어요.'})).toBeVisible();
  state='ready';await page.clock.runFor(10000);await expect(page.getByRole('button',{name:'MD 파일 받기'})).toBeVisible();const readyReads=reads;await page.clock.runFor(60000);expect(reads).toBe(readyReads);
});
test('network failure stops automatic reads until the learner explicitly refreshes',async({page})=>{
  await page.clock.install();await session(page);let failing=true,reads=0;
  await page.route('**/api/platform/diagnosis/report',r=>{reads++;return r.fulfill(failing?{status:503,json:{error:'연결을 확인해 주세요.'}}:{json:report('needs_review')});});
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('alert')).toContainText('연결을 확인');const failedReads=reads;await page.clock.runFor(60000);expect(reads).toBe(failedReads);
  failing=false;await page.getByRole('button',{name:'진행 상태 다시 확인'}).click();await expect(page.getByRole('heading',{name:'결과를 만들기 전 확인 중이에요.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'답변 제출하기'})).toHaveCount(0);await expect(page.getByRole('button',{name:'MD 파일 받기'})).toHaveCount(0);await expect(page.getByText('다시 검사하거나 추가 결제할 필요는 없어요.',{exact:false})).toBeVisible();
});
test('hidden pages pause polling and do not retain an open result preview',async({page})=>{
  await page.clock.install();await session(page);let reads=0;
  await page.route('**/api/platform/diagnosis/report*',r=>{reads++;return r.fulfill({json:{...report('ready'),markdown:'# 합성 결과'}});});
  await page.goto('/diagnosis-test?reports');await page.getByRole('button',{name:'결과 보기',exact:true}).click();await expect(page.getByRole('region',{name:'검사 결과 미리보기'})).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.getByRole('region',{name:'검사 결과 미리보기'})).toHaveCount(0);const before=reads;await page.clock.runFor(60000);expect(reads).toBe(before);
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
  await page.goto('/diagnosis-test?reports');await expect(page.getByRole('heading',{name:'나를 이해하는 결과를 만들고 있어요.'})).toBeVisible();
  const initial=reads;
  for(let i=1;i<60;i++){
    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'diagnosisPollTimers'))).toBe(i);
    await page.clock.runFor(10000);
    await expect.poll(()=>reads).toBe(initial+i);
  }
  await expect(page.getByText('자동 확인을 잠시 멈췄어요.',{exact:false})).toBeVisible();const stopped=reads;await page.clock.runFor(120000);expect(reads).toBe(stopped);
  await page.getByRole('button',{name:'진행 상태 다시 확인'}).click();await expect.poll(()=>reads).toBe(stopped+1);
});
