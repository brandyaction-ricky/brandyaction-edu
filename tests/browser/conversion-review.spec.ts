import { expect, test, type Page } from '@playwright/test';
import { createMockJudgment, evidenceVersions, type ConversionCase, type ConversionSnapshot } from '../../lib/conversion-review';

// Synthetic inquiry and product data only. Route interception cannot reach DB,
// auth, model or message providers, and the fixture server rejects other writes.
const timestamp = '2026-09-20T01:00:00.000Z';
const courseId = '11111111-1111-4111-8111-111111111111';
const initialCase: ConversionCase = {
  id: '22222222-2222-4222-8222-222222222222', source_type: 'manual', question_id: null,
  course_id: courseId, cohort_id: null, subject: '초보 수강과 녹화 문의',
  content: '초보자도 따라갈 수 있나요? 실시간 참석이 어려운데 녹화가 있나요?',
  source_label: '합성 상담 예시', received_at: timestamp, customer_id: null, input_version: 1, created_at: timestamp,
};
function initialSnapshot(): ConversionSnapshot {
  return {
    cases: [{ ...initialCase }],
    evidence: [{ id: '33333333-3333-4333-8333-333333333333', course_id: courseId, cohort_id: null,
      title: '수강 수준 안내', body: '초보자를 대상으로 기초 개념부터 설명합니다.',
      source_url: 'https://example.test/course-guide', version: 1, status: 'approved' }],
    courses: [{ id: courseId, title: '합성 교육 상품' }],
    cohorts: [{ id: '44444444-4444-4444-8444-444444444444', course_id: courseId, name: '합성 1기' }],
    questions: [], runs: [], reviews: [], capabilities: { can_manage_evidence: true, can_mock: true },
  };
}

async function fixture(page: Page) {
  const snapshot = initialSnapshot();
  const mutations: Record<string, unknown>[] = [];
  const unexpectedApi: string[] = [];
  let forbidden = false;
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).pathname !== '/api/conversion') {
      unexpectedApi.push(route.request().url());
      await route.fulfill({ status: 405, json: { error: '검증에 허용되지 않은 API입니다.' } }); return;
    }
    if (forbidden) { await route.fulfill({ status: 403, json: { error: '전환 관리 접근 권한이 없습니다.' } }); return; }
    if (route.request().method() === 'GET') { await route.fulfill({ json: snapshot }); return; }
    const body = route.request().postDataJSON();
    mutations.push(body);
    if (body.action === 'save_case') {
      const item: ConversionCase = { ...initialCase, id: '55555555-5555-4555-8555-555555555555',
        subject: body.subject, content: body.content, source_label: body.source_label,
        received_at: body.received_at, course_id: body.course_id, cohort_id: body.cohort_id };
      snapshot.cases.push(item);
      await route.fulfill({ json: { ok: true, case: item } }); return;
    }
    if (body.action === 'analyze') {
      const item = snapshot.cases.find(row => row.id === body.case_id)!;
      const run = { id: `run-${snapshot.runs.length + 1}`, case_id: item.id, input_version: item.input_version,
        provider: 'mock' as const, result: createMockJudgment(item, snapshot.evidence),
        evidence_versions: evidenceVersions(item, snapshot.evidence), created_at: timestamp };
      snapshot.runs.push(run);
      await route.fulfill({ json: { ok: true, run } }); return;
    }
    if (body.action === 'review') {
      const review = { id: `review-${snapshot.reviews.length + 1}`, case_id: body.case_id, run_id: body.run_id,
        decision: body.decision, reply_text: body.reply_text, reason: body.reason,
        created_at: timestamp, actor_id: 'synthetic-operator' };
      snapshot.reviews.push(review);
      await route.fulfill({ json: { ok: true, review } }); return;
    }
    await route.fulfill({ status: 405, json: { error: '등록되지 않은 모의 요청입니다.' } });
  });
  await page.goto('/admin/conversion');
  await expect(page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ })).toBeVisible();
  return { snapshot, mutations, unexpectedApi, deny: () => { forbidden = true; } };
}

async function selectAndAnalyze(page: Page) {
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: '모의 판단 실행', exact: true }).click();
  await expect(page.getByLabel(/^검토할 설명/)).toHaveValue('초보자를 대상으로 기초 개념부터 설명합니다.');
  await expect(page.getByText('추가 확인 필요: 이용 방법', { exact: true })).toBeVisible();
}

