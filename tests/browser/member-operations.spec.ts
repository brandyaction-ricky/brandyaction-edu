import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/member-operations-test'); });

test('retained layout clears the old member drawer after a round trip, including query-only changes', async ({ page }) => {
  await page.goto('/retained-member-dialog-test');
  await page.getByRole('button', { name: '첫 회원 열기', exact: true }).click();
  await page.getByRole('tab', { name: '수강권', exact: true }).click();
  await page.getByRole('link', { name: '이 기수에서 회원 진행 찾기', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('/admin/members?cohort=');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '회원 목록으로 복귀', exact: true }).click();
  await page.getByRole('button', { name: '전체 목록 보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '다른 회원 열기', exact: true }).click();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('다른 QA 회원');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('member tabs retain profile edits, support keyboard activation and restore focus', async ({ page }) => {
  const opener = page.getByRole('button', { name: '회원 상세 열기', exact: true });
  await opener.click();
  await page.getByLabel('이름', { exact: true }).fill('보존할 이름');
  const profile = page.getByRole('tab', { name: '프로필', exact: true });
  const enrollment = page.getByRole('tab', { name: '수강권', exact: true });
  await profile.press('ArrowRight');
  await expect(enrollment).toBeFocused();
  await expect(profile).toHaveAttribute('aria-selected', 'true');
  await enrollment.press('Enter');
  await expect(page.getByText('수강 가능', { exact: true })).toBeVisible();
  await expect(page.getByText('시작 전', { exact: true })).toBeVisible();
  await expect(page.getByText('기간 만료', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '저장하기', exact: true })).toHaveCount(0);
  await enrollment.press('End');
  await expect(page.getByRole('tab', { name: '운영 이력', exact: true })).toBeFocused();
  await profile.click();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('보존할 이름');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('합성 저장 완료: 보존할 이름');
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('readonly records paginate without losing focus and preserve archived question deep links', async ({ page }) => {
  await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  await page.getByRole('tab', { name: '학습 기록', exact: true }).click();
  await expect(page.getByText('아직 저장된 기록이 없습니다.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '제출물', exact: true }).click();
  await page.getByRole('button', { name: '다음 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '첫 실행 미션 21', exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '제출물', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '다음 기록', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '질문', exact: true }).click();
  await page.getByRole('link', { name: '질문·답변 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/questions\?question=/);
  await expect(page.getByRole('heading', { name: '합성 보관 질문', exact: true })).toBeVisible();
  await expect(page.getByLabel('질문 처리 상태')).toHaveValue('selected');
  await page.getByRole('link', { name: '회원 운영 정보 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers\?member=/);
  await expect(page.getByText('전체 회원', { exact: true })).toHaveCount(0);
});

test('failed member reads offer an accessible retry, then recover with panel focus', async ({ page }) => {
  let fail = true;
  await page.route('**/api/admin/member-overview?**', async route => {
    if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '합성 조회 오류' }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  await page.getByRole('tab', { name: '수강권', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('합성 조회 오류');
  fail = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.getByText('수강 가능', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '수강권', exact: true })).toBeFocused();
});

test('responsive drawer contains tabs and content within the viewport', async ({ page }) => {
  await page.getByRole('button', { name: '기록 없는 회원', exact: true }).click();
  await page.getByRole('tab', { name: '수강권', exact: true }).click();
  await expect(page.getByText('등록된 수강권이 없습니다.', { exact: true })).toBeVisible();
  const bounds = await page.locator('dialog').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('enrollment links retain cohort/member context and distinguish follow-up from pending review', async ({ page }) => {
  await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  await page.getByRole('tab', { name: '수강권', exact: true }).click();
  await page.getByRole('link', { name: '이 기수에서 회원 진행 찾기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/members\?cohort=.+&search=/);
  await expect(page.getByLabel('회원 검색')).toHaveValue('operations-fixture@example.test');
  await expect(page.getByText('보완·재제출 확인 1개 학습', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /선택 주차 검토 대기/ })).toHaveCount(0);
  await page.getByRole('link', { name: '회원 운영 정보', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers\?member=/);
});
