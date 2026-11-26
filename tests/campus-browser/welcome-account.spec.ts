import {expect, test} from '@playwright/test';

for (const [path, destination] of [
  ['/welcome-account-preview', '문샷 라이브홀'],
  ['/welcome-five-preview', '문샷 공부방'],
]) {
  test('retired welcome room preserves existing preparation records at ' + path, async ({page}) => {
    const requests: string[] = [];
    await page.route('**/api/campus/welcome**', route => {
      requests.push(route.request().method());
      return route.fulfill({json: {}});
    });
    await page.goto(path);
    await expect(page.getByRole('banner').getByText(destination, {exact: true})).toBeVisible();
    await page.getByRole('button', {name: '공간 이동', exact: true}).click();
    await expect(page.getByRole('button', {name: '문샷 개강 준비실 입장'})).toHaveCount(0);
    await expect(page.getByRole('button', {name: '문샷 자료실 입장'})).toBeVisible();
    expect(requests).toEqual([]);
  });
}
