import {expect} from '@playwright/test';

const nextDesk = ['기획·제작 담당자 만나기', '고객 응대 담당자 만나기', '회사 업무 기준 열기', '내 일로 해보기'];

export function teamLeaderGuide(page) {
  return page.getByRole('region', {name: '팀장 봇 안내', exact: true});
}

export function teamLeaderNext(guide) {
  return guide.getByRole('button', {name: '조사 담당자와 이야기해보기 →', exact: true});
}

export async function finishTeamLeaderVideo(guide) {
  const video = guide.locator('video');
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
  // Seek through real playback so that the browser fires the normal ended event.
  await video.evaluate(element => {element.currentTime = element.duration - 0.35;});
  await expect(teamLeaderNext(guide)).toBeVisible();
}

// The desktop and mobile clipboard fixtures can use the equivalent HTML entry when WebGL is unavailable.
export async function finishOfficeReview(page, {walk, inspect = async () => {}} = {}) {
  const travel = walk ?? (async () => { await page.locator('#arrival-desk-button').click({timeout: 60000}); });
  for (let station = 1; station <= 6; station++) {
    await travel(station);
    if (station === 6) return;
    if (station === 1) {
      const guide = teamLeaderGuide(page);
      await expect(guide).toBeVisible({timeout: 20000});
      await inspect(station, guide);
      if (await guide.locator('video').count() === 0) {
        await guide.getByRole('button', {name:'지금 확인하기', exact: true}).click();
      }
      const next = teamLeaderNext(guide);
      if (!await next.isVisible()) await finishTeamLeaderVideo(guide);
      await next.click();
      await expect(guide).toHaveCount(0);
      continue;
    }
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
    await dialog.getByRole('button', {name:nextDesk[station - 2], exact:true}).click();
  }
}
