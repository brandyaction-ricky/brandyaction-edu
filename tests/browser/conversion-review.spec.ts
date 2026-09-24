import { expect, test, type Page } from '@playwright/test';
import { createMockJudgment, evidenceVersions, MOCK_NOTICE, type ConversionCase, type ConversionRun, type ConversionSnapshot } from '../../lib/conversion-review';

// Synthetic inquiry and product data only. Route interception cannot reach DB,
// auth, model or message providers, and the fixture server rejects other writes.
const timestamp = '2026-09-20T01:00:00.000Z';
const courseId = '11111111-1111-4111-8111-111111111111';
const initialCase: ConversionCase = {
  id: '22222222-2222-4222-8222-222222222222', source_type: 'manual', sample_origin: 'current', legacy_course_label: null, question_id: null,
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
    questions: [], runs: [], reviews: [], adjudications: [], capabilities: { can_manage_evidence: true, can_mock: true },
  };
}

async function fixture(page: Page, provider: 'mock' | 'jev' = 'mock') {
  const snapshot = initialSnapshot();
  if (provider === 'jev') snapshot.capabilities = { ...snapshot.capabilities, can_jev: true, can_adjudicate: true, can_analyze: true, analyze_provider: 'jev' };
  const mutations: Record<string, unknown>[] = [];
  const unexpectedApi: string[] = [];
  let forbidden = false;
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!['/api/conversion', '/api/conversion/adjudication', '/api/conversion/jev-v2', '/api/conversion/jev-v3', '/api/conversion/jev-v4'].includes(pathname)) {
      unexpectedApi.push(route.request().url());
      await route.fulfill({ status: 405, json: { error: '검증에 허용되지 않은 API입니다.' } }); return;
    }
    if (forbidden) { await route.fulfill({ status: 403, json: { error: '전환 관리 접근 권한이 없습니다.' } }); return; }
    if (pathname === '/api/conversion/jev-v2') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: .75, probabilities: { [value]: .75 } });
      const result = { contract_version: 2 as const, model: 'jev-test', decisions: {
        information_need: choice('skill_requirement'), confirmed_barrier: choice('none_stated'),
        operational_issue: choice('none_stated'), observable_stage: choice('information_seeking'),
      } };
      snapshot.jev_v2_runs ||= [];
      snapshot.jev_v2_runs.push({ id: `v2-${snapshot.jev_v2_runs.length + 1}`, v1_run_id: body.v1_run_id,
        case_id: initialCase.id, calibration_review_id: snapshot.reviews[0].id, input_version: 1,
        status: 'completed', result, created_at: timestamp, updated_at: timestamp });
      await route.fulfill({ json: { ok: true, result } }); return;
    }
    if (pathname === '/api/conversion/jev-v3') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: .75, probabilities: { [value]: .75 } });
      const result = { contract_version: 3 as const, model: 'jev-test', decisions: {
        information_need: choice('registration_or_access'), confirmed_barrier: choice('none_stated'),
        attempted_action_target: choice('free_live_or_replay'), operational_issue: choice('paid_application_failure'),
        observable_stage: choice('paid_application_or_payment_attempt'),
      }, consistency_flags: ['paid_attempt_without_paid_target', 'paid_failure_without_paid_target'] as const };
      snapshot.jev_v3_runs ||= [];
      snapshot.jev_v3_runs.push({ id: `v3-${snapshot.jev_v3_runs.length + 1}`, v1_run_id: body.v1_run_id,
        case_id: initialCase.id, calibration_review_id: snapshot.reviews[0].id, input_version: 1,
        status: 'completed', result: { ...result, consistency_flags: [...result.consistency_flags] }, created_at: timestamp, updated_at: timestamp });
      await route.fulfill({ json: { ok: true, result } }); return;
    }
    if (pathname === '/api/conversion/jev-v4') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: .75, probabilities: { [value]: .75 } });
      const result = { contract_version: 4 as const, model: 'jev-test', decisions: {
        information_need: choice('registration_or_access'), confirmed_barrier: choice('none_stated'),
        attempted_action_target: choice('free_live_or_replay'), operational_issue: choice('free_content_access_failure'),
        paid_program_reference: choice('future_consideration_after_free_content'), observable_stage: choice('no_purchase_signal'),
      }, consistency_flags: ['paid_reference_without_stage'] as const, uncertainty_flags: [] };
      snapshot.jev_v4_runs ||= [];
      snapshot.jev_v4_runs.push({ id: `v4-${snapshot.jev_v4_runs.length + 1}`, v1_run_id: body.v1_run_id,
        case_id: initialCase.id, calibration_review_id: snapshot.reviews[0].id, input_version: 1,
        status: 'completed', result: { ...result, consistency_flags: [...result.consistency_flags] }, created_at: timestamp, updated_at: timestamp });
      await route.fulfill({ json: { ok: true, result } }); return;
    }
    if (pathname === '/api/conversion/adjudication') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const note = { id: `adjudication-${snapshot.adjudications!.length + 1}`, ...body, actor_id: 'synthetic-operator', created_at: timestamp };
      snapshot.adjudications!.push(note);
      await route.fulfill({ json: { ok: true, note } }); return;
    }
    if (route.request().method() === 'GET') { await route.fulfill({ json: snapshot }); return; }
    const body = route.request().postDataJSON();
    mutations.push(body);
    if (body.action === 'save_case') {
      const item: ConversionCase = { ...initialCase, id: '55555555-5555-4555-8555-555555555555',
        subject: body.subject, content: body.content, source_label: body.source_label,
        received_at: body.received_at, course_id: body.course_id, cohort_id: body.cohort_id,
        sample_origin: body.sample_origin, legacy_course_label: body.legacy_course_label };
      snapshot.cases.push(item);
      await route.fulfill({ json: { ok: true, case: item } }); return;
    }
    if (body.action === 'analyze') {
      const item = snapshot.cases.find(row => row.id === body.case_id)!;
      const mock = createMockJudgment(item, snapshot.evidence);
      const result = provider === 'jev' ? { ...mock, mode: 'jev' as const, model: 'jev-test', decision_version: 1 as const, decisions: {
        purchase_intent: { type: 'choice' as const, choice: 'medium', confidence: .97, probabilities: { high: .03, medium: .97, low: 0, unclear: 0 } },
        primary_barrier: { type: 'choice' as const, choice: 'skill_level', confidence: .82, probabilities: { price: 0, schedule: .1, skill_level: .85, content_fit: .05, trust: 0, none_or_unknown: 0 } },
        purchase_readiness: { type: 'score' as const, score: 2.8, confidence: .88, probabilities: { 0: 0, 1: .05, 2: .2, 3: .7, 4: .05 } },
        next_action: { type: 'choice' as const, choice: 'answer_specific_questions', confidence: .99, probabilities: { answer_specific_questions: .99, invite_webinar: .01, offer_purchase_info: 0, human_consult: 0, hold_no_contact: 0 } },
      } } : mock;
      const run: ConversionRun = { id: `run-${snapshot.runs.length + 1}`, case_id: item.id, input_version: item.input_version,
        provider, result, evidence_versions: evidenceVersions(item, snapshot.evidence), created_at: timestamp };
      snapshot.runs.push(run);
      await route.fulfill({ json: { ok: true, run } }); return;
    }
    if (body.action === 'review') {
      const review = { id: `review-${snapshot.reviews.length + 1}`, case_id: body.case_id, run_id: body.run_id,
        decision: body.decision, reply_text: body.reply_text, reason: body.reason, calibration: body.calibration, calibration_sample_kind: body.calibration_sample_kind,
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

test('Jev shadow result shows decisions and confidence without triggering another API', async ({ page }) => {
  const state = await fixture(page, 'jev');
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true }).click();
  await page.getByLabel('교정 표본 용도').selectOption('operational');
  await expect(page.getByText('Jev 그림자 판정 · 운영자 확인 필요', { exact: true })).toBeVisible();
  await expect(page.getByText('운영자 독립 판정을 먼저 저장해 주세요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Jev 전환 판정')).toHaveCount(0);
  await expect(page.getByText(MOCK_NOTICE, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^검토할 설명/)).toHaveCount(0);
  await expect(page.getByText('추가 확인 필요: 이용 방법', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '검토 기록 저장', exact: true })).toHaveCount(0);
  expect(state.unexpectedApi).toEqual([]);
  expect(state.mutations.map(item => item.action)).toEqual(['analyze']);
});

