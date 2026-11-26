import { expect, test } from '@playwright/test';

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const access = id(12), cohort = id(2), course = id(1);
const title = '문샷 챌린지 외부 비즈니스 협력자 검수 과정 · 연결된 캠퍼스 기수';

test('admin grants and revokes access from the same member panel', async ({ page }, info) => {
  const actions: Record<string, string>[] = [];
  let revoked = false;
  await page.route('**/api/admin/partner-access**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      actions.push(body);
      revoked = body.action === 'revoke';
      await route.fulfill({ json: { ok: true, access } });
      return;
    }
    await route.fulfill({ json: {
      cohorts: [{ id: cohort, name: '연결된 캠퍼스 기수', course_id: course, courses: { title: '문샷 챌린지 외부 비즈니스 협력자 검수 과정' } }],
      grants: actions.length ? [{ id: access, access_ends_at: '2099-12-28T15:00:00Z', revoked_at: revoked ? '2026-11-26T04:00:00Z' : null,
        courses: { title: '문샷 챌린지 외부 비즈니스 협력자 검수 과정' }, cohorts: { name: '연결된 캠퍼스 기수' } }] : [],
    } });
  });
  await page.goto('/partner-access-admin-test');
  await page.getByText('외부 협력자 권한', { exact: true }).click();
  await page.getByLabel('과정·캠퍼스 기수').selectOption(cohort);
  await page.getByLabel('이용 종료일').fill('2099-12-28');
  await page.getByRole('button', { name: '권한 부여' }).click();
  await expect(page.getByRole('status')).toHaveText('협력자 권한을 부여했습니다.');
  await expect(page.getByLabel('협력자 접속 주소')).toHaveValue(new RegExp('/my/partner-access\\?access=' + access));
  expect(actions[0]).toMatchObject({ action: 'grant', member: id(99), course, cohort, endDate: '2099-12-28' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('partner-approval.png'), fullPage: true });
  await page.getByRole('button', { name: '권한 회수' }).click();
  expect(actions).toHaveLength(1);
  await page.getByRole('button', { name: '회수 확인' }).click();
  await expect(page.getByRole('status')).toHaveText('협력자 권한을 회수했습니다.');
  await expect(page.getByLabel('협력자 접속 주소')).toHaveCount(0);
  expect(actions[1]).toMatchObject({ action: 'revoke', member: id(99), access });
});

test('a partner opens the last published lesson and uses only the assigned campus link', async ({ page }, info) => {
  let revoked = false;
  const reads: string[] = [];
  await page.route('**/api/platform/curriculum-review?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('partner')).toBe('1');
    expect(route.request().method()).toBe('GET');
    if (revoked) {
      await route.fulfill({ status: 403, json: { error: '이용할 수 있는 협력자 권한을 확인해 주세요.' } });
    } else if (query.has('lesson')) {
      expect(query.get('access')).toBe(access);
      const lesson = query.get('lesson')!;
      reads.push(lesson);
      await route.fulfill({ json: { revision: null, document: null, body: lesson === id(6) ? '마지막 공개 수업 내용' : '첫 공개 수업 내용',
        video: '', external: '', resourceName: '학습 자료' } });
    } else {
      await route.fulfill({ json: { cohorts: [{ id: access, courseId: course, title }], cohortId: access, enrollmentId: null,
        studentStateError: false, lessons: [
          { id: id(5), title: '첫 공개 수업', description: '', week: 1, weekTitle: '시작', day: 1, completed: false, studentUnlocked: true },
          { id: id(6), title: '마지막 공개 수업', description: '', week: 6, weekTitle: '마무리', day: 30, completed: false, studentUnlocked: true },
        ] } });
    }
  });
  await page.goto('/partner-curriculum-test');
  await expect(page.getByText('첫 공개 수업 내용')).toBeVisible();
  const nav = page.getByRole('button', { name: '학습 목록', exact: true });
  if (await nav.isVisible()) await nav.click();
  await page.getByRole('button', { name: /DAY 30.*마지막 공개 수업/ }).click();
  await expect(page.getByText('마지막 공개 수업 내용')).toBeVisible();
  await expect(page.getByRole('link', { name: '캠퍼스 입장' })).toHaveAttribute('href', '/campus/workspace?enrollmentId=' + access + '&section=space');
  await expect(page.getByRole('link', { name: '학습 자료 내려받기' })).toHaveAttribute('href', new RegExp('partner=1&access=' + access + '&lesson=' + id(6)));
  await expect(page.getByRole('button', { name: '학습 완료하기' })).toHaveCount(0);
  expect(reads).toEqual([id(5), id(6)]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('partner-curriculum.png'), fullPage: true });

  revoked = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('이용할 수 있는 협력자 권한');
  await expect(page.getByRole('link', { name: '캠퍼스 입장' })).toHaveCount(0);
});
