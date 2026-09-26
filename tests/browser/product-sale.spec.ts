import { expect, test } from '@playwright/test';

test('sale hold reason and cohort status agree across editor tabs and preview', async ({ page }) => {
  await page.goto('/product-sale-test');
  for (const tab of ['기본·판매', '수강·권한', '공개·검색']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('판매 보류', { exact: true })).toBeVisible();
    await expect(panel.getByText('공개 커리큘럼', { exact: true })).toBeVisible();
    await expect(panel.getByText(/연결 기수 상태: 합성 4기/)).toBeVisible();
  }
  await expect(page.locator('aside').getByText('판매 보류', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('공개 커리큘럼'); await dialog.dismiss(); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});

test('ready upcoming offer remains available and warns without changing cohort status', async ({ page }) => {
  await page.goto('/product-sale-test?ready=1');
  await expect(page.locator('aside').getByText('판매 중', { exact: true }).first()).toBeVisible();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('기수 상태는 자동 변경되지 않습니다'); await dialog.accept(); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('product curriculum tab loads existing scoped lessons without submitting the product form', async ({ page }) => {
  await page.goto('/product-sale-test');
  const tab = page.getByRole('tab', { name: '커리큘럼' });
  await tab.click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  await expect(panel.getByRole('heading', { name: /1주차 · 기존 합성 주차/ })).toBeVisible();
  await expect(panel.getByText(/Day 1 · 기존 합성 학습/)).toBeVisible();
  await panel.getByRole('button', { name: '콘텐츠 편집' }).click();
  await expect(panel.getByRole('textbox', { name: '학습 본문' })).toHaveValue('기존 학습 본문');
  await panel.getByRole('textbox', { name: '새 주차 제목' }).fill('새 주차');
  await panel.getByRole('textbox', { name: '새 주차 제목' }).press('Enter');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await expect(page.getByRole('button', { name: '저장하기', exact: true })).toHaveCount(0);
});

test('product cohort tab edits only its linked cohort without submitting the product form', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '기수·회차' }).click();
  const panel = page.getByRole('tabpanel', { name: '기수·회차' });
  const editor = panel.getByRole('region', { name: '합성 4기 편집' });
  await expect(panel.getByRole('button', { name: /합성 4기 · 준비 중 · 100,000원/ })).toBeVisible();
  await editor.getByRole('textbox', { name: '기수명' }).fill('합성 4기 수정');
  await editor.getByRole('button', { name: '기수 저장' }).click();
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  const mutation = JSON.parse(await page.getByLabel('합성 기수 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'cohorts', id: 'synthetic-cohort', values: { name: '합성 4기 수정' } });
  expect(mutation.values.course_id).toBeUndefined();
});

test('new product cohort is created as upcoming and invalid periods never submit', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '기수·회차' }).click();
  const panel = page.getByRole('tabpanel', { name: '기수·회차' });
  await panel.getByRole('button', { name: '+ 새 기수' }).click();
  await page.getByRole('tab', { name: '수강·권한' }).click();
  await expect(page.getByRole('combobox', { name: '연결 기수' })).toHaveValue('synthetic-cohort');
  await page.getByRole('tab', { name: '기수·회차' }).click();
  await panel.getByRole('button', { name: '+ 새 기수' }).click();
  const editor = panel.getByRole('region', { name: '새 기수 등록' });
  await editor.getByRole('textbox', { name: '기수명' }).fill('합성 5기');
  await editor.getByRole('textbox', { name: '기수 코드' }).fill('FIFTH');
  await editor.getByLabel('모집 시작 · KST').fill('2099-10-02T10:00');
  await editor.getByLabel('모집 마감 · KST').fill('2099-10-01T10:00');
  await editor.getByRole('button', { name: '기수 추가' }).click();
  await expect(editor.getByRole('alert')).toContainText('종료일은 시작일 이후');
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('0');
  await editor.getByLabel('모집 마감 · KST').fill('2099-10-03T10:00');
  await editor.getByRole('button', { name: '기수 추가' }).click();
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  const mutation = JSON.parse(await page.getByLabel('합성 기수 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'cohorts', values: { course_id: 'synthetic-course', name: '합성 5기', cohort_code: 'FIFTH', status: 'upcoming', price: 100000 } });
  await expect(panel.getByRole('button', { name: /합성 5기 · 준비 중 · 100,000원/ })).toBeVisible();
});

test('product mission tab edits only the scoped existing mission without submitting the product', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '미션' }).click();
  const panel = page.getByRole('tabpanel', { name: '미션' });
  await expect(panel.getByRole('region', { name: '1주차 미션' }).getByText(/Day 1 · 기존 합성 학습/)).toBeVisible();
  await expect(panel.getByText(/기존 합성 미션 · 비공개 · 필수/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole('button', { name: '미션 편집' }).click();
  const editor = panel.getByRole('region', { name: '기존 미션 편집' });
  await editor.getByRole('textbox', { name: '미션 제목' }).fill('수정된 합성 미션');
  await editor.getByRole('checkbox', { name: '공개' }).check();
  await editor.getByRole('button', { name: '미션 저장' }).click();
  await expect(page.getByLabel('합성 미션 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  const mutation = JSON.parse(await page.getByLabel('합성 미션 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'missions', id: 'synthetic-mission', values: { course_id: 'synthetic-course', week_id: 'synthetic-week', lesson_id: 'synthetic-lesson', title: '수정된 합성 미션', is_required: true, is_published: true } });
});

test('new product mission is tied to its lesson and remains hidden until reviewed', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '미션' }).click();
  const editor = page.getByRole('region', { name: '새 미션 등록' });
  await editor.getByRole('textbox', { name: '미션 제목' }).fill('새 합성 미션');
  await editor.getByRole('textbox', { name: '미션 제목' }).press('Enter');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await expect(editor.getByRole('checkbox', { name: /공개/ })).toBeDisabled();
  await editor.getByRole('checkbox', { name: '필수 미션' }).uncheck();
  await editor.getByRole('button', { name: '비공개 미션 추가' }).click();
  await expect(page.getByLabel('합성 미션 저장 횟수')).toHaveText('1');
  const mutation = JSON.parse(await page.getByLabel('합성 미션 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'missions', values: { course_id: 'synthetic-course', week_id: 'synthetic-week', lesson_id: 'synthetic-lesson', title: '새 합성 미션', is_required: false, is_published: false } });
  expect(mutation.id).toBeUndefined();
});