test('first Jev review stores blind operator labels then reveals comparison and aggregate rates', async ({ page }) => {
  const state = await fixture(page, 'jev');
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true }).click();
  await page.getByLabel('교정 표본 용도').selectOption('operational');
  await page.getByLabel('사람 판단 · 구매 의도').selectOption('medium');
  await page.getByLabel('사람 판단 · 주요 장애물').selectOption('price');
  await page.getByLabel('사람 판단 · 구매 준비도').selectOption('3');
  await page.getByLabel('사람 판단 · 다음 행동').selectOption('answer_specific_questions');
  await page.getByRole('button', { name: '독립 판정 저장', exact: true }).click();
  const result = page.getByLabel('Jev 전환 판정');
  await expect(result).toContainText('구매 의도중간신뢰도 97%');
  await expect(result).toContainText('주요 장애물수강 수준신뢰도 82%');
  await expect(page.getByLabel('사람과 Jev 비교')).toContainText('구매 의도사람 중간Jev 중간일치');
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toContainText('실제 문의 표본1건');
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toContainText('검수용 표본0건');
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toContainText('기준 검토용 최소 표본까지 19건 남음');
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toContainText('의도 선택 일치100%');
  await expect(page.getByLabel(/^검토할 설명/)).toHaveValue('초보자를 대상으로 기초 개념부터 설명합니다.');
  await expect(page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true })).toBeEnabled();
  await expect(page.getByText(MOCK_NOTICE, { exact: true })).toBeVisible();
  expect(state.mutations[1]).toMatchObject({ action: 'review', decision: 'hold', reply_text: '', calibration_sample_kind: 'operational', calibration: { purchase_intent: 'medium', primary_barrier: 'price', purchase_readiness: 3, next_action: 'answer_specific_questions' } });
  expect(state.unexpectedApi).toEqual([]);
});