test('funnel preparation rejects cross-product cohorts and never saves or fabricates metrics', async ({ page }) => {
  const state = await fixture(page);
  state.snapshot.courses.push({ id: 'paid', title: '합성 유료 교육' });
  state.snapshot.cohorts.push({ id: 'paid-cohort', course_id: 'paid', name: '합성 유료 기수' });
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await page.getByRole('button', { name: '모집 경로 준비', exact: true }).click();
  await page.getByRole('combobox', { name: '무료 교육 상품', exact: true }).selectOption(courseId);
  await page.getByRole('combobox', { name: '유료 교육 상품', exact: true }).selectOption('paid');
  await expect(page.getByRole('combobox', { name: '무료 교육 회차·기수', exact: true })).toHaveCount(0);
  const paidCohort = page.getByRole('combobox', { name: '유료 교육 회차·기수', exact: true });
  await expect(paidCohort.locator('option')).toHaveCount(2);
  await paidCohort.selectOption('paid-cohort');
  await expect(page.getByText('상품·기수 선택 완료 · 무료/유료 판매 조건과 실제 측정 연결은 확인 전입니다.', { exact: true })).toBeVisible();
  await expect(page.getByText('연결 확인 전', { exact: true })).toHaveCount(10);
  await page.getByRole('combobox', { name: '유료 교육 상품', exact: true }).selectOption(courseId);
  await expect(paidCohort).toHaveValue('');
  await expect(page.getByText('무료 교육과 유료 교육은 서로 다른 상품으로 연결해 주세요.', { exact: true })).toBeVisible();
  expect(state.mutations).toHaveLength(0);
  expect(state.unexpectedApi).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  state.deny();
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '무료 교육 상품', exact: true })).toHaveCount(0);
});

test('authorized funnel draft can be saved and reloaded while stale writes require a fresh read', async ({ page }) => {
  const state = await fixture(page);
  state.snapshot.capabilities.can_manage_funnel = true;
  state.snapshot.courses.push({ id: 'paid', title: '합성 유료 교육' });
  state.snapshot.cohorts.push({ id: 'paid-cohort', course_id: 'paid', name: '합성 유료 기수' });
  let saved: Record<string, unknown> | null = null;
  let stale = false;
  let writes = 0;
  await page.route('**/api/conversion/funnel', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { draft: saved, measurement: 'unverified' } });
    if (stale) return route.fulfill({ status: 409, json: { error: '최신 버전을 다시 불러와 주세요.' } });
    const body = route.request().postDataJSON();
    expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.expected_version).toBe(0);
    expect(body).not.toHaveProperty('freeCohortId');
    saved = { version: 1, free_course_id: body.freeCourseId, free_cohort_id: body.freeCohortId, paid_course_id: body.paidCourseId, paid_cohort_id: body.paidCohortId };
    writes++;
    return route.fulfill({ json: { draft: saved, measurement: 'unverified' } });
  });
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.getByRole('button', { name: '새로고침', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '모집 경로 준비', exact: true }).click();
  await expect(page.getByText('아직 저장된 경로 없음', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '무료 교육 상품', exact: true }).selectOption(courseId);
  await page.getByRole('combobox', { name: '유료 교육 상품', exact: true }).selectOption('paid');
  await page.getByRole('combobox', { name: '유료 교육 회차·기수', exact: true }).selectOption('paid-cohort');
  await page.getByRole('button', { name: '모집 경로 초안 저장', exact: true }).click();
  await expect(page.getByText('저장 버전 1', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: '모집 경로 준비 닫기', exact: true }).click();
  await page.getByRole('button', { name: '모집 경로 준비', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '유료 교육 상품', exact: true })).toHaveValue('paid');
  stale = true;
  await page.getByRole('button', { name: '모집 경로 초안 저장', exact: true }).click();
  await expect(page.getByText('최신 버전을 다시 불러와 주세요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '모집 경로 초안 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '저장된 경로 다시 불러오기', exact: true }).click();
  await expect(page.getByRole('button', { name: '모집 경로 초안 저장', exact: true })).toBeEnabled();
  await expect(page.getByText('연결 확인 전', { exact: true })).toHaveCount(10);
});

