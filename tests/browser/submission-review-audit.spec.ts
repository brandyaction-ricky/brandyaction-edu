import { expect, test } from '@playwright/test';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test.beforeEach(async ({ page }) => {
  // Per-page synthetic state prevents parallel desktop/mobile runs affecting each other.
  const records = new Map<string, Record<string, unknown>>();
  records.set(id(12), { id: 'legacy', decision: 'approved', feedback: '과거 승인 피드백', reviewer: '과거 검토자', reviewedAt: '2026-09-25T09:00:00Z', checks: null, mode: 'legacy' });
  await page.route('**/fixture-review-write', async route => {
    const body = route.request().postDataJSON(), conflict = body.scenario === 'conflict';
    for (const target of body.ids) records.set(target, { id: `audit-${target}`, decision: conflict ? 'approved' : body.decision, feedback: conflict ? '먼저 저장된 피드백' : body.feedback, reviewer: conflict ? '다른 검토자' : '현재 검토자', reviewedAt: '2026-09-26T09:00:00Z', checks: body.reviewChecks || null, mode: body.reviewMode });
    await route.fulfill({ status: conflict ? 409 : body.scenario === 'network' ? 503 : 200, json: conflict ? { error: '충돌', code: 'REVIEW_CONFLICT' } : body.scenario === 'network' ? { error: '저장 응답 유실', code: 'REVIEW_UNAVAILABLE' } : { ok: true } });
  });
  await page.route('**/api/admin/submission-review-history?**', route => {
    const target = new URL(route.request().url()).searchParams.get('submission')!, row = records.get(target);
    return route.fulfill({ json: { rows: row ? [row] : [], total: row ? 1 : 0, page: 1, pageSize: 20, current: { id: target, status: row?.decision || 'submitted', reviewed_at: row?.reviewedAt || null, reviewer_feedback: row?.feedback || null } } });
  });
  await page.goto('/review-audit-test');
});
test('review saves explicit checks and feedback, moves focus and distinguishes unchecked from missing history', async ({ page }) => {
  await page.getByRole('button', { name: '반려', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('보완·반려 사유를 작성해 주세요.');
  await page.getByRole('checkbox', { name: '필수 답변이 모두 작성됨', exact: true }).press('Space');
  await page.getByRole('textbox', { name: '멘토 피드백', exact: true }).fill('동시 저장 검증');
  await page.getByRole('button', { name: '승인 후 다음', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: '실행 미션 2', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '승인 완료 2', exact: true }).click();
  const history = page.getByRole('region', { name: '이 제출물의 검토 이력' });
  await expect(history).toContainText('필수 답변이 모두 작성됨 · 확인');
  await expect(history).toContainText('실행 결과와 증빙이 일치함 · 미확인');
  await page.getByRole('button', { name: /합성 검토 QA 회원 1차 기존 승인 미션/ }).click();
  await expect(history).toContainText('체크 결과 기록 없음');
  await expect(page.getByRole('button', { name: '승인 후 다음' })).toHaveCount(0);
});
for (const scenario of ['conflict', 'network']) test(`${scenario}: preserve draft across queue changes and reconcile without a second write`, async ({ page }) => {
  await page.getByLabel('합성 저장 상황').selectOption(scenario);
  await page.getByRole('textbox', { name: '멘토 피드백', exact: true }).fill('보존할 초안');
  await page.getByRole('checkbox', { name: '미션의 완료 기준을 충족함' }).check();
  await page.getByRole('button', { name: '승인 후 다음', exact: true }).click();
  await expect(page.getByRole('button', { name: '최신 결과 확인', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /합성 검토 QA 회원 1차 실행 미션 2/ }).click();
  await page.getByRole('button', { name: /합성 검토 QA 회원 1차 실행 미션 1/ }).click();
  await expect(page.getByRole('textbox', { name: '멘토 피드백', exact: true })).toHaveValue('보존할 초안');
  await expect(page.getByRole('button', { name: '승인 후 다음', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '최신 결과 확인', exact: true }).click();
  await expect(page.getByLabel('내 미저장 피드백')).toHaveValue('보존할 초안');
  await expect(page.getByRole('region', { name: '내 미저장 검토 내용' })).toContainText('미션의 완료 기준을 충족함 · 확인');
  await expect(page.getByText('합성 저장 요청 1회', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '승인 후 다음', exact: true })).toHaveCount(0);
});
test('bulk decisions are recorded without pretending individual checks were performed', async ({ page }) => {
  await page.getByText('여러 제출물 일괄 검토', { exact: true }).click();
  await page.getByRole('button', { name: '대기 중인 제출 선택 (최대 50건)' }).click();
  await page.getByRole('textbox', { name: '일괄 검토 피드백' }).fill('일괄 확인');
  await page.getByRole('button', { name: '선택 제출 승인', exact: true }).click();
  await expect(page.getByText('검토 결과와 피드백을 저장했습니다.', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '승인 완료 3', exact: true }).click();
  await expect(page.getByRole('region', { name: '이 제출물의 검토 이력' })).toContainText('일괄 처리 · 개별 체크 미기록');
});
test('history error is retryable and refresh returns keyboard focus to the records', async ({ page }) => {
  let fails = true;
  await page.route('**/api/admin/submission-review-history?**', async route => {
    if (fails) await route.fulfill({ status: 503, json: { error: '합성 조회 실패' } }); else await route.fallback();
  });
  await page.getByRole('button', { name: /합성 검토 QA 회원 1차 실행 미션 2/ }).click();
  await expect(page.getByRole('alert')).toContainText('합성 조회 실패');
  fails = false;
  await page.getByRole('button', { name: '검토 이력 다시 불러오기' }).press('Enter');
  await expect(page.getByRole('region', { name: '이 제출물의 검토 이력' })).toBeFocused();
});
test('unsaved link navigation asks before leaving and the review layout stays within the viewport', async ({ page }) => {
  await page.getByRole('textbox', { name: '멘토 피드백', exact: true }).fill('임시 입력');
  let warned = false;
  page.once('dialog', async dialog => { warned = dialog.type() === 'confirm'; await dialog.dismiss(); });
  await page.getByRole('link', { name: '다른 화면으로 이동' }).click();
  expect(warned).toBe(true); await expect(page).toHaveURL(/review-audit-test/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
