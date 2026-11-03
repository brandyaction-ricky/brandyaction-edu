import { expect, test } from '@playwright/test';

const visit = (key: string) => `/admin-ux-audit-test?comments=${key}`;

for (const screen of ['coupons', 'tags', 'customers', 'banners', 'articles', 'testimonials']) {
  test(`${screen}: shared header and single catalog frame preserve rows`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(visit(screen));
    await expect(page.locator('.admin-catalog-panel')).toBeVisible();
    expect(await page.locator('.admin-page-header').evaluate(element => getComputedStyle(element).borderBottomWidth)).toBe('0px');
    const table = page.locator('.admin-catalog-panel>.admin-table-frame>.admin-table-scroll');
    await expect(table).toBeVisible();
    expect(await table.evaluate(element => [getComputedStyle(element).borderTopWidth, getComputedStyle(element).borderBottomWidth])).toEqual(['0px', '0px']);
    await expect(table.locator('tbody tr')).not.toHaveCount(0);
    const filter = page.locator('.admin-catalog-panel>.admin-filter-bar');
    if (await filter.count()) expect(await filter.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#admin-sidebar .workspace-label')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${screen}.png`), fullPage: false });
  });
}

test('member search has clear field hierarchy and retains the original scope callbacks', async ({ page }) => {
  await page.goto(visit('customers'));
  const search = page.getByRole('searchbox', { name: '회원 관리 목록 검색' });
  const course = page.getByRole('combobox', { name: '수강 클래스' });
  const status = page.getByRole('combobox', { name: '상태 필터' });
  await expect(search).toBeVisible();
  expect((await search.boundingBox())!.y).toBeLessThan((await course.boundingBox())!.y);
  await search.fill('검수');
  await expect(page.getByLabel('합성 검색 조건')).toContainText('"query":""');
  await search.press('Enter');
  await expect(page.getByLabel('합성 검색 조건')).toContainText('"query":"검수"');
  await course.selectOption('course-a');
  await status.selectOption('active');
  await expect(page.getByLabel('합성 검색 조건')).toHaveText('{"query":"검수","status":"active","course":"course-a"}');
  await page.getByRole('button', { name: '검색 초기화', exact: true }).click();
  await expect(page.getByLabel('합성 검색 조건')).toHaveText('{"query":"","status":"","course":""}');
  await expect(page.getByLabel('합성 저장 요청')).toHaveText('null');
});

test('all 85 questions and the full selected body remain reachable without clipping', async ({ page, viewport }, info) => {
  await page.goto(visit('questions'));
  const list = page.getByRole('region', { name: '질문 목록', exact: true });
  const items = list.getByRole('button');
  await expect(items).toHaveCount(85);
  const detail = page.getByRole('article', { name: '선택한 질문 상세' });
  await detail.getByText('본문 끝 확인', { exact: false }).scrollIntoViewIfNeeded();
  await expect(detail).toContainText('본문 끝 확인');
  await detail.getByRole('button', { name: '질문 보관', exact: true }).focus();
  await expect(detail.getByRole('button', { name: '질문 보관', exact: true })).toBeInViewport();
  const last = items.last();
  await last.focus();
  await expect(last).toBeInViewport();
  const bounds = await last.boundingBox(), container = await list.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(container!.y + container!.height + 1);
  await last.press('Enter');
  await expect(detail.getByRole('heading')).toContainText('85번째 질문');
  if (viewport!.width > 900) {
    expect(await list.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
    expect(await detail.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('합성 저장 요청')).toHaveText('null');
  await page.screenshot({ path: info.outputPath('question-last-row.png') });
});

test('staff search never changes selection or permissions and Enter never saves', async ({ page }, info) => {
  await page.goto(visit('staff'));
  const form = page.locator('.admin-staff-permissions');
  const search = form.getByRole('searchbox', { name: '권한 관리 회원 찾기' });
  const selected = form.getByRole('combobox', { name: '회원 선택' });
  const products = form.getByRole('checkbox', { name: /클래스·상품/ });
  await expect(selected).toHaveValue('member-0');
  await expect(products).toBeChecked();
  await search.fill('MEMBER150@EXAMPLE.TEST');
  await expect(form.getByRole('status')).toContainText('1명 검색됨');
  await expect(selected).toHaveValue('member-0');
  await search.press('Enter');
  await expect(page.getByLabel('합성 저장 요청')).toHaveText('null');
  await search.fill('없는 회원');
  await expect(form.getByRole('status')).toContainText('0명 검색됨');
  await expect(selected).toHaveValue('member-0');
  await expect(products).toBeChecked();
  await search.fill('최고 관리자');
  await selected.selectOption('member-1');
  await expect(form).toContainText('최고 관리자 권한은 이 화면에서 변경할 수 없습니다.');
  await expect(form.getByRole('button', { name: '권한 저장' })).toHaveCount(0);
  await search.fill('기존 스태프');
  await selected.selectOption('member-0');
  // Synthetic in-memory submit verifies the existing contract, never a real permission write.
  await form.getByRole('button', { name: '권한 저장' }).click();
  await expect(page.getByLabel('합성 저장 요청')).toHaveText('{"action":"staff-permissions","memberId":"member-0","permissions":{"products":true,"members":true,"orders":false,"content":false,"marketing":false},"workflow":true}');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('staff-search.png') });
});

test('marketing navigation keeps all destinations, help and active state in a readable grid', async ({ page }, info) => {
  await page.route('**/api/conversion', route => route.fulfill({ json: { cases: [], evidence: [], questions: [], courses: [], cohorts: [], runs: [], reviews: [], capabilities: { can_manage_evidence: false, can_mock: false } } }));
  await page.goto(visit('conversion'));
  const nav = page.getByRole('navigation', { name: '마케팅 작업 빠른 이동' });
  await expect(nav.getByRole('link')).toHaveCount(8);
  await expect(nav.getByRole('link', { name: '모집·문의 검토' })).toHaveAttribute('aria-current', 'page');
  const groups = page.locator('.marketing-task-group');
  await expect(groups).toHaveCount(3);
  await expect(page.getByText('전환 관리 정보를 불러오지 못했습니다.')).toHaveCount(0);
  await page.locator('.marketing-workspace-help>summary').click();
  await expect(page.locator('.marketing-workspace-guide')).toBeVisible();
  await expect(page.locator('.marketing-ownership')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.marketing-workspace-help>summary').click();
  await page.screenshot({ path: info.outputPath('marketing-grid.png') });
});
