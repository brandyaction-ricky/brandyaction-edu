import { expect, test } from '@playwright/test';

for (const width of [320, 390, 768]) {
  test(`member mission filters stay readable and retain selections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/admin/members');

    const labels = ['조회 기수', '미션 현황 주차', '미션 필터', '회원 미션 상태 필터', '레벨 필터'];
    const boxes = await Promise.all(labels.map(async label => {
      const field = page.getByRole('combobox', { name: label });
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width, `${width}px: ${label} 선택값과 화살표가 보일 폭`).toBeGreaterThanOrEqual(110);
      return box!;
    }));
    expect(boxes[0].width).toBeGreaterThan(boxes[1].width * 1.5);
    expect(boxes[0].y).toBeLessThan(boxes[1].y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('combobox', { name: '미션 필터' }).selectOption({ label: 'Day 1 · 첫 학습' });
    await page.getByRole('combobox', { name: '회원 미션 상태 필터' }).selectOption('review');
    await page.getByRole('combobox', { name: '레벨 필터' }).selectOption('3');
    await page.getByRole('searchbox', { name: '회원 검색' }).fill('운영 동선');
    await expect(page.getByRole('combobox', { name: '미션 필터' })).toHaveValue('00000000-0000-4000-8000-000000000016');
    await expect(page.getByRole('combobox', { name: '회원 미션 상태 필터' })).toHaveValue('review');
    await expect(page.getByRole('combobox', { name: '레벨 필터' })).toHaveValue('3');
    await expect(page.getByRole('searchbox', { name: '회원 검색' })).toHaveValue('운영 동선');
  });
}
