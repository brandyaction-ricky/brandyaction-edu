import {expect} from '@playwright/test';

const nextDesk = ['조사 담당자 만나기', '기획·제작 담당자 만나기', '고객 응대 담당자 만나기', '회사 업무 기준 열기', '내 일로 해보기'];

// The desktop and mobile clipboard fixtures can use the equivalent HTML entry when WebGL is unavailable.
export async function finishOfficeReview(page, {walk, inspect = async () => {}} = {}) {
  const travel = walk ?? (async () => { await page.locator('#arrival-desk-button').click({timeout: 60000}); });
  for (let station = 1; station <= 6; station++) {
    await travel(station);
    if (station === 6) return;
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({timeout: 20000});
    await inspect(station, dialog);
    if (station === 3 && await dialog.locator('fieldset').count() > 0) {
      await dialog.locator('fieldset button').first().click();
    }
    if (station === 3 && await dialog.getByRole('button', {name:'이 문장으로 승인하기'}).count()) {
      await dialog.getByRole('button', {name:'이 문장으로 승인하기'}).click();
    }
    if (station === 4) await dialog.getByRole('button', {name:'담당자에게 제안 전달하기'}).click();
    if (station === 5 && !await dialog.locator('button[aria-pressed="true"]').count()) {
      await dialog.locator('fieldset button').first().click();
    }
    await dialog.getByRole('button', {name:nextDesk[station - 1], exact:true}).click();
  }
}