test('disagreement review records a separate reason while preserving the first labels', async ({ page }) => {
  const state = await fixture(page, 'jev');
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true }).click();
  await page.getByLabel('교정 표본 용도').selectOption('operational');
  await page.getByLabel('사람 판단 · 구매 의도').selectOption('medium');
  await page.getByLabel('사람 판단 · 주요 장애물').selectOption('price');
  await page.getByLabel('사람 판단 · 구매 준비도').selectOption('3');
  await page.getByLabel('사람 판단 · 다음 행동').selectOption('answer_specific_questions');
  await page.getByRole('button', { name: '독립 판정 저장', exact: true }).click();
  await page.getByRole('button', { name: '판정 차이 재검토', exact: true }).click();
  const audit = page.getByRole('region', { name: '판정 차이 재검토' });
  await expect(audit).toContainText('실제 문의 1건 · 의견 차이 1항목');
  await expect(audit.getByLabel('항목별 첫 의견 비교')).toContainText('사람 가격Jev 수강 수준 · 표시 신뢰도 82%의견 차이');
  await expect(audit.getByLabel('항목별 첫 의견 비교')).toContainText('사람 3/4Jev 2.8/4 (비교 범주 3) · 표시 신뢰도 88%같은 선택');
  await audit.getByRole('combobox', { name: '재검토 결론' }).selectOption('both_plausible');
  await audit.getByRole('combobox', { name: '판단의 근거 유형' }).selectOption('category_gap');
  await audit.getByRole('textbox', { name: '근거와 남은 불확실성' }).fill('문의에는 초보 수준과 녹화 여부가 함께 있어 구매 장애물을 하나로 단정하기 어렵습니다.');
  await audit.getByRole('button', { name: '재검토 의견 저장' }).click();
  await expect(audit).toContainText('재검토 의견이 있는 차이 1항목');
  await expect(audit).toContainText('두 해석 모두 가능');
  expect(state.snapshot.reviews).toHaveLength(1);
  expect(state.snapshot.adjudications).toHaveLength(1);
  expect(state.unexpectedApi).toEqual([]);
});

