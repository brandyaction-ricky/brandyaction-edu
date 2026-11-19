import {devices, expect, webkit} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const linkFile = process.env.ARRIVAL_QA_LINK_FILE;
const url = new URL(linkFile
  ? (await readFile(linkFile, 'utf8')).trim()
  : process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4497/experience/moonshot');
const preview = process.env.ARRIVAL_QA_REAL_REMINDER === '1';
const suffix = preview ? process.env.ARRIVAL_QA_PHONE_SUFFIX : '42';
const reminderPath = '/api/campus/arrival/live-reminder';
const invalidMessage = '휴대폰 번호를 확인해 주세요.';
const unavailableMessage = '지금은 신청하기 어려워요. 잠시 후 다시 시도해 주세요.';
const successMessage = '문자 알림을 신청했어요.';

if (url.pathname !== '/experience/moonshot' || url.username || url.password) {
  throw new Error('Use a Moonshot welcome preview URL.');
}
if (preview) {
  if (url.protocol !== 'https:' || url.port || !/^brandyaction-edu-[a-z0-9]+-brandyaction\.vercel\.app$/.test(url.hostname)
    || url.hostname !== process.env.ARRIVAL_QA_PREVIEW_HOST || !/^\d{2}$/.test(suffix ?? '')) {
    throw new Error('Provide the verified preview hostname and a two-digit test number suffix.');
  }
} else if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
  throw new Error('Run the fixture on localhost or explicitly provide a verified preview target.');
}

const national = `010-0000-00${suffix}`;
const digits = national.replace(/\D/g, '');
const reminderLabel = '강의 알림 받기';
const viewport = {width: 390, height: 690};
const browser = await webkit.launch();

const action = (scope, name) => scope.getByRole('button', {name, exact: true});

async function openLounge() {
  const page = await browser.newPage({...devices['iPhone 15'], viewport, locale: 'ko-KR'});
  const writes = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let transientFailure = !preview;
  await page.route('**/*', async route => {
    const req = route.request();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) return route.continue();
    const target = new URL(req.url());
    // The Vercel preview toolbar probes its own login independently of the page.
    if (target.origin === 'https://vercel.live' && target.pathname === '/login/validate') return route.abort();
    writes.push({origin: target.origin, path: target.pathname, method: req.method()});
    if (target.origin !== url.origin || target.pathname !== reminderPath || req.method() !== 'POST') {
      return route.abort();
    }
    if (preview) return route.continue();

    const data = req.postDataJSON();
    if (data.phone === '123') return route.fulfill({status: 400, json: {error: invalidMessage}});
    if (transientFailure) {
      transientFailure = false;
      return route.fulfill({status: 503, json: {error: unavailableMessage}});
    }
    return route.fulfill({status: 200, json: {registered: true}});
  });
  await page.addInitScript(() => {
    if (window !== window.top || location.pathname !== '/experience/moonshot') return;
    const visit = JSON.stringify({
      version: 1, step: 7, station: 7, officeStation: 7, entryStarted: true, spyPhase: 'handed-off', canonPhase: 3,
    });
    localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', visit);
    localStorage.setItem('moonshot:arrival:2026-12-07:v1', visit);
  });
  expect((await page.goto(url.href))?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(url.origin);
  const lounge = page.getByRole('region', {name: '웰컴 라운지에서 할 수 있는 일'});
  await expect(lounge.getByRole('button', {name: /무료 자료 받기|내 AI 체험으로/})).toHaveCount(0);
  const calendar = action(lounge, '캘린더에 추가');
  const reminder = action(lounge, reminderLabel);
  await expect(calendar).toBeInViewport({ratio: .95});
  await expect(reminder).toBeInViewport({ratio: .95});
  const [calendarBox, reminderBox] = await Promise.all([calendar.boundingBox(), reminder.boundingBox()]);
  expect(reminderBox.x).toBeGreaterThanOrEqual(calendarBox.x + calendarBox.width);
  expect(reminderBox.y).toBe(calendarBox.y);
  expect(reminderBox.height).toBeGreaterThanOrEqual(44);
  const schedule = page.getByRole('region', {name: '캠퍼스 체험 안내'});
  return {page, lounge, schedule, calendar, reminder, writes, errors};
}

async function checkOpenForm(visit) {
  const {page, schedule} = visit;
  await expect(schedule.getByRole('link', {name: 'Google 캘린더에 추가', exact: true})).toBeVisible();
  await expect(action(schedule, reminderLabel)).toHaveAttribute('aria-expanded', 'true');
  const phone = page.getByRole('textbox', {name: '휴대폰 번호', exact: true});
  const consent = page.getByRole('checkbox', {name: '라이브 당일 안내 문자 1회 수신에 동의합니다.', exact: true});
  const submit = action(page, '문자 알림 신청');
  await expect(phone).toBeVisible();
  await expect(phone).toHaveAttribute('type', 'tel');
  await expect(phone).toHaveAccessibleDescription('010-0000-0000과 01000000000 모두 가능해요.');
  await expect(phone).toHaveValue('');
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(submit).toBeVisible();
  return {...visit, phone, consent, submit};
}

async function returnToLounge({page, lounge}) {
  await action(page, '공간 둘러보기').tap();
  await expect(lounge).toBeVisible();
}

