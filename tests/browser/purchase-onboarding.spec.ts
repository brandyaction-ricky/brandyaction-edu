import { expect, test } from '@playwright/test';

const order = '11111111-1111-4111-8111-111111111111';
const cohort = '22222222-2222-4222-8222-222222222222';

const initialProgress = () => ({ telegram: false, app: false, orientation: false, learning: false,
  orientationAt: '2026-11-06T20:00:00+09:00', lesson: { id: 'guide', title: '운영 가이드와 규정', url: '/learn/enrollment/guide', completed: false }, comment: '' });
test('four steps persist across reload and require schedule, real learning and comment', async ({ page }, testInfo) => {
  const progress = initialProgress();
  let fail = false;
  const actions: string[] = [];
  await page.route('https://t.me/+ExampleCode123', route => route.fulfill({ body: 'Synthetic Telegram destination' }));
  await page.route('**/api/purchase-onboarding*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, telegramOnly: true, orderId: order, itemName: '문샷 챌린지 4기', roomName: '4기 교육생 공지방', supportUrl: '', progress } });
    const body = route.request().postDataJSON(); actions.push(body.action);
    if (body.action === 'link') return route.fulfill({ json: { ok: true, url: 'https://t.me/+ExampleCode123' } });
    if (fail) return route.fulfill({ status: 503, json: { error: '저장하지 못했습니다.' } });
    if (body.step === 'learning') { progress.learning = true; progress.comment = body.comment; }
    else if (body.step === 'orientation') { expect(body.orientationAt).toBe(progress.orientationAt); progress.orientation = true; }
    else if (body.step === 'telegram') progress.telegram = true;
    else if (body.step === 'app') progress.app = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/purchase-onboarding?order=${order}`);
  await page.getByRole('button', { name: '텔레그램이 처음이에요' }).click();
  await expect(page.getByRole('link', { name: 'iPhone 앱 설치' })).toHaveAttribute('href', 'https://telegram.org/dl/ios');
  const [room] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '텔레그램 공지방 입장' }).click()]);
  await expect(room).toHaveURL('https://t.me/+ExampleCode123'); await room.close();
  await expect(page.getByRole('checkbox', { name: /공지방에 입장했어요/ })).not.toBeChecked();
  fail = true; await page.getByRole('checkbox', { name: /공지방에 입장했어요/ }).click();
  await expect(page.getByRole('alert')).toContainText('저장하지 못했습니다');
  fail = false; await page.getByRole('checkbox', { name: /공지방에 입장했어요/ }).click();
  await expect(page.getByRole('heading', { name: '브랜디에듀 앱을 설치해 주세요' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: '브랜디에듀 앱을 설치해 주세요' })).toBeVisible();
  await page.getByRole('button', { name: '그림 보며 따라 하기' }).click();
  await page.getByRole('checkbox', { name: /브랜디에듀 아이콘을 추가하고 열어 봤어요/ }).click();
  await expect(page.getByText(/2026년 11월 6일/)).toBeVisible();
  await expect(page.getByText(/OT 시청은 필요하지 않아요/)).toBeVisible();
  await page.screenshot({path: `/tmp/edu-onboarding-${testInfo.project.name}.png`, fullPage: true});
  await page.getByRole('checkbox', { name: 'OT 일정을 확인했어요' }).click();
  const save = page.getByRole('button', { name: '댓글 저장하고 시작 준비 완료' });
  await page.getByRole('textbox', { name: '확인 댓글' }).fill('운영 가이드와 규정을 읽고 확인했습니다.');
  await expect(save).toBeDisabled();
  await expect(page.getByRole('link', { name: '운영 가이드 학습 열기' })).toHaveAttribute('href', '/learn/enrollment/guide');
  progress.lesson.completed = true; await page.getByRole('button', { name: '학습 완료 다시 확인' }).click();
  await expect(save).toBeEnabled(); await save.click();
  await expect(page.getByRole('heading', { name: '시작 준비를 모두 마쳤어요!' })).toBeVisible();
  await page.reload(); await expect(page.getByText('저장한 댓글: 운영 가이드와 규정을 읽고 확인했습니다.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(actions).toContain('confirm');
});

test('Telegram return instructions survive reload and date-only OT does not invent a time', async ({ page }) => {
 const progress = {...initialProgress(), orientationAt: '2026-11-09'};
 await page.route('**/api/purchase-onboarding*', route => route.fulfill({json:{available:true,telegramOnly:true,orderId:order,itemName:'합성 5기',roomName:'공지방',supportUrl:'',progress}}));
 await page.goto(`/purchase-onboarding?order=${order}`);
 await page.getByRole('button',{name:'텔레그램이 처음이에요'}).click();
 await expect(page.getByText('설치 후, 이 안내로 다시 돌아와 주세요')).toBeVisible();
 await page.getByRole('button',{name:'이 안내 주소 복사'}).click();
 await expect(page.getByRole('textbox',{name:'돌아올 안내 주소'})).toHaveValue(new RegExp('/purchase-onboarding\\?order='+order));
 await page.evaluate(orderId=>sessionStorage.setItem(`edu-onboarding-telegram-return:${orderId}`,'1'),order);
 await page.reload();
 await expect(page.getByText(/다시 돌아오셨네요!/)).toBeVisible();
 await expect(page.getByRole('button',{name:'텔레그램 공지방 입장'})).toBeVisible();
 progress.telegram=true;progress.app=true;await page.reload();
 await expect(page.getByText(/2026년 11월 9일/)).toBeVisible();
 await expect(page.getByText('예정 · 시간은 추후 안내합니다')).toBeVisible();
 await expect(page.getByText(/오전|오후/)).toHaveCount(0);
});

test('existing fourth cohort without checklist flag retains its existing Telegram flow', async ({ page }) => {
 await page.route('**/api/purchase-onboarding*', route => route.fulfill({json:{available:true,telegramOnly:true,orderId:order,itemName:'문샷 4기',roomName:'4기 공지방',supportUrl:''}}));
 await page.goto(`/purchase-onboarding?order=${order}`);
 await expect(page.getByRole('heading',{name:'4기 공지방에 입장해 주세요'})).toBeVisible();
 await expect(page.getByText('3단계 · 약 5분', {exact:false})).toBeVisible();
 await expect(page.getByText('4단계를 마치면 수업 준비 끝!', {exact:false})).toHaveCount(0);
});

test('missing OT date stays pending instead of pretending onboarding is complete', async ({ page }) => {
 const progress = {...initialProgress(), telegram: true, app: true, orientationAt: ''};
 await page.route('**/api/purchase-onboarding*', route => route.fulfill({json:{available:true,telegramOnly:true,orderId:order,itemName:'합성 기수',roomName:'공지방',supportUrl:'',progress}}));
 await page.goto(`/purchase-onboarding?order=${order}`);
 await expect(page.getByText(/운영자가 OT 일정을 준비 중/)).toBeVisible();
 await expect(page.getByRole('checkbox')).toHaveCount(0);
 await expect(page.getByRole('button', {name:/4단계/})).toBeDisabled();
});

test('customer answers once, then sees the Telegram guide without exposing the invite URL early', async ({ page }) => {
  let room: string | null = null;
  let path: string | null = null;
  await page.route('**/api/purchase-onboarding*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, orderId: order, orderNumber: 'QA-1', itemName: '문샷 챌린지 4기', roomName: 'AI Moonshot project #4기', surveyRoom: room, telegramPath: path, profileImage: '', supportUrl: 'https://example.com/help' } });
    const body = route.request().postDataJSON();
    expect(body.order).toBe(order);
    if (body.action === 'answer') room = body.room;
    if (body.action === 'path') path = body.path;
    return route.fulfill({ json: { ok: true, surveyRoom: room, telegramPath: path } });
  });
  await page.goto(`/purchase-onboarding?order=${order}`);
  await expect(page.getByRole('heading', { name: '어떤 경로로 참여하셨나요?' })).toBeVisible();
  await expect(page.getByRole('button', { name: '텔레그램 방 입장' })).toHaveCount(0);
  await page.getByRole('button', { name: '광고 방에서 참여했어요' }).click();
  await expect(page.getByRole('heading', { name: '텔레그램 방에 입장해 주세요' })).toBeVisible();
  await expect(page.getByText('AI Moonshot project #4기')).toBeVisible();
  await page.getByRole('button', { name: '텔레그램이 처음이에요' }).click();
  await expect(page.getByRole('button', { name: '텔레그램 방 입장' })).toBeVisible();
  await expect(page.getByText('텔레그램 앱을 설치하고 계정을 만든 뒤')).toBeVisible();
});

test('operator saves and reopens a completion message with the direct guide', async ({ page }) => {
  const product = '33333333-3333-4333-8333-333333333333';
  const settings = { label: '문샷 공부방 입장하기', url: 'https://campus.example.test/welcome?cohort=5', message: 'OT는 월요일에 진행합니다.\n준비물을 확인해 주세요.' };
  const saved: Array<{ settings: typeof settings }> = [];
  await page.route('**/api/admin/purchase-onboarding/delivery*', route => route.fulfill({ json: { buyers: [], channels: {}, templates: [], history: [] } }));
  await page.route(/\/api\/admin\/purchase-onboarding(?:\?|$)/, route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      saved.push(body);
      return route.fulfill({ json: { ok: true, settings: body.settings } });
    }
    expect(url.searchParams.get('product')).toBe(product);
    return route.fulfill({ json: url.searchParams.has('cohort')
      ? { settings: saved.at(-1)?.settings ?? null }
      : { cohorts: [{ id: cohort, name: '5기', courses: { title: '문샷 챌린지' } }] } });
  });
  await page.goto('/admin/purchase-onboarding-test?product=' + product);
  await page.getByLabel('안내할 기수').selectOption(cohort);
  const panel = page.locator('#completion-settings');
  await expect(panel.getByRole('textbox')).toHaveCount(3);
  const messageField = panel.getByLabel('안내 메시지 (선택)');
  await messageField.fill(settings.message);
  await panel.getByLabel('안내 링크 제목', { exact: true }).fill(settings.label);
  await panel.getByLabel('안내 링크 주소', { exact: true }).fill(settings.url);
  await panel.getByRole('button', { name: '설정 저장' }).click();
  await expect(panel.getByRole('status')).toContainText('결제 완료 화면에 안내를 표시합니다');
  expect(saved).toEqual([{ product, cohort, settings }]);
  await page.reload();
  await page.getByLabel('안내할 기수').selectOption(cohort);
  await expect(messageField).toHaveValue(settings.message);
  await expect(page.getByRole('link', { name: '구매자 공지·발송 내역' })).toBeVisible();
});

test('the paid buyer can copy the campus link, verify their login and enter directly', async ({ page }) => {
  const completionGuide = { label: '문샷 공부방 입장하기', url: 'https://campus.example.test/welcome?cohort=5', message: 'OT는 월요일에 진행합니다.\n준비물을 확인해 주세요.' };
  const loginId = 'buyer-login@example.test';
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { (window as Window & { copiedCampusLink?: string }).copiedCampusLink = value; },
    } });
  });
  await page.route('**/api/purchase-onboarding*', route => route.fulfill({ json: { available: true, orderId: order, completionGuide, loginId } }));
  await page.route('https://campus.example.test/**', route => route.fulfill({ body: 'Synthetic welcome room' }));
  await page.goto(`/order-complete-test?orderId=${order}`);
  const guide = page.getByRole('region', { name: completionGuide.label });
  await expect(guide.getByRole('heading', { name: completionGuide.label })).toBeVisible();
  const direct = guide.getByRole('link', { name: '링크 눌러 입장하기' });
  await expect(direct).toHaveAttribute('href', completionGuide.url);
  const message = guide.getByText(completionGuide.message);
  await expect(message).toHaveText(completionGuide.message);
  expect(await message.textContent()).toBe(completionGuide.message);
  await expect(message).toHaveCSS('white-space', 'pre-wrap');
  const steps = guide.getByRole('listitem');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(1)).toContainText(loginId);
  await expect(steps.nth(2).getByRole('link')).toHaveAttribute('href', completionGuide.url);
  const copy = steps.first().getByRole('button', { name: '링크 복사' });
  await copy.click();
  await expect(guide.getByRole('status')).toHaveText('링크를 복사했어요.');
  expect(await page.evaluate(() => (window as Window & { copiedCampusLink?: string }).copiedCampusLink)).toBe(completionGuide.url);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw Error('Clipboard unavailable'); },
  } }));
  await copy.click();
  await expect(guide.getByRole('textbox', { name: '복사할 입장 링크' })).toHaveValue(completionGuide.url);
  await expect(page.getByRole('list', { name: '클래스 시작 단계' })).toHaveCount(0);
  await direct.click();
  await expect(page).toHaveURL(completionGuide.url);
  await page.goto(`/purchase-onboarding?order=${order}&step=guide`);
  await expect(direct).toHaveAttribute('href', completionGuide.url);
  await expect(guide.getByText(completionGuide.message)).toBeVisible();
  await expect(guide.getByText(loginId, { exact: true })).toBeVisible();
  await expect(page.getByText('공지방 입장', { exact: true })).toHaveCount(0);
});

test('completion with only a message sends the buyer to their classes', async ({ page }) => {
  const completionGuide = { label: '', url: '', message: '첫 수업 전에 준비물을 확인해 주세요.' };
  await page.route('**/api/purchase-onboarding*', route => route.fulfill({ json: { available: true, orderId: order, completionGuide } }));
  for (const path of [`/order-complete-test?orderId=${order}`, `/purchase-onboarding?order=${order}`]) {
    await page.goto(path);
    await expect(page.getByText(completionGuide.message)).toBeVisible();
    await expect(page.getByText('가입할 때 사용한 로그인 방법으로 같은 계정에 접속해 주세요.')).toBeVisible();
    await expect(page.getByRole('button', { name: '링크 복사' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '내 클래스 보기' })).toHaveAttribute('href', '/my/classes');
    await expect(page.locator('a[href=""]')).toHaveCount(0);
  }
});

test('paid completion offers onboarding only when the cohort guide is enabled', async ({ page }) => {
  let enabled = false;
  await page.route('**/api/purchase-onboarding*', route => route.fulfill({ status: enabled ? 200 : 404, json: enabled ? { available: true } : { available: false } }));
  await page.goto(`/order-complete-test?orderId=${order}`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveCount(0);
  enabled = true;
  await page.reload();
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
});

test('Toss order number resolves to the internal order ID before onboarding lookup', async ({ page }) => {
  const lookups: string[] = [];
  const confirmations: string[] = [];
  await page.route('**/api/platform/payment', route => {
    confirmations.push(route.request().postDataJSON().orderId);
    return route.fulfill({ json: { status: 'paid' } });
  });
  await page.route('**/api/purchase-onboarding*', route => {
    lookups.push(new URL(route.request().url()).searchParams.get('order') || '');
    return route.fulfill({ json: { available: true, orderId: order } });
  });
  await page.goto('/order-complete-test?orderId=BAE-QA-1&paymentKey=qa-key&amount=1650000&fixtureStatus=pending');
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  expect(confirmations).toContain('BAE-QA-1');
  expect(lookups).toContain(order);
  expect(lookups).not.toContain('BAE-QA-1');
});

test('free completion and order-history reentry use the same internal order ID', async ({ page }) => {
  const lookups: string[] = [];
  await page.route('**/api/purchase-onboarding*', route => {
    lookups.push(new URL(route.request().url()).searchParams.get('order') || '');
    return route.fulfill({ json: { available: true, orderId: order } });
  });
  await page.goto(`/order-complete-test?order=${order}&free=1`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  await page.goto(`/order-complete-test?order=${order}`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  // StrictMode may replay the effect, so assert the order identity rather than the fetch count.
  expect(lookups.length).toBeGreaterThanOrEqual(2);
  expect(lookups.every(value => value === order)).toBe(true);
});

test('cancelled orders do not request purchase onboarding', async ({ page }) => {
  const lookups: string[] = [];
  await page.route('**/api/purchase-onboarding*', route => {
    lookups.push(route.request().url());
    return route.fulfill({ status: 404, json: { available: false } });
  });
  await page.goto(`/order-complete-test?order=${order}&fixtureStatus=cancelled`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveCount(0);
  expect(lookups).toHaveLength(0);
});

test('onboarding lookup failure is visible and can be retried', async ({ page }) => {
  let retryAllowed = false;
  await page.route('**/api/purchase-onboarding*', route => {
    return route.fulfill({ status: retryAllowed ? 200 : 503, json: retryAllowed ? { available: true, orderId: order } : { error: '일시적인 오류' } });
  });
  await page.goto(`/order-complete-test?order=${order}`);
  await expect(page.getByRole('alert')).toContainText('시작 안내를 불러오지 못했습니다');
  retryAllowed = true;
  await page.getByRole('button', { name: '시작 안내 다시 확인' }).click();
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
});

for (const [channel, label] of [['sms', '문자 (SMS)'], ['alimtalk', '카카오 알림톡'], ['email', '이메일']] as const) {
  test(`cohort purchase admin schedules and cancels a ${channel} notice for selected buyers`, async ({ page }) => {
    const other = '33333333-3333-4333-8333-333333333333';
    const template = { id: 'test-template', channel, name: '검수용 결제 안내', content: '입장 링크 확인', version: 'test-version' };
    let batch: Record<string, unknown> | null = null;
    let cancelled = false;
    await page.route('**/api/admin/purchase-onboarding?*', route => route.fulfill({ json: {
      settings: { roomName: '', inviteUrl: '', paidImage: '', organicImage: '', enabled: true, mode: 'campus_welcome' },
    } }));
    await page.route('**/api/admin/purchase-onboarding', route => route.fulfill({ json: {
      cohorts: [{ id: cohort, name: '5기', courses: { title: '문샷 챌린지' } }],
    } }));
    await page.route('**/api/admin/purchase-onboarding/delivery*', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.action === 'cancel') {
          expect(body.id).toBe(batch?.id);
          cancelled = true;
        } else {
          expect(body).toMatchObject({ cohort, action: 'schedule', channel, recipients: [other],
            ...(channel === 'email' ? { subject: '2번 공지방', content: '입장 링크 확인' } :
              { templateId: template.id, templateVersion: template.version }) });
          batch = body;
        }
        return route.fulfill({ json: { ok: true } });
      }
      expect(new URL(route.request().url()).searchParams.get('cohort')).toBe(cohort);
      return route.fulfill({ json: {
        buyers: [{ id: order, name: '첫째 구매자', channels: [channel] }, { id: other, name: '둘째 구매자', channels: [channel] }],
        channels: { sms: true, lms: true, alimtalk: true, email: true }, templates: channel === 'email' ? [] : [template],
        history: batch ? [{ id: batch.id, channel, count: 1, subject: batch.subject, content: batch.content, status: cancelled ? 'cancelled' : 'scheduled', scheduled_at: batch.scheduledAt }] : [],
      } });
    });
    await page.goto('/admin/purchase-onboarding-test');
    await page.getByLabel('안내할 기수').selectOption(cohort);
    await expect(page.getByRole('link', { name: '구매자 공지·발송 내역' })).toHaveAttribute('href', '#buyer-delivery');
    await page.getByRole('combobox', { name: '채널', exact: true }).selectOption(channel);
    await page.getByLabel('둘째 구매자', { exact: false }).check();
    if (channel === 'email') {
      await page.getByLabel('이메일 제목').fill('2번 공지방');
      await page.getByLabel('이메일 내용').fill('입장 링크 확인');
    } else {
      await page.getByLabel('정보성 메시지 템플릿').selectOption(template.id);
    }
    await page.getByLabel('발송 시각 (현재 기기 시간)').fill('2027-12-01T12:00');
    await page.getByRole('button', { name: '대상·문구 확인' }).click();
    await expect(page.getByRole('heading', { name: `${label} · 1명` })).toBeVisible();
    expect(batch).toBeNull();
    await page.getByRole('button', { name: '확인한 내용으로 발송 예약' }).click();
    await page.getByText(`${label} · 1명 · 예약 대기`, { exact: false }).click();
    await page.getByRole('button', { name: '이 예약 취소' }).click();
    await expect(page.getByText(`${label} · 1명 · 취소됨`, { exact: false })).toBeVisible();
  });
}

test('direct SMS can select a group above 100, narrow it by name, then review and save once', async ({ page }) => {
  const buyers = Array.from({ length: 105 }, (_, i) => ({
    id: '44444444-4444-4444-8444-' + String(i).padStart(12, '0'),
    name: `검수 구매자 ${i}`, channels: i === 104 ? [] : ['sms', 'lms'],
  }));
  const sent: unknown[] = [];
  await page.route('**/api/admin/purchase-onboarding', route => route.fulfill({ json: { cohorts: [{ id: cohort, name: '5기' }] } }));
  await page.route('**/api/admin/purchase-onboarding?*', route => route.fulfill({ json: { settings: null } }));
  await page.route('**/api/admin/purchase-onboarding/delivery*', route => {
    if (route.request().method() === 'POST') {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { buyers, channels: { sms: true, lms: true }, templates: [], history: [] } });
  });
  await page.goto('/admin/purchase-onboarding-test');
  await page.getByLabel('안내할 기수').selectOption(cohort);
  await expect(page.getByText('전체 결제자 105명 · 발송 가능 104명 · 선택 0명', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '발송 가능한 전체 선택' }).click();
  await expect(page.getByText('전체 결제자 105명 · 발송 가능 104명 · 선택 104명', { exact: true })).toBeVisible();
  await page.getByLabel('구매자 이름 검색').fill('구매자 103');
  await page.getByLabel('검수 구매자 103').uncheck();
  await expect(page.getByText('전체 결제자 105명 · 발송 가능 104명 · 선택 103명', { exact: true })).toBeVisible();
  const body = page.getByLabel('문자 내용');
  await body.fill('가'.repeat(46));
  await expect(page.getByText('92 / 90바이트', { exact: false })).toBeVisible();
  await page.getByLabel('발송 시각 (현재 기기 시간)').fill('2027-12-01T12:00');
  await expect(page.getByRole('button', { name: '대상·문구 확인' })).toBeDisabled();
  const text = '수업 안내 https://t.me/+synthetic';
  await body.fill(text);
  await page.getByRole('button', { name: '대상·문구 확인' }).click();
  await expect(page.getByRole('heading', { name: '문자 (SMS) · 103명' })).toBeVisible();
  await expect(page.getByRole('region', { name: '발송 예약 미리보기' }).getByText(text, { exact: true })).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByRole('button', { name: '확인한 내용으로 발송 예약' }).click();
  await expect(page.getByRole('status')).toHaveText('발송 예약을 저장했습니다.');
  expect(sent).toEqual([expect.objectContaining({ action: 'schedule', cohort, channel: 'sms', templateId: '', content: text, recipients: buyers.slice(0, 103).map(buyer => buyer.id) })]);
});

test('purchase notice selects preset counts and separates accepted, reserved and uncertain buyers without scheduling', async ({ page }) => {
  const buyers = Array.from({ length: 105 }, (_, i) => ({
    id: '44444444-4444-4444-8444-' + String(i).padStart(12, '0'),
    name: `검수 구매자 ${i}`,
    channels: i === 104 ? [] : ['sms', 'lms', 'email'],
    delivery: i === 1 ? { sms: { accepted: true } } : i === 2 ? { sms: { pending: true } } : i === 3 ? { sms: { uncertain: true } } : undefined,
  }));
  const writes: string[] = [];
  await page.route(/\/api\/admin\/purchase-onboarding(?:\?|$)/, route => route.fulfill({
    json: new URL(route.request().url()).searchParams.has('cohort') ? { settings: null } : { cohorts: [{ id: cohort, name: '5기' }] },
  }));
  await page.route('**/api/admin/purchase-onboarding/delivery*', route => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method());
      return route.abort();
    }
    return route.fulfill({ json: { buyers, channels: { sms: true, lms: true, email: true }, templates: [], history: [] } });
  });

  await page.goto('/admin/purchase-onboarding-test');
  await page.getByLabel('안내할 기수').selectOption(cohort);
  const history = page.getByLabel('발송 이력');
  const count = (amount: number) => expect(page.getByText(`전체 결제자 105명 · 발송 가능 102명 · 선택 ${amount}명`, { exact: true })).toBeVisible();
  const list = page.locator('[aria-label="발송 대상"]');
  await expect(history).toHaveValue('ready');
  await page.getByRole('button', { name: '절반 선택' }).click();
  await count(51);
  await page.getByRole('button', { name: '50명 선택' }).click();
  await count(50);
  await page.getByLabel('선택할 인원').fill('37');
  await page.getByRole('button', { name: '입력한 인원 선택' }).click();
  await count(37);
  await page.getByRole('button', { name: '발송 가능한 전체 선택' }).click();
  await count(101);

  await history.selectOption('pending');
  await count(0);
  await expect(list.getByText('예약·처리 중', { exact: true })).toBeVisible();
  await expect(list.getByText('결과 확인 필요', { exact: true })).toBeVisible();
  await expect(list.getByRole('checkbox', { name: /검수 구매자 2 / })).toBeDisabled();
  await expect(list.getByRole('checkbox', { name: /검수 구매자 3 / })).toBeDisabled();

  await history.selectOption('accepted');
  await expect(list.getByText('발송 접수됨', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '50명 선택' }).click();
  await count(1);
  await page.getByLabel('문자 내용').fill('새 공지');
  await page.getByLabel('발송 시각 (현재 기기 시간)').fill('2027-12-01T12:00');
  await page.getByRole('button', { name: '대상·문구 확인' }).click();
  await expect(page.getByText('이전에 발송한 구매자 1명이 포함돼 있습니다.')).toBeVisible();

  await page.getByRole('combobox', { name: '채널', exact: true }).selectOption('lms');
  await expect(list.getByText('발송 접수됨', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '채널', exact: true }).selectOption('email');
  await expect(history).toHaveValue('ready');
  await expect(list.getByText('발송 접수됨', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('templates returns to the same purchase product and cohort, then back to the product editor', async ({ page }) => {
  const product = '33333333-3333-4333-8333-333333333333';
  await page.route(/\/api\/admin\/purchase-onboarding(?:\?|$)/, route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('product')).toBe(product);
    return route.fulfill({ json: url.searchParams.has('cohort') ? { settings: null } : { cohorts: [{ id: cohort, name: '5기' }] } });
  });
  await page.route('**/api/admin/purchase-onboarding/delivery*', route => route.fulfill({ json: { buyers: [], templates: [], channels: {}, history: [] } }));
  await page.goto(`/admin/product-editor?id=${product}&navigationFixture=1&careNavigationFixture=1&returnNavigationFixture=1`);
  await page.getByRole('link', { name: '결제 후 안내 설정' }).click();
  await page.getByLabel('안내할 기수').selectOption(cohort);
  await page.getByRole('link', { name: '메시지 템플릿 관리' }).click();
  const back = page.getByRole('link', { name: /구매자 공지로 돌아가기/ });
  await expect(back).toHaveAttribute('href', `/admin/purchase-onboarding?cohort=${cohort}&product=${product}#buyer-delivery`);
  await back.click();
  await expect(page.getByLabel('안내할 기수')).toHaveValue(cohort);
  await expect(page).toHaveURL(/#buyer-delivery$/);
  await page.getByRole('link', { name: /이전 관리 화면으로/ }).click();
  await expect(page).toHaveURL(new RegExp('/admin/product-editor\\?id=' + product));
});

test('admin cross-page returns preserve the previous filter and reject an external return target', async ({ page }) => {
  await page.goto('/admin/products?query=Moonshot&navigationFixture=1&careNavigationFixture=1&returnNavigationFixture=1');
  await page.getByRole('link', { name: '검수 상품 편집' }).click();
  await page.getByRole('link', { name: /이전 관리 화면으로/ }).click();
  await expect(page).toHaveURL(/\/admin\/products\?query=Moonshot/);
  await expect(page.getByRole('link', { name: /운영 홈으로/ })).toHaveAttribute('href', '/admin');
  await page.goto('/admin/templates?returnTo=%2F%2Fexternal.example&navigationFixture=1&careNavigationFixture=1&returnNavigationFixture=1');
  await expect(page.getByRole('link', { name: /캠페인 발송으로/ })).toHaveAttribute('href', '/admin/campaigns');
});
