import {expect} from '@playwright/test';

const nextDesk = ['콘텐츠 실제 제작해보기', '내 사업을 아는 AI는 어떻게 만들까요?', '고객 응대 직원 만나기', '내 일로 해보기'];

export const spyActions = ['경쟁사 조사해서 우리 상품에 보완할 거 찾아줘.', '응, 우리 상품도 확인해줘.', '응, 콘텐츠 담당자에게 전달해줘.'];

export async function finishSpyHandoff(dialog) {
  for (const label of spyActions) {
    const action = dialog.getByRole('button', {name: label, exact: true});
    if (await action.isVisible()) await action.click();
  }
}

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
export async function finishOfficeReview(page, {walk, inspect = async () => {}, beforeLeave = async () => {}, afterLeave = async () => {}} = {}) {
  const travel = walk ?? (async station => {
    const action = page.locator('#arrival-desk-button');
    await action.click({timeout: 60000});
    if (station >= 2 && station <= 4) {
      const open = page.getByRole('button', {name: '내용 열기', exact: true});
      const dialog = page.getByRole('dialog');
      await expect(open.or(dialog).filter({visible: true})).toBeVisible({timeout: 20000});
      if (await open.isVisible()) await open.click();
    }
  });
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
      await beforeLeave(station);
      await next.click();
      await expect(guide).toHaveCount(0);
      await afterLeave(station);
      continue;
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({timeout: 20000});
    await inspect(station, dialog);
    if (station === 2) await finishSpyHandoff(dialog);
    if (station === 4 && !await dialog.locator('button[aria-pressed="true"]').count()) {
      await dialog.locator('fieldset button').first().click();
    }
    if (station === 5) await dialog.getByRole('button', {name:'담당자에게 제안 전달하기'}).click();
    await beforeLeave(station);
    await dialog.getByRole('button', {name:nextDesk[station - 2], exact:true}).click();
    await expect(dialog).not.toBeVisible();
    await afterLeave(station);
  }
}