async function openTeam({page}) {
  const world = page.frameLocator('iframe[title*="직원 사무실"]');
  await world.getByRole('button', {name: /퇴사선배 윤익 · 브랜디액션/}).tap();
  const team = page.getByRole('dialog', {name: '퇴사선배 윤익 · 브랜디액션 팀', exact: true});
  await expect(team).toBeVisible();
  return team;
}

async function openPerks({page}) {
  const world = page.frameLocator('iframe[title*="직원 사무실"]');
  await world.getByRole('button', {name: /자료 안내/}).tap();
  const perks = page.getByRole('dialog', {name: '무료자료 · 라이브 특전', exact: true});
  await action(perks, '라이브 특전').tap();
  await expect(perks.getByText(/라이브에서 비밀번호를 공개합니다/)).toBeVisible();
  return perks;
}

async function openReminderFromGuide(visit, openGuide) {
  const guide = await openGuide(visit);
  await action(guide, reminderLabel).tap();
  await expect(guide).toBeHidden();
  return checkOpenForm(visit);
}

async function send(form, status) {
  const enteredPhone = await form.phone.inputValue();
  const [response] = await Promise.all([
    form.page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === reminderPath),
    form.submit.tap(),
  ]);
  expect(response.status()).toBe(status);
  const payload = response.request().postDataJSON();
  expect(Object.keys(payload).sort()).toEqual(['consent', 'phone']);
  expect(payload.consent).toBe(true);
  expect(payload.phone.replace(/\D/g, '').replace(/^82/, '0')).toBe(enteredPhone.replace(/\D/g, '').replace(/^82/, '0'));
  if (status === 200) {
    expect(await response.json()).toEqual({registered: true});
    await expect(form.page.getByRole('status').filter({hasText: successMessage})).toBeVisible();
    expect(await form.page.evaluate(({national, digits}) => {
      const stored = JSON.stringify([localStorage, sessionStorage]);
      return stored.includes(national) || stored.includes(digits);
    }, {national, digits})).toBe(false);
  }
}

function verifyWrites(form, expectedPosts) {
  expect(form.writes).toEqual(Array.from({length: expectedPosts}, () => ({origin: url.origin, path: reminderPath, method: 'POST'})));
  expect(form.errors).toEqual([]);
}

try {
  const visit = await openLounge();
  await visit.reminder.tap();
  await checkOpenForm(visit);
  await returnToLounge(visit);

  await visit.calendar.tap();
  await expect(visit.schedule.getByRole('link', {name: 'Google 캘린더에 추가', exact: true})).toBeVisible();
  const inline = action(visit.schedule, reminderLabel);
  await expect(inline).toHaveAttribute('aria-expanded', 'false');
  await inline.tap();
  await checkOpenForm(visit);
  await returnToLounge(visit);

  await openReminderFromGuide(visit, openTeam);
  await returnToLounge(visit);
  const first = await openReminderFromGuide(visit, openPerks);
  if (await first.submit.isEnabled()) await first.submit.tap();
  expect(first.writes).toEqual([]);
  await first.phone.fill(preview ? national : '123');
  if (await first.submit.isEnabled()) await first.submit.tap();
  expect(first.writes).toEqual([]);
  await first.consent.check();
  if (!preview) {
    await send(first, 400);
    await expect(first.page.getByRole('alert')).toHaveText(invalidMessage);
    await first.phone.fill(national);
    await send(first, 503);
    await expect(first.page.getByRole('alert')).toHaveText(unavailableMessage);
    await expect(first.phone).toHaveValue(national);
    await expect(first.consent).toBeChecked();
  }
  await send(first, 200);
  await expect(action(first.schedule, reminderLabel)).toHaveCount(0);
  await returnToLounge(first);
  await expect(first.lounge.getByRole('status').filter({hasText: '문자 알림 신청 완료'})).toBeVisible();
  await expect(first.reminder).toHaveCount(0);
  for (const openGuide of [openTeam, openPerks]) {
    const guide = await openGuide(first);
    await expect(guide.getByText('알림 신청 완료', {exact: true})).toBeVisible();
    await expect(action(guide, reminderLabel)).toHaveCount(0);
    await action(guide, '라운지로 돌아가기').tap();
    await expect(guide).toBeHidden();
  }
  await first.calendar.tap();
  await expect(first.schedule.getByRole('status').filter({hasText: successMessage})).toBeVisible();
  await expect(action(first.schedule, reminderLabel)).toHaveCount(0);
  verifyWrites(first, preview ? 1 : 3);
  await first.page.close();

  if (preview) {
    const repeatVisit = await openLounge();
    await repeatVisit.reminder.tap();
    const repeated = await checkOpenForm(repeatVisit);
    await repeated.phone.fill(digits);
    await repeated.consent.check();
    await send(repeated, 200);
    verifyWrites(repeated, 1);
    await repeated.page.close();
  }

  console.log(JSON.stringify({engine: browser.browserType().name(), viewport, mode: preview ? 'preview API' : 'mocked fixture', entryPoints: ['lounge', 'calendar', 'team', 'perks'], sharedCompletion: true, consentDefaultsOff: true, missingFieldsBlocked: true, freshContexts: preview ? 2 : 1, successPosts: preview ? 2 : 1, invalidAndRetry: !preview, clientWritesOnlyReminder: true}));
} finally {
  await browser.close();
}