test('v2 experiment runs once and keeps the original human and v1 choices visible', async ({ page }) => {
  const state = await fixture(page, 'jev');
  state.snapshot.capabilities.can_jev_v2 = true;
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true }).click();
  await page.getByLabel('교정 표본 용도').selectOption('operational');
  await page.getByLabel('사람 판단 · 구매 의도').selectOption('medium');
  await page.getByLabel('사람 판단 · 주요 장애물').selectOption('price');
  await page.getByLabel('사람 판단 · 구매 준비도').selectOption('3');
  await page.getByLabel('사람 판단 · 다음 행동').selectOption('answer_specific_questions');
  await page.getByRole('button', { name: '독립 판정 저장', exact: true }).click();
  await page.getByRole('button', { name: '판정 차이 재검토', exact: true }).click();
  const audit = page.getByRole('region', { name: '판정 차이 재검토' });
  await audit.getByRole('button', { name: '남은 1건 v2 실행' }).click();
  await expect(audit).toContainText('필요 역량 질문');
  await expect(audit).toContainText('직접 밝힌 내용 없음');
  await expect(audit).toContainText('사람 가격Jev 수강 수준');
  await expect(audit.getByRole('button', { name: 'v2 실행 완료' })).toBeDisabled();
  expect(state.snapshot.reviews).toHaveLength(1);
  expect(state.snapshot.runs).toHaveLength(1);
  expect(state.mutations.filter(item => item.v1_run_id)).toHaveLength(1);
});

test('v3 shows a free-versus-paid contradiction for operator review without changing earlier labels', async ({ page }) => {
  const state = await fixture(page, 'jev');
  state.snapshot.capabilities.can_jev_v3 = true;
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true }).click();
  await page.getByLabel('교정 표본 용도').selectOption('operational');
  await page.getByLabel('사람 판단 · 구매 의도').selectOption('medium');
  await page.getByLabel('사람 판단 · 주요 장애물').selectOption('price');
  await page.getByLabel('사람 판단 · 구매 준비도').selectOption('3');
  await page.getByLabel('사람 판단 · 다음 행동').selectOption('answer_specific_questions');
  await page.getByRole('button', { name: '독립 판정 저장', exact: true }).click();
  await page.getByRole('button', { name: '판정 차이 재검토', exact: true }).click();
  const audit = page.getByRole('region', { name: '판정 차이 재검토' });
  await audit.getByRole('button', { name: '선택한 문의 v3 실행' }).click();
  await expect(audit).toContainText('무료 방송·다시보기 접근 시도');
  await expect(audit).toContainText('판정 간 충돌:');
  await expect(audit.getByRole('button', { name: 'v3 저장 완료' })).toBeDisabled();
  await expect(audit).toContainText('사람 가격Jev 수강 수준');
  expect(state.snapshot.reviews).toHaveLength(1);
  expect(state.snapshot.runs).toHaveLength(1);
  expect(state.snapshot.jev_v3_runs).toHaveLength(1);
});

test('v4 makes future paid consideration visible and flags an inconsistent stage without changing the first review', async ({ page }) => {
  const state = await fixture(page, 'jev');
  state.snapshot.capabilities.can_jev_v4 = true;
  await page.getByRole('button', { name: /외부 문의 초보 수강과 녹화 문의/ }).click();
  await page.getByRole('button', { name: 'Jev 그림자 판정 실행', exact: true }).click();
  await page.getByLabel('교정 표본 용도').selectOption('operational');
  await page.getByLabel('사람 판단 · 구매 의도').selectOption('medium');
  await page.getByLabel('사람 판단 · 주요 장애물').selectOption('price');
  await page.getByLabel('사람 판단 · 구매 준비도').selectOption('3');
  await page.getByLabel('사람 판단 · 다음 행동').selectOption('answer_specific_questions');
  await page.getByRole('button', { name: '독립 판정 저장', exact: true }).click();
  await page.getByRole('button', { name: '판정 차이 재검토', exact: true }).click();
  const audit = page.getByRole('region', { name: '판정 차이 재검토' });
  await audit.getByRole('button', { name: '선택한 문의 v4 실행' }).click();
  await expect(audit).toContainText('무료 교육을 본 뒤 유료 교육 검토 명시');
  await expect(audit).toContainText('유료 교육 언급이 있으나 행동 단계는 구매 신호 없음');
  await expect(audit.getByRole('button', { name: 'v4 저장 완료' })).toBeDisabled();
  expect(state.snapshot.reviews).toHaveLength(1);
  expect(state.snapshot.runs).toHaveLength(1);
  expect(state.snapshot.jev_v4_runs).toHaveLength(1);
});

