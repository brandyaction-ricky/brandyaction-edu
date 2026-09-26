import { expect, test } from '@playwright/test';

test('native countdown ticks to expiry and closes the embedded application without running uploaded scripts', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T14:58:58Z') });
  await page.goto('/product-countdown-test?end=2026-10-01T14:59:00Z');
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText('00:00:02');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('link', { name: '클래스 신청' })).toHaveAttribute('aria-disabled', 'false');
  await expect(frame.getByText('위험 스크립트 실행', { exact: true })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-same-origin');
  await page.clock.runFor(2500);
  await expect(timer).toHaveText('신청 기간이 종료되었습니다.');
  await expect(frame.getByRole('link', { name: '클래스 신청' })).toHaveAttribute('aria-disabled', 'true');
  await frame.getByRole('link', { name: '클래스 신청' }).click({ force: true });
  await expect(page).toHaveURL(/product-countdown-test/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('embedded CTA uses the existing checkout, custom URL or learning destination', async ({ page }) => {
  for (const [query, destination] of [['', '/checkout?cohort=cohort-a'], ['&zero=1&digital=1', '/apply?cohort=cohort-a'], ['&custom=1', '/safe-custom'], ['&enrolled=1', '/learn/enrolled-fixture']]) {
    await page.goto('/product-countdown-test?off=1' + query);
    await expect(page.getByRole('timer')).toHaveCount(0);
    const link = page.frameLocator('iframe').getByRole('button', { name: '신청 버튼', exact: true });
    await expect(link).toHaveAttribute('aria-disabled', 'false');
    await link.click();
    await expect(page).toHaveURL(new RegExp(destination.replace('?', '\\?') + '$'));
  }
});

test('unready and closed products stay blocked; missing deadlines do not create a fake timer', async ({ page }) => {
  for (const query of ['unready=1', 'closed=1', 'missing=1', 'free=1', 'zero=1']) {
    await page.goto('/product-countdown-test?' + query);
    const frame = page.frameLocator('iframe');
    const link = frame.getByRole('link', { name: '클래스 신청' });
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await link.click({ force: true });
    await expect(page).toHaveURL(/product-countdown-test/);
    await frame.getByRole('link', { name: '자주 묻는 질문', exact: true }).click();
    await expect(page).toHaveURL(/product-countdown-test/);
    if (query === 'missing=1') await expect(page.getByRole('timer')).toHaveText('마감 일정 준비 중');
  }
});

test('when one cohort closes, countdown and CTA follow the same remaining offer', async ({ page }) => {
  await page.clock.install({ time: new Date('2099-10-01T14:58:58Z') });
  await page.goto('/product-countdown-test?multiple=1');
  await page.getByRole('combobox', { name: '기수 선택' }).selectOption('cohort-a');
  await page.clock.runFor(2500);
  await expect(page.getByRole('timer')).toHaveText('2일 00:00:00');
  await page.frameLocator('iframe').getByRole('link', { name: '클래스 신청' }).click();
  await expect(page).toHaveURL(/\/checkout\?cohort=cohort-b$/);
});

test('cohort selection changes both countdown and embedded checkout; editor can turn toggle off again', async ({ page }) => {
  await page.clock.install({ time: new Date('2099-10-01T14:58:58Z') });
  await page.goto('/product-countdown-test?multiple=1');
  await expect(page.getByRole('timer')).toHaveText('00:00:02');
  await page.getByRole('combobox', { name: '기수 선택' }).selectOption('cohort-b');
  await expect(page.getByRole('timer')).toHaveText('2일 00:00:02');
  await page.frameLocator('iframe').getByRole('link', { name: '클래스 신청' }).click();
  await expect(page).toHaveURL(/\/checkout\?cohort=cohort-b$/);
  await page.goto('/product-sale-test?ready=1');
  await page.getByRole('tab', { name: '공개·검색', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: '모집 마감 카운트다운 표시', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.locator('input[name="recruitment_countdown_enabled"]')).toHaveValue('on');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('저장한 카운트다운 설정')).toHaveText('true');
  await toggle.uncheck();
  await expect(page.locator('input[name="recruitment_countdown_enabled"]')).toHaveValue('off');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('2');
  await expect(page.getByLabel('저장한 카운트다운 설정')).toHaveText('false');
});
