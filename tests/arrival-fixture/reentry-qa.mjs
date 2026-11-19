import {chromium, expect, webkit} from '@playwright/test';
import {arrivalStorageKeys, loungeScheduleButton, resumeOfficeVisit, teamLeaderGuide, teamLeaderNext} from './review-office.mjs';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4529');
const freshEntry = page => page.getByRole('region', {name:'문샷 웰컴존 소개', exact:true});
const draft = {a:'이미 적어둔 실습 답변입니다.', b:'다시 입장해도 남는 내용'};

for (const [engine, mobile] of [[chromium, false], [webkit, true]]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({viewport:mobile ? {width:390, height:740} : {width:1280, height:800}, isMobile:mobile, hasTouch:mobile});
    const previousVisit = await context.newPage();
    await resumeOfficeVisit(previousVisit, url.href, {step:7, station:7, visitorAvatar:'male-d', answers:{business:draft}});
    await expect(loungeScheduleButton(previousVisit)).toBeVisible();

    const newVisit = await context.newPage();
    await newVisit.goto(url.href);
    await expect(freshEntry(newVisit)).toBeVisible();
    const frame = newVisit.frameLocator('iframe[title*="직원 사무실"]');
    await expect(frame.locator('#walk')).toHaveAttribute('data-avatar', 'male-d');
    await expect.poll(() => newVisit.evaluate(keys => keys.flatMap(key => {
      const visit = sessionStorage.getItem(key);
      return visit ? [JSON.parse(visit).answers.business] : [];
    }), arrivalStorageKeys)).toContainEqual(draft);
    await previousVisit.reload();
    await expect(loungeScheduleButton(previousVisit)).toBeVisible();

    const start = freshEntry(newVisit).getByRole('button', {name:'팀장의 첫 업무 보고 보기'});
    if (mobile) await start.tap(); else await start.click();
    await expect(teamLeaderGuide(newVisit)).toBeVisible();
    const next = teamLeaderNext(teamLeaderGuide(newVisit));
    if (mobile) await next.tap(); else await next.click();
    await expect(newVisit.getByRole('region', {name:'현재 목적지'})).toHaveAttribute('data-walk-station', '2');
    await newVisit.reload();
    await expect(newVisit.getByRole('region', {name:'현재 목적지'})).toHaveAttribute('data-walk-station', '2');
    console.log(`${engine.name()} fresh entrance, saved draft and separate tab reload passed`);
  } finally {
    await browser.close();
  }
}