test('historical Jev inquiries can be independently labeled in one blind batch', async ({ page }) => {
  const state = await fixture(page, 'jev');
  for (let index = 1; index <= 2; index++) {
    const item: ConversionCase = { ...initialCase, id: `legacy-${index}`, sample_origin: 'external_legacy',
      legacy_course_label: '과거 교육', course_id: null, cohort_id: null,
      subject: `과거 교육 상담 ${index}`, content: `${index}번 실제 고객의 합성 구매 전 질문입니다.`,
      received_at: `2026-08-0${index}T01:00:00.000Z` };
    state.snapshot.cases.push(item);
    const mock = createMockJudgment(item, []);
    state.snapshot.runs.push({ id: `legacy-run-${index}`, case_id: item.id, input_version: 1, provider: 'jev',
      result: { ...mock, mode: 'jev', model: 'jev-test', decision_version: 1, decisions: {
        purchase_intent: { type: 'choice', choice: 'medium', confidence: .9, probabilities: {} },
        primary_barrier: { type: 'choice', choice: 'price', confidence: .9, probabilities: {} },
        purchase_readiness: { type: 'score', score: 3, confidence: .9, probabilities: {} },
        next_action: { type: 'choice', choice: 'human_consult', confidence: .9, probabilities: {} },
      } }, evidence_versions: {}, created_at: `2026-08-0${index}T02:00:00.000Z` });
  }
  state.snapshot.cases.push({ ...initialCase, id: 'dev-test', sample_origin: 'external_legacy',
    subject: '[DEV 검증] 합성 사례', legacy_course_label: '과거 교육', course_id: null, cohort_id: null });
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await page.getByRole('button', { name: '과거 상담 한 번에 판정', exact: true }).click();
  const batch = page.getByRole('region', { name: '과거 상담 일괄 독립 판정' });
  await expect(batch).toContainText('판정 대기 2건');
  await expect(batch).not.toContainText('[DEV 검증]');
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toHaveCount(0);
  await expect(page.getByLabel('Jev 전환 판정')).toHaveCount(0);
  await expect(page.getByText('Jev 판단·제안 답변·일치율은 이 화면에 표시하지 않습니다.')).toBeVisible();
  for (let index = 1; index <= 2; index++) {
    await batch.getByRole('combobox', { name: `${index}번 · 구매 의도` }).selectOption('high');
    await batch.getByRole('combobox', { name: `${index}번 · 주요 장애물` }).selectOption('schedule');
    await batch.getByRole('combobox', { name: `${index}번 · 구매 준비도` }).selectOption('2');
    await batch.getByRole('combobox', { name: `${index}번 · 다음 행동` }).selectOption('answer_specific_questions');
  }
  await batch.getByRole('checkbox', { name: /실제 고객의 구매 전 상담/ }).check();
  await batch.getByRole('button', { name: '입력 완료 2건 한 번에 저장' }).click();
  await expect(batch).toContainText('일괄 판정할 상담이 없습니다.');
  await expect(page.getByText('과거 상담 2건의 독립 판정을 저장했습니다. 고객에게 메시지를 보내지 않았습니다.')).toBeVisible();
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toHaveCount(0);
  expect(state.mutations.map(item => item.action)).toEqual(['review', 'review']);
  for (const mutation of state.mutations) expect(mutation).toMatchObject({
    decision: 'hold', reply_text: '', calibration_sample_kind: 'operational',
    calibration: { purchase_intent: 'high', primary_barrier: 'schedule', purchase_readiness: 2, next_action: 'answer_specific_questions' },
  });
  expect(state.unexpectedApi).toEqual([]);
  await batch.getByRole('button', { name: '개별 검토로 돌아가기' }).click();
  await expect(page.getByLabel('사람과 Jev 선택 비교')).toContainText('실제 문의 표본2건');
});

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
  await drawer.getByLabel(/^표본 출처/).selectOption('current');
  await drawer.getByLabel(/^문의 제목/).fill('수강 일정 확인');
  await drawer.getByLabel(/^문의 발췌/).fill('수업은 언제 진행되나요?');
  await drawer.getByLabel(/^출처 설명/).fill('합성 외부 문의');
  await drawer.getByLabel(/^문의 접수 시각/).fill('2026-09-20T10:00');
  await drawer.getByLabel(/^대상 상품/).selectOption(courseId);
  await expect(drawer.getByRole('button', { name: '문의 저장', exact: true })).toBeDisabled();
  await drawer.getByRole('checkbox', { name: '고객 식별정보를 제거한 발췌임을 확인했습니다.' }).check();
  await drawer.getByRole('button', { name: '문의 저장', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '수강 일정 확인', exact: true })).toBeVisible();
  await expect(page.getByText('미연결 · 개인별 구매 관찰 불가', { exact: true })).toBeVisible();
  expect(state.mutations).toHaveLength(1);
  expect(state.mutations[0]).toMatchObject({ action: 'save_case', question_id: null, course_id: courseId, cohort_id: null, subject: '수강 일정 확인', deidentified_confirmed: true });
  expect(state.mutations[0]).not.toHaveProperty('customer_id');
  expect(state.mutations[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
});