test('manual inquiry can be entered and saved without inventing a customer identity', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: '문의 연결', exact: true }).click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '문의 연결', exact: true }) });
  await drawer.getByLabel(/^문의 출처/).selectOption('manual');
  await drawer.getByLabel(/^문의 제목/).fill('수강 일정 확인');
  await drawer.getByLabel(/^문의 발췌/).fill('수업은 언제 진행되나요?');
  await drawer.getByLabel(/^출처 설명/).fill('합성 외부 문의');
  await drawer.getByLabel(/^문의 접수 시각/).fill('2026-09-20T10:00');
  await drawer.getByLabel(/^대상 상품/).selectOption(courseId);
  await drawer.getByRole('button', { name: '문의 저장', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '수강 일정 확인', exact: true })).toBeVisible();
  await expect(page.getByText('미연결 · 개인별 구매 관찰 불가', { exact: true })).toBeVisible();
  expect(state.mutations).toHaveLength(1);
  expect(state.mutations[0]).toMatchObject({ action: 'save_case', question_id: null, course_id: courseId, cohort_id: null, subject: '수강 일정 확인' });
  expect(state.mutations[0]).not.toHaveProperty('customer_id');
  expect(state.mutations[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
});

test('mock recommendation can be edited and held as review records without sending any message', async ({ page }) => {
  const state = await fixture(page);
  await selectAndAnalyze(page);
  await expect(page.getByText('모의 판단 · 운영자 확인 필요', { exact: true })).toBeVisible();
  await page.getByLabel(/^검토 결정/).selectOption('edit');
  await page.getByLabel(/^검토할 설명/).fill('수강 수준은 안내 가능하며 녹화 제공 여부는 추가 확인이 필요합니다.');
  await page.getByLabel(/^검토 사유/).fill('녹화 제공 자료가 아직 없습니다.');
  await page.getByRole('button', { name: '검토 기록 저장', exact: true }).click();
  await expect(page.locator('.conversion-record')).toHaveCount(1);
  await expect(page.locator('.conversion-record')).toContainText('수정');
  await expect(page.locator('.conversion-record')).toContainText('실제 적용 미확인');
  await page.getByLabel(/^검토 결정/).selectOption('hold');
  await page.getByLabel(/^검토 사유/).fill('운영 확인을 기다립니다.');
  await page.getByRole('button', { name: '검토 기록 저장', exact: true }).click();
  await expect(page.locator('.conversion-record')).toHaveCount(2);
  expect(state.mutations.map(item => item.action)).toEqual(['analyze', 'review', 'review']);
  expect(state.mutations[1].decision).toBe('edit');
  expect(state.mutations[2].decision).toBe('hold');
  expect(state.unexpectedApi).toEqual([]);
  await expect(page.getByText('검토 기록을 저장했습니다. 고객에게 전달된 답변은 아닙니다.', { exact: true })).toBeVisible();
});

test('changed evidence invalidates the old recommendation and disables review saving', async ({ page }) => {
  const state = await fixture(page);
  await selectAndAnalyze(page);
  state.snapshot.evidence[0].version = 2;
  state.snapshot.evidence[0].body = '승인 문구가 변경된 합성 자료입니다.';
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('문의나 설명자료가 바뀌었습니다. 새로 판단한 뒤 검토 기록을 남겨 주세요.');
  await expect(page.getByRole('button', { name: '검토 기록 저장', exact: true })).toBeDisabled();
  await expect(page.getByLabel(/^검토할 설명/)).toBeDisabled();
  expect(state.mutations.map(item => item.action)).toEqual(['analyze']);
});

test('lost read access clears previously loaded inquiry and draft data', async ({ page }) => {
  const state = await fixture(page);
  await selectAndAnalyze(page);
  state.deny();
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('전환 관리 접근 권한이 없습니다.');
  await expect(page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ })).toHaveCount(0);
  await expect(page.getByLabel(/^검토할 설명/)).toHaveCount(0);
  await expect(page.getByText(initialCase.content, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).toHaveCount(0);
});

test('review and manual-entry drawer fit the viewport without horizontal overflow', async ({ page }) => {
  await fixture(page);
  await selectAndAnalyze(page);
  const noOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };
  await noOverflow();
  await page.getByRole('button', { name: '문의 연결', exact: true }).click();
  await page.getByLabel(/^문의 출처/).selectOption('manual');
  await expect(page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '문의 연결', exact: true }) })).toBeVisible();
  await noOverflow();
});
