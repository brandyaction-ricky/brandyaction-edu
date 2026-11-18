import {finishOfficeReview} from './review-office.mjs';
import {chromium, expect} from '@playwright/test';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4499';
const path=process.env.ARRIVAL_QA_PATH || '/arrival';
const out=process.env.ARRIVAL_QA_OUTPUT || '/private/tmp/moonshot-work-trial-qa';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try {
for(const [name,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,hasTouch:name==='mobile',isMobile:name==='mobile',permissions:['clipboard-read','clipboard-write'],deviceScaleFactor:1});
  const page=await context.newPage(); const errors=[]; const api=[];
  page.on('pageerror',e=>errors.push(e.message)); page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});
  async function capture(stage){
    await page.locator('[data-work-step]').waitFor({state:'visible'});
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('#arrival-content').evaluate(e=>e.scrollTop=0);
    await page.screenshot({path:resolve(out,`${name}-${stage}.png`)});
  }
  try {
    await page.goto(base+path,{waitUntil:'domcontentloaded'});
    await finishOfficeReview(page);
    await page.getByRole('button',{name:/회사 업무에 AI를 써보고 싶어요/}).click();
    const step=page.locator('[data-work-step]');
    await expect(step).toHaveAttribute('data-work-step','0');
    await page.getByRole('button',{name:'예시 업무로 시작',exact:true}).click();
    await page.getByRole('radio',{name:'꼭 끝낼 일과 조정할 일부터'}).check();
    await capture('criteria');
    await page.getByRole('button',{name:'이 기준으로 첫 업무 맡기기',exact:true}).click();
    await page.getByRole('button',{name:'예시 메모 넣기',exact:true}).click();
    await page.getByRole('button',{name:'기준과 자료 함께 복사',exact:true}).click();
    const first=await page.evaluate(()=>navigator.clipboard.readText());
    expect(first).toContain('신입 동료 안내자료');expect(first).toContain('범위를 조정');
    expect(first).not.toContain('[피드백으로 보완한 기준]');
    await page.getByRole('button',{name:'첫 답변을 받았어요',exact:true}).click();
    await page.getByRole('textbox',{name:'내 말로 수정하기',exact:true}).fill('결정할 사항마다 선택지와 추가로 확인할 정보를 함께 보여줘. 확정된 사실과 제안을 구분해줘.');
    await capture('feedback');
    await page.getByRole('button',{name:'피드백 반영 요청 복사',exact:true}).click();
    const updated=await page.evaluate(()=>navigator.clipboard.readText());
    expect(updated).toContain('[피드백으로 보완한 기준]');expect(updated).toContain('선택지와 추가로 확인할 정보');expect(updated).toContain('신입 동료 안내자료');
    await page.getByRole('button',{name:'수정한 답변을 확인했어요',exact:true}).click();
    const secondInput=page.getByLabel('이번에 AI에게 맡길 자료 · 두 번째 업무',{exact:true});
    await secondInput.fill(await page.evaluate(()=>{const v=Object.keys(localStorage).map(k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}}).find(v=>v?.workTrial);return v.workTrial.firstTask;}));
    await expect(page.getByRole('button',{name:'기준과 자료 함께 복사',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'예시 메모 넣기',exact:true}).click();
    await expect(secondInput).toHaveValue(/워크숍/);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(step).toHaveAttribute('data-work-step','3');
    expect(await secondInput.inputValue()).toContain('워크숍');
    await page.getByRole('button',{name:'기준과 자료 함께 복사',exact:true}).click();
    const reused=await page.evaluate(()=>navigator.clipboard.readText());
    expect(reused).toContain('선택지와 추가로 확인할 정보');expect(reused).toContain('워크숍');expect(reused).not.toContain('신입 동료 안내자료');
    await capture('reuse');
    await page.getByRole('button',{name:'두 번째 답변을 받았어요',exact:true}).click();
    await page.getByText('두 번째 답변에서 기준이 지켜졌는지 확인하기',{exact:true}).click();
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button',{name:'매뉴얼 복사',exact:true}).click();
    const manual=await page.evaluate(()=>navigator.clipboard.readText());
    await expect(page.getByRole('button',{name:'매뉴얼 복사됨',exact:true})).toBeVisible();
    const manualCard=page.locator('article').filter({has:page.getByRole('button',{name:'매뉴얼 복사됨',exact:true})});
    await expect(manualCard.getByRole('status')).toContainText('복사했어요');
    await page.screenshot({path:resolve(out,`${name}-manual-copied.png`)});
    expect(manual).toContain('선택지와 추가로 확인할 정보');expect(manual).not.toContain('신입 동료 안내자료');expect(manual).not.toContain('워크숍');
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'파일로 받기',exact:true}).click();
    const download=await downloadEvent;expect(await readFile(await download.path(),'utf8')).toBe(manual);
    await page.reload({waitUntil:'domcontentloaded'});await expect(step).toHaveAttribute('data-work-step','4');await page.getByText('두 번째 답변에서 기준이 지켜졌는지 확인하기',{exact:true}).click();await expect(page.getByRole('checkbox').first()).toBeChecked();
    await capture('summary');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
    await page.getByRole('button',{name:'라이브에서 이어서 배우기',exact:true}).click();await page.locator('#arrival-desk-button').click();await expect(page.getByRole('link',{name:/Google 캘린더/})).toBeVisible();
    expect(await page.getByRole('link',{name:/Google 캘린더/}).getAttribute('href')).toContain('20261207T120000Z');
    await page.getByRole('button',{name:'내 AI 체험으로 돌아가기',exact:true}).click();await expect(step).toHaveAttribute('data-work-step','4');
    await page.getByText('두 번째 답변에서 기준이 지켜졌는지 확인하기',{exact:true}).click();
    await page.getByRole('button',{name:'피드백을 보완하고 다시 해보기',exact:true}).click();await expect(step).toHaveAttribute('data-work-step','2');
    await page.getByRole('textbox',{name:'내 말로 수정하기',exact:true}).fill('불확실한 내용은 먼저 확인해줘.');
    await page.reload({waitUntil:'domcontentloaded'});await expect(step).toHaveAttribute('data-work-step','2');
    const persisted=await page.evaluate(()=>Object.keys(localStorage).map(k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}}).find(v=>v?.workTrial).workTrial);
    expect(persisted.secondConfirmed).toBe(false);expect(persisted.checks).toEqual([false,false,false]);
    expect(errors).toEqual([]);expect(api).toEqual([]);
    results.push({device:name,viewport,passed:true,copyFirst:first.length,copyFeedback:updated.length,copyReuse:reused.length,manual:manual.length,apiRequests:api.length,errors,download:download.suggestedFilename()});
  } catch(e){await page.screenshot({path:resolve(out,`${name}-failure.png`)});throw e;}
  finally{await context.close();}
}
await writeFile(resolve(out,'results.json'),JSON.stringify({base,path,results},null,2));console.log(JSON.stringify({base,path,results},null,2));
}finally{await browser.close();}