test('historical education inquiry can be saved without linking a different current course', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: '문의 연결', exact: true }).click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '문의 연결', exact: true }) });
  await drawer.getByLabel(/^문의 출처/).selectOption('manual');
  await drawer.getByLabel(/^표본 출처/).selectOption('external_legacy');
  await drawer.getByLabel(/^당시 유료 교육 상품명/).fill('과거 온라인 마케팅 교육');
  await drawer.getByLabel(/^문의 제목/).fill('교육 신청 방식');
  await drawer.getByLabel(/^문의 발췌/).fill('교육 신청 전에 수강 조건을 확인하고 싶습니다.');
  await drawer.getByLabel(/^출처 설명/).fill('카카오 채널 1:1 · 과거 상담');
  await drawer.getByLabel(/^문의 접수 시각/).fill('2024-04-17T10:00');
  await expect(drawer.getByLabel(/^대상 상품/)).toHaveValue('');
  await drawer.getByRole('checkbox', { name: '고객 식별정보를 제거한 발췌임을 확인했습니다.' }).check();
  await drawer.getByRole('button', { name: '문의 저장', exact: true }).click();
  await expect(page.getByText('과거 유료 교육 상담 · 이번 모집 성과에서 제외')).toBeVisible();
  expect(state.mutations[0]).toMatchObject({ action: 'save_case', sample_origin: 'external_legacy',
    legacy_course_label: '과거 온라인 마케팅 교육', course_id: null, cohort_id: null });
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

