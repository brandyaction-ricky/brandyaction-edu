import { expect, test, type Page, type Locator } from '@playwright/test';
import { personas } from './personas';

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function openMenu(page: Page, width: number) {
  if (width <= 1024) await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
  return page.locator('#admin-sidebar');
}
async function activate(control: Locator, keyboard: boolean) {
  if (keyboard) { await control.focus(); await control.press('Enter'); }
  else await control.tap();
}

for (const persona of personas) {
  test(`${persona.id} ${persona.name}: ${persona.role.task}`, async ({ browser }, info) => {
    const { context: profile, role } = persona;
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.input === 'touch', reducedMotion: 'reducedMotion' in profile ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await info.attach('synthetic-persona', { body: JSON.stringify(persona), contentType: 'application/json' });
    try {
      await page.goto(`${info.project.use.baseURL}/admin-ux-audit-test${role.key === 'restricted' ? '?restricted=1' : ''}`);
      await expect(page.getByRole('heading', { name: '메시지 템플릿', exact: true })).toBeVisible();
      await fits(page);
      const keyboard = profile.input === 'keyboard';
      if ('menu' in role) {
        const menu = await openMenu(page, profile.width);
        await menu.getByRole('searchbox', { name: '관리자 메뉴 찾기' }).fill(role.menu);
        const link = menu.getByRole('link', { name: role.menu, exact: true });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', `/admin/${role.key}`);
        await expect(menu.getByRole('status')).toContainText('1개 메뉴');
        await activate(menu.getByRole('button', { name: '메뉴 검색 지우기' }), keyboard);
        await expect(menu.getByRole('searchbox')).toHaveValue('');
      } else if (role.key === 'edit') {
        const row = page.getByRole('row').filter({ hasText: '마지막 학습 안내' });
        await activate(row.getByRole('button', { name: '수정', exact: true }), keyboard);
        const input = page.getByRole('textbox', { name: '템플릿 이름' });
        await expect(input).toHaveValue('마지막 학습 안내');
        await expect(input).toBeFocused();
        await expect(input).toBeInViewport();
        await input.fill('수정한 학습 안내');
        await activate(page.getByRole('button', { name: '저장하기', exact: true }), keyboard);
        await expect(page.getByLabel('시험 저장 횟수')).toHaveText('1');
        await expect(page.getByRole('table').getByText('수정한 학습 안내')).toBeVisible();
      } else if (role.key === 'create') {
        await activate(page.getByRole('button', { name: '새 안내 작성', exact: true }), keyboard);
        const input = page.getByRole('textbox', { name: '템플릿 이름' });
        await expect(input).toBeFocused(); await expect(input).toBeInViewport();
        await input.fill('새로운 학습 안내');
        await page.getByRole('textbox', { name: '메시지 내용' }).fill('함께 다음 학습을 시작해요.');
        await activate(page.getByRole('button', { name: '저장하기', exact: true }), keyboard);
        await expect(page.getByRole('table').getByText('새로운 학습 안내')).toBeVisible();
      } else if (role.key === 'help') {
        const help = page.locator('.marketing-workspace-help');
        await expect(help).not.toHaveAttribute('open', '');
        await activate(help.locator('summary'), keyboard);
        await expect(help.getByRole('heading', { name: '반복해서 쓸 안내 문구를 만들어요' })).toBeVisible();
        await activate(help.locator('summary'), keyboard);
        await expect(help.getByRole('heading')).toBeHidden();
        expect((await page.getByRole('heading', { name: '메시지 템플릿', exact: true }).boundingBox())!.y).toBeLessThan(520);
      } else if (role.key === 'settings') {
        const settings = page.locator('.admin-crm-settings');
        await expect(settings).not.toHaveAttribute('open', '');
        await activate(settings.locator('summary'), keyboard);
        await expect(settings.getByRole('combobox', { name: '문자 발신번호' })).toBeVisible();
        await activate(settings.locator('summary'), keyboard);
        await expect(page.getByLabel('시험 저장 횟수')).toHaveText('0');
      } else if (role.key === 'restricted') {
        const menu = await openMenu(page, profile.width);
        await menu.getByRole('searchbox').fill('권한');
        await expect(menu.getByRole('status')).toContainText('0개 메뉴');
        await expect(menu.getByRole('link', { name: '스태프 권한' })).toHaveCount(0);
        await menu.getByRole('searchbox').fill('질문');
        await expect(menu.getByRole('link', { name: '질문함' })).toBeVisible();
      } else {
        await openMenu(page, profile.width);
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(page.locator('.adm-main')).not.toHaveAttribute('inert', '');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: '관리자 메뉴 열기' })).toBeFocused();
        await fits(page);
      }
      await fits(page);
      expect(errors).toEqual([]);
      if (['P058', 'P062'].includes(persona.id)) await page.screenshot({ path: info.outputPath('admin-ux.png'), fullPage: false });
    } finally { await context.close(); }
  });
}
