import { expect, test } from '@playwright/test';
import { htmlPath, mockProductHtmlStorage } from './fixture/product-html-storage';

test('10MB HTML uploads outside the save payload, renders safely', async ({ page }, testInfo) => {
  await mockProductHtmlStorage(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '상세페이지', exact: true }).click();
  await page.getByRole('tab', { name: 'HTML 상세페이지', exact: true }).click();
  const source = '<!doctype html><html><body><h1>대용량 상세페이지</h1><style>h1{color:rgb(200,0,0)}</style><script>window.top.location="https://bad.example"</script><a href="#pp">신청하기</a><!--' + 'x'.repeat(10 * 1024 * 1024) + '--></body></html>';
  const uploads: number[] = [];
  page.on('request', request => { if (request.url().includes('/api/platform/upload')) uploads.push((request.postData() || '').length); });
  await page.locator('input[type=file][accept=".html,.htm,text/html"]').setInputFiles({ name: 'detail.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await expect(page.getByText(/detail.html · 업로드 완료/)).toBeVisible();
  expect(uploads).toHaveLength(1); expect(uploads[0]).toBeLessThan(1000);
  await page.getByText('HTML 디자인 확인', { exact: true }).click();
  await expect(page.frameLocator('iframe[title="상품 HTML 상세페이지"]').getByRole('heading', { name: '대용량 상세페이지' })).toBeVisible();
  await expect(page).toHaveURL(/product-sale-test$/);
  await expect(page.locator('iframe[title="상품 HTML 상세페이지"]')).toHaveAttribute('sandbox', 'allow-same-origin');
  await page.getByText('HTML 파일이 등록되었습니다', { exact: true }).scrollIntoViewIfNeeded();
  await page.locator('.product-editor').screenshot({ path: testInfo.outputPath('html-storage-upload.png') });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  const values = JSON.parse(await page.getByLabel('저장한 상품 값').innerText());
  expect(values.detail_html_file).toBe(htmlPath); expect(values.detail_html_document).toBeFalsy();
  expect(JSON.stringify(values).length).toBeLessThan(5000); expect(errors).toEqual([]);
  await page.goto('/product-sale-test?storedHtml=1');
  await page.getByRole('tab', { name: '상세페이지', exact: true }).click();
  await page.getByText('HTML 디자인 확인', { exact: true }).click();
  await expect(page.frameLocator('iframe[title="상품 HTML 상세페이지"]').getByRole('heading', { name: '대용량 상세페이지' })).toBeVisible();
});

test('an upload failure preserves the previous document and can be retried', async ({ page }) => {
  await mockProductHtmlStorage(page, { failUpload: true });
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '상세페이지', exact: true }).click();
  await page.getByRole('tab', { name: 'HTML 상세페이지', exact: true }).click();
  const input = page.locator('input[type=file][accept=".html,.htm,text/html"]');
  const file = { name: 'detail.html', mimeType: 'text/html', buffer: Buffer.from('<h1>보존할 상세페이지</h1>') };
  await input.setInputFiles(file);
  await expect(page.getByText(/파일 전송에 실패했습니다/)).toBeVisible();
  await mockProductHtmlStorage(page);
  await input.setInputFiles(file);
  await expect(page.getByText(/업로드 완료 · 상품을 저장하면/)).toBeVisible();
  // A subsequent failed replacement must not erase the successfully uploaded reference.
  await mockProductHtmlStorage(page, { failUpload: true });
  await input.setInputFiles({ ...file, name: 'replacement.html' });
  await expect(page.getByText(/파일 전송에 실패했습니다/)).toBeVisible();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  expect(JSON.parse(await page.getByLabel('저장한 상품 값').innerText()).detail_html_file).toBe(htmlPath);
});

test('save waits for HTML transfer and oversized files do not request an upload', async ({ page }) => {
  let finish!: () => void;
  const holdUpload = new Promise<void>(resolve => { finish = resolve; });
  await mockProductHtmlStorage(page, { holdUpload });
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '상세페이지', exact: true }).click();
  await page.getByRole('tab', { name: 'HTML 상세페이지', exact: true }).click();
  const input = page.locator('input[type=file][accept=".html,.htm,text/html"]');
  await input.setInputFiles({ name: 'detail.html', mimeType: 'text/html', buffer: Buffer.from('<h1>전송 대기</h1>') });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByText('HTML 파일 업로드가 끝난 뒤 저장해 주세요.')).toBeVisible();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  finish(); await expect(page.getByText(/업로드 완료 · 상품을 저장하면/)).toBeVisible();
  await input.setInputFiles({ name: 'too-large.html', mimeType: 'text/html', buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 'x') });
  await expect(page.getByText('HTML 파일은 20MB 이하로 등록해 주세요.')).toBeVisible();
});


test('a failed stored-document read can be retried without replacing the selected file', async ({ page }) => {
  // StrictMode may abort the first mount request. Keep the outage active until
  // the user retries instead of letting an aborted request consume the failure.
  let unavailable = true;
  await page.route('**/api/platform/product-html?*', route => route.fulfill(unavailable ? { status: 409, json: { error: 'synthetic temporary error' } } : { json: { url: '/recovered-document.txt' } }));
  await page.route('**/recovered-document.txt', route => route.fulfill({ contentType: 'text/plain', body: '<h1>복구된 상세페이지</h1>' }));
  await page.goto('/product-sale-test?storedHtml=1');
  await page.getByRole('tab', { name: '상세페이지', exact: true }).click();
  await page.getByText('HTML 디자인 확인', { exact: true }).click();
  await expect(page.getByText('상세페이지를 불러오지 못했습니다.', { exact: false })).toBeVisible();
  unavailable = false;
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.frameLocator('iframe[title="상품 HTML 상세페이지"]').getByRole('heading', { name: '복구된 상세페이지' })).toBeVisible();
});

test('stalled stored HTML times out and explicit retry recovers the same document',async({page})=>{
 await page.clock.install();
 let stalled=true;
 await page.route('**/api/platform/product-html?*',route=>{if(stalled)return;return route.fulfill({json:{url:'/recovered-document.txt'}});});
 await page.route('**/recovered-document.txt',route=>route.fulfill({contentType:'text/plain',body:'<h1>지연 후 복구된 상세</h1>'}));
 await page.goto('/product-sale-test?storedHtml=1');
 await page.getByRole('tab',{name:'상세페이지',exact:true}).click();
 await page.getByText('HTML 디자인 확인',{exact:true}).click();
 await expect(page.getByText('상세페이지를 불러오고 있습니다.')).toBeVisible();
 await page.clock.fastForward(31000);
 await expect(page.getByRole('alert')).toContainText('시간이 걸리고 있습니다');
 stalled=false;
 await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();
 await expect(page.frameLocator('iframe[title="상품 HTML 상세페이지"]').getByRole('heading',{name:'지연 후 복구된 상세'})).toBeVisible();
});
