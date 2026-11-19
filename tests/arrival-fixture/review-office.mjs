import {expect} from '@playwright/test';

export const arrivalStorageKeys = ['moonshot:arrival:synthetic-local-qa:v1', 'moonshot:arrival:2026-12-07:v1'];

export async function resumeOfficeVisit(page, url, state) {
  await page.goto(url);
  await expect(page.getByRole('region', {name:'문샷 웰컴존 소개', exact:true})).toBeVisible();
  await page.evaluate(({keys, state}) => {
    for (const key of keys) sessionStorage.setItem(key, JSON.stringify({version:1, ...state}));
  }, {keys:arrivalStorageKeys, state});
  await page.reload({waitUntil:'domcontentloaded'});
}

const nextDesk = ['이 질문을 광고에 반영하기', '정본에서 두 직원의 답 바꿔보기', '웰컴 라운지로 가기'];

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
  return page.getByRole('button', {name: /일정 저장$/});
}

export async function openLoungeSchedule(page) {
  const calendar = page.getByRole('link', {name: 'Google 캘린더', exact: true});
  if (!await calendar.isVisible()) await loungeScheduleButton(page).click();
  await expect(calendar).toBeVisible({timeout: 20000});
}

// The desktop and mobile clipboard fixtures can use the equivalent HTML entry when WebGL is unavailable.
export async function finishOfficeReview(page, {walk, inspect = async () => {}, beforeLeave = async () => {}, afterLeave = async () => {}, enterPersonal = true} = {}) {
  const travel = walk ?? (async station => {
    const action = page.locator('#arrival-desk-button');
    await action.click({timeout: 60000});
    if (station !== 1) {
      const open = page.getByRole('button', {name: station === 7 ? '웰컴 라운지 입장하기' : '내용 열기', exact: true});
      const destination = station === 7 ? loungeScheduleButton(page) : page.getByRole('dialog');
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
      const next = teamLeaderNext(guide);
      await expect(next).toBeEnabled();
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
  await expect(loungeScheduleButton(page)).toBeVisible({timeout:20000});
  if (enterPersonal) await page.getByRole('button', {name:'내 AI 체험으로 가기', exact:true}).click();
}
