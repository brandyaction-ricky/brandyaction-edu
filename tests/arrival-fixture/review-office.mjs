import {expect} from '@playwright/test';

const nextDesk = ['콘텐츠 실제 제작해보기', '내 사업을 아는 AI는 어떻게 만들까요?', '강의 전 무료자료 확인하기'];

export const spyActions = ['경쟁사 조사해서 우리 상품에 보완할 거 찾아줘.', '응, 우리 상품도 확인해줘.', '응, 콘텐츠 담당자에게 전달해줘.'];

export async function finishSpyHandoff(dialog) {
  for (const label of spyActions) {
    const action = dialog.getByRole('button', {name: label, exact: true});
    if (await action.isVisible()) {
      await action.click();
      await expect(dialog.getByRole('status').filter({hasText:'답변을 작성 중이에요.'})).toHaveCount(0);
    }
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
export async function finishOfficeReview(page, {walk, inspect = async () => {}, beforeLeave = async () => {}, afterLeave = async () => {}, enterPersonal = true} = {}) {
  const calendar = page.getByRole('link', {name:'Google 캘린더', exact:true});
  const travel = walk ?? (async station => {
    const action = page.locator('#arrival-desk-button');
    await action.click({timeout: 60000});
    if (station !== 1) {
      const open = page.getByRole('button', {name: station === 7 ? '라이브 홀 입장하기' : '내용 열기', exact: true});
      const destination = station === 7 ? calendar : page.getByRole('dialog');
      await expect(open.or(destination).filter({visible: true})).toBeVisible({timeout: 20000});
      if (await open.isVisible()) await open.click();
    }
  });
  for (const station of [1, 2, 3, 4]) {
    await travel(station);
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
    await beforeLeave(station);
    await dialog.getByRole('button', {name:nextDesk[station - 2], exact:true}).click();
    await expect(dialog).not.toBeVisible();
    await afterLeave(station);
  }
  await travel(7);
  await expect(calendar).toBeVisible({timeout:20000});
  if (enterPersonal) await page.getByRole('button', {name:'내 AI 체험으로 가기', exact:true}).click();
}
