import { expect, test } from '@playwright/test';

for (const key of ['templates', 'campaigns', 'automations', 'seo', 'settings', 'missions']) {
  test(`${key}: shared form hierarchy preserves fields and performs no writes`, async ({ page, viewport }, info) => {
    const writes: string[] = [];
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    await page.goto(`/admin-ux-audit-test?remaining=${key}`);
    const panel = page.locator(key === 'seo' || key === 'settings' ? '.settings-layout>form,.seo-settings-layout>form' : key === 'missions' ? '.admin-quiz-editor' : '.admin-crm-editor');
    await expect(panel).toBeVisible();
    const heading = panel.getByRole('heading', { level: 2 }).filter({ visible: true }).first();
    await expect(heading).toHaveCSS('font-size', '16px');
    expect((await panel.boundingBox())!.width).toBeGreaterThan(250);
    if (viewport!.width <= 720) {
      for (const input of await panel.locator('input:not([type=checkbox]):not([type=radio]),select').all()) {
        if (await input.isVisible()) expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (key === 'seo') {
      await expect(page.getByRole('heading', { name: '검색 노출 미리보기' })).toBeVisible();
      const formBounds = (await panel.boundingBox())!;
      const previewBounds = (await page.locator('.settings-layout>aside').boundingBox())!;
      expect(previewBounds.y - formBounds.y - formBounds.height).toBeGreaterThanOrEqual(23);
      await page.getByRole('button', { name: '소유 확인', exact: true }).click();
      await expect(panel.getByRole('heading', { name: '사이트 소유 확인' })).toBeVisible();
      await expect(panel.getByRole('heading', { name: '사이트 기본 검색 정보' })).toBeHidden();
      await page.getByRole('button', { name: '검색·공유', exact: true }).click();
      await expect(panel.getByLabel('사이트 제목')).toHaveValue('합성 사이트 제목');
    }
    if (key === 'campaigns') {
      await page.locator('.admin-crm-settings>summary').click();
      await expect(page.locator('.admin-crm-settings h2')).toHaveCSS('font-size', '16px');
      await expect(page.getByLabel('문자 발신번호')).toBeDisabled();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel('합성 저장 요청')).toHaveText('null');
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${key}-layout.png`) });
  });
}

test('template submit contract is unchanged (synthetic memory only)', async ({ page }) => {
  await page.goto('/admin-ux-audit-test?remaining=templates');
  const form = page.locator('.admin-crm-editor');
  await form.getByLabel('템플릿 이름').fill('합성 저장 계약');
  await form.getByLabel('메시지 내용', { exact: true }).fill('합성 문구');
  await form.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 요청')).toContainText('"action":"crm-save"');
  await expect(page.getByLabel('합성 저장 요청')).toContainText('"name":"합성 저장 계약"');
});
