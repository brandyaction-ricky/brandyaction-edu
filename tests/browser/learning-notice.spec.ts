import { expect, test, type Page } from '@playwright/test';
const firstRevision = '11111111-1111-4111-8111-111111111111';
async function backend(page: Page, options: { readFailure?: boolean; responseLost?: boolean } = {}) {
  let stored = { message: '첫 전체 공지', revision: firstRevision }, readFailure = options.readFailure, responseLost = options.responseLost;
  const writes: {message:string;requestId:string;expectedRevision:string|null}[] = [];
  await page.route('**/api/platform/learning-notice**', async route => {
    if (route.request().method() === 'GET') {
      const manage = new URL(route.request().url()).searchParams.has('manage');
      if (manage && readFailure) { await route.fulfill({status:503,json:{error:'공지를 불러오지 못했습니다.'}});return; }
      await route.fulfill({json:manage?stored:{message:stored.message}});return;
    }
    const body = route.request().postDataJSON(); writes.push(body);
    if (body.requestId !== stored.revision && body.expectedRevision !== stored.revision) { await route.fulfill({status:409,json:{error:'다른 화면에서 공지를 변경했습니다. 최신 공지를 다시 불러와 주세요.'}});return; }
    stored = { message:body.message, revision:body.requestId };
    if (responseLost) {responseLost=false;await route.abort();return;}
    await route.fulfill({json:stored});
  });
  return { writes, setReadFailure:(value:boolean)=>{readFailure=value;}, setStored:(message:string)=>{stored={message,revision:'22222222-2222-4222-8222-222222222222'};}, stored:()=>stored };
}
test('notice preview, save, reload and clear preserve literal text and the existing learning screen', async ({page},info) => {
  const server=await backend(page);await page.goto('/learning-notice-test');
  const input=page.getByRole('textbox',{name:'공지 문구'}),savedBar=page.locator('.edu-front > .learning-notice-banner');
  await expect(input).toHaveValue('첫 전체 공지');await expect(savedBar).toHaveText('첫 전체 공지');
  const message='새 학습을 시작해 주세요. <img src=x onerror=alert(1)>\n'+'긴문구'.repeat(30);
  await input.fill(message);await expect(savedBar).toHaveText('첫 전체 공지');await expect(page.locator('.learning-notice-preview')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('.learning-notice-banner img')).toHaveCount(0);
  await page.getByRole('button',{name:'공지 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('공지를 저장했습니다.');await expect(savedBar).toHaveText(message);expect(server.writes).toHaveLength(1);
  const banner=await savedBar.boundingBox();expect(banner!.width).toBeLessThanOrEqual(page.viewportSize()!.width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({path:info.outputPath('learning-notice.png'),fullPage:true});
  await page.reload();await expect(input).toHaveValue(message);await input.fill('');await page.getByRole('button',{name:'공지 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('공지를 숨겼습니다.');await expect(savedBar).toHaveCount(0);await expect(page.getByRole('heading',{name:'기존 학습 본문'})).toBeVisible();
});
test('read failure blocks saves; a lost response reuses the original request and does not clear the draft',async({page})=>{
  const server=await backend(page,{readFailure:true,responseLost:true});await page.goto('/learning-notice-test');
  await expect(page.getByRole('alert')).toHaveText('공지를 불러오지 못했습니다.');await expect(page.getByRole('button',{name:'공지 저장',exact:true})).toBeDisabled();
  server.setReadFailure(false);await page.getByRole('button',{name:'저장된 공지 다시 불러오기'}).click();const input=page.getByRole('textbox',{name:'공지 문구'});await expect(input).toHaveValue('첫 전체 공지');await input.fill('응답 유실 후 보관');
  await page.getByRole('button',{name:'공지 저장',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(input).toHaveValue('응답 유실 후 보관');await page.getByRole('button',{name:'공지 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('공지를 저장했습니다.');expect(server.writes).toHaveLength(2);expect(server.writes[0]).toEqual(server.writes[1]);
});
test('concurrent changes keep unsaved text and ask before reload or leaving the page',async({page})=>{
  const server=await backend(page);await page.goto('/learning-notice-test');const input=page.getByRole('textbox',{name:'공지 문구'});await expect(input).toHaveValue('첫 전체 공지');await input.fill('내가 작성하던 공지');
  server.setStored('다른 직원이 저장한 공지');await page.getByRole('button',{name:'공지 저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('다른 화면');await expect(input).toHaveValue('내가 작성하던 공지');expect(server.stored().message).toBe('다른 직원이 저장한 공지');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'다른 화면'}).click();await expect(page).toHaveURL(/learning-notice-test/);
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'저장된 공지 다시 불러오기'}).click();await expect(input).toHaveValue('내가 작성하던 공지');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'저장된 공지 다시 불러오기'}).click();await expect(input).toHaveValue('다른 직원이 저장한 공지');await expect(page.getByRole('button',{name:'공지 저장',exact:true})).toBeDisabled();
});

test('a timed-out initial read reports an error and a fresh retry cannot be overwritten by the late response',async({page})=>{
  await page.clock.install();let slow=true,started=false,release=()=>{};
  const delayed=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/platform/learning-notice**',async route=>{
    if(!new URL(route.request().url()).searchParams.has('manage')){await route.fulfill({json:{message:''}});return;}
    if(slow){started=true;await delayed;await route.fulfill({json:{message:'늦은 예전 공지',revision:firstRevision}}).catch(()=>{});return;}
    await route.fulfill({json:{message:'최신 공지',revision:firstRevision}});
  });
  await page.goto('/learning-notice-test');await expect.poll(()=>started).toBe(true);
  await expect(page.getByRole('button',{name:'저장된 공지 다시 불러오기'})).toBeDisabled();
  await page.clock.fastForward(11_000);await expect(page.getByRole('alert')).toContainText('조회 시간이 초과');
  slow=false;await page.getByRole('button',{name:'저장된 공지 다시 불러오기'}).click();await expect(page.getByRole('textbox',{name:'공지 문구'})).toHaveValue('최신 공지');
  release();await expect(page.getByRole('textbox',{name:'공지 문구'})).toHaveValue('최신 공지');
});
