import {expect} from '@playwright/test';

const nextDesk = ['콘텐츠 담당자 열기', '회사 업무 기준 보기', '웰컴 라운지로 가기'];

export const firstSpyRequest = '경쟁사 마스크팩 후기를 보고, 우리 상품 안내에서 보완할 점을 찾아줘.';
export const spyActions = ['첫 요청 보내기', '응, 우리 상품도 확인해줘.', '응, 콘텐츠 담당자에게 전달해줘.'];

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
  return guide.getByRole('button', {name: /^경쟁사 스파이 만나기(?: →)?$/});
}

export async function finishTeamLeaderVideo(guide) {
  const video = guide.locator('video');
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
  // Seek through real playback so that the browser fires the normal ended event.
  await video.evaluate(element => {element.currentTime = element.duration - 0.35;});
  await expect(teamLeaderNext(guide)).toBeVisible();
}

export function loungeScheduleButton(page) {
  return page.getByRole('region', {name:'웰컴 라운지에서 할 수 있는 일'}).getByRole('button', {name: '캘린더에 추가', exact: true});
}

export async function startOfficeCase(page, audience = '이미 사업을 하고 있어요') {
  const start = page.getByRole('button', {name:'이 상황으로 시작', exact:true});
  await expect(start).toBeVisible();
  await page.getByText(audience, {exact:true}).click();
  await start.click();
  await expect(teamLeaderGuide(page)).toBeVisible({timeout:20000});
}

export async function openLoungeSchedule(page) {
  const calendar = page.getByRole('link', {name: 'Google 캘린더', exact: true});
  if (!await calendar.isVisible()) await loungeScheduleButton(page).click();
  await expect(calendar).toBeVisible({timeout: 20000});
}

// The desktop and mobile clipboard fixtures can use the equivalent HTML entry when WebGL is unavailable.
export async function finishOfficeReview(page, {walk, audience, inspect = async () => {}, beforeLeave = async () => {}, afterLeave = async () => {}, enterPersonal = true} = {}) {
  const travel = walk ?? (async station => {
    if (station === 1) await startOfficeCase(page, audience);
    else await expect(station === 7 ? loungeScheduleButton(page) : page.getByRole('dialog', {name:['경쟁사 스파이','콘텐츠 담당자','정본 · 회사 업무 기준'][station - 2], exact:true})).toBeVisible({timeout:20000});
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
    const currentName = ['경쟁사 스파이','콘텐츠 담당자','정본 · 회사 업무 기준'][station - 2];
    await dialog.getByRole('button', {name:nextDesk[station - 2], exact:true}).click();
    await expect(page.getByRole('dialog', {name:currentName, exact:true})).not.toBeVisible();
    await afterLeave(station);
  }
  await travel(7);
  await expect(loungeScheduleButton(page)).toBeVisible({timeout:20000});
  if (enterPersonal) {
    await openLoungeSchedule(page);
    await page.getByRole('button', {name:'내 AI 체험으로 가기', exact:true}).click();
  }
}