test('room settings save separately from product mapping and changing recruitment cannot overwrite prior rooms', async ({page}) => {
  const state=await fixture(page); state.snapshot.capabilities.can_manage_funnel=true;
  await page.route('**/api/conversion/funnel', route=>route.fulfill({json:{draft:null,measurement:'unverified'}}));
  await page.route('**/api/conversion/links**',route=>route.fulfill({json:{link:null,counts:{paid:0,organic:0}}}));
  const records: Record<string, Record<string, unknown>>={};
  let writes=0;
  await page.route('**/api/conversion/rooms**', async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:{draft:records[new URL(route.request().url()).searchParams.get('period')!]??null}});
    const body=route.request().postDataJSON(); expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/); expect(body.expected_version).toBe(0);
    records[body.period]={period_id:body.period,version:1,settings:body.settings};writes++;
    return route.fulfill({json:{draft:records[body.period]}});
  });
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await page.getByRole('button',{name:'모집 경로 준비',exact:true}).click();
  await page.getByRole('button',{name:'모집별 카톡방 관리',exact:true}).click();
  await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
  await page.getByLabel('모집 이름',{exact:true}).fill('Synthetic recruitment');
  await page.getByLabel('오가닉 오픈채팅방 주소',{exact:true}).fill('https://open.kakao.com/o/organicTest');
  await page.getByLabel('광고 오픈채팅방 주소',{exact:true}).fill('https://open.kakao.com.evil.test/o/paidTest');
  await page.getByRole('button',{name:'모집 방 설정 저장',exact:true}).click();
  await expect(page.getByText('https://open.kakao.com/o/... 형식의 방 주소를 입력해 주세요.',{exact:true})).toBeVisible();
  expect(writes).toBe(0);
  await page.getByLabel('광고 오픈채팅방 주소',{exact:true}).fill('https://open.kakao.com/o/paidTest');
  await page.getByRole('button',{name:'모집 방 설정 저장',exact:true}).click();
  await expect(page.getByText('방 설정 버전 1 · moonshot-4',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:/^모집 구분 코드/}).fill('next-month');
  await expect(page.getByRole('button',{name:'모집 방 설정 저장',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
  await expect(page.getByLabel('오가닉 오픈채팅방 주소',{exact:true})).toHaveValue('');
  await page.getByRole('textbox',{name:/^모집 구분 코드/}).fill('moonshot-4');
  await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
  await expect(page.getByLabel('광고 오픈채팅방 주소',{exact:true})).toHaveValue('https://open.kakao.com/o/paidTest');
  expect(writes).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});


test('recruitment links activate explicitly, show distinct channel URLs and stop without losing counts',async({page})=>{
 const state=await fixture(page);state.snapshot.capabilities.can_manage_funnel=true;
 await page.route('**/api/conversion/funnel',route=>route.fulfill({json:{draft:null}}));
 await page.route('**/api/conversion/rooms**',route=>route.fulfill({json:{draft:{version:1,settings:{label:'Synthetic',organicUrl:'https://open.kakao.com/o/organicTest',paidUrl:'https://open.kakao.com/o/paidTest',paidMode:'undecided'}}}}));
 const mutations: Record<string,unknown>[]=[];
 let link:{id:string;room_version:number;revision:number;enabled:boolean}|null=null;
 await page.route('**/api/conversion/links**',async route=>{
  if(route.request().method()==='POST') {const body=route.request().postDataJSON();mutations.push(body);expect(body.period).toBe('moonshot-4');expect(body.version).toBe(1);expect(body.expected).toBe(link?.revision??0);link={id:courseId,room_version:1,revision:(link?.revision??0)+1,enabled:body.enabled};}
  return route.fulfill({json:{link,counts:{paid:2,organic:1}}});
 });
 await page.getByRole('button',{name:'새로고침',exact:true}).click();
 await page.getByRole('button',{name:'모집 경로 준비',exact:true}).click();
 await page.getByRole('button',{name:'모집별 카톡방 관리',exact:true}).click();
 await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
 await expect(page.getByRole('button',{name:'저장된 방으로 링크 활성화',exact:true})).toBeEnabled();
 expect(mutations).toHaveLength(0);
 await page.getByRole('button',{name:'저장된 방으로 링크 활성화',exact:true}).click();
 await expect(page.getByLabel('광고용 모집 링크',{exact:true})).toHaveValue(new RegExp('/join/'+courseId+'/paid$'));
 await expect(page.getByLabel('오가닉용 모집 링크',{exact:true})).toHaveValue(new RegExp('/join/'+courseId+'/organic$'));
 await page.getByRole('button',{name:'모집 링크 중지',exact:true}).click();
 await expect(page.getByText('링크 상태: 중지 · 연결된 방 버전 1',{exact:true})).toBeVisible();
 await expect(page.getByText('전체 방 버전의 이동 버튼 클릭 기록 — 광고용 링크 2회 · 오가닉용 링크 1회',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'링크·클릭 기록 새로고침',exact:true}).click();
 await expect(page.getByRole('button',{name:'모집 링크 중지',exact:true})).toBeDisabled();
 expect(mutations.map(m=>m.enabled)).toEqual([true,false]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

test('integrated workspace separates inquiry review from recruitment and removes duplicate mapping draft', async ({ page }) => {
  await fixture(page);
  await page.goto('/admin/conversion?workspace=1');
  await expect(page.getByRole('heading', { name: '모집 운영', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '모집 경로 초안 저장', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '구매 전 문의 검토', exact: true }).click();
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).toBeVisible();
  await expect(page.getByText('초보 수강과 녹화 문의', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '모집 설정·구매·후속 안내', exact: true }).click();
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).not.toBeVisible();
});
