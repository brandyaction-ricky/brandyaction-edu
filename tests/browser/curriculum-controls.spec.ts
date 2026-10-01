import { test, expect, type Page } from '@playwright/test';
import type { Row } from '../../lib/platform';

type Change = { kind: 'week' | 'lesson'; id: string; expected: boolean; published: boolean };

async function setup(page: Page, options: { failOnce?: boolean; uncertain?: boolean } = {}) {
  const stamp = '2026-09-30T01:00:00Z';
  const weeks: Row[] = [
    { id: 'w0', course_id: 'course-one', week_number: 0, title: '온보딩', is_published: true, updated_at: stamp },
    { id: 'w1', course_id: 'course-one', week_number: 1, title: 'AI 업무 시작', is_published: true, updated_at: stamp },
    { id: 'w2', course_id: 'course-one', week_number: 2, title: '업무 자동화', is_published: false, updated_at: stamp },
    { id: 'archived', course_id: 'course-one', week_number: 1, title: '이전 시작 주차', archived_at: stamp, is_published: false, updated_at: stamp },
  ];
  const lessons: Row[] = [
    { id: 'a', week_id: 'w0', day_number: 1, title: '학습 준비', is_published: true, content_type: 'text', updated_at: stamp },
    { id: 'b', week_id: 'w1', day_number: 2, title: '나의 첫 프롬프트', is_published: true, is_preview: true, content_type: 'text', updated_at: stamp },
    { id: 'c', week_id: 'w1', day_number: 3, title: '내 업무 정리', is_published: true, content_type: 'text', updated_at: stamp },
    { id: 'empty', week_id: 'w2', day_number: 4, title: '아직 작성 전', is_published: false, content_type: 'text', updated_at: stamp },
  ];
  const contents = lessons.filter(row => row.id !== 'empty').map(row => ({ id: `body-${row.id}`, lesson_id: row.id, body_text: '검수용 학습 본문' }));
  const cohorts: Row[] = [
    { id: 'fourth', course_id: 'course-one', name: '4기', cohort_code: 'FOURTH' },
    { id: 'fifth', course_id: 'course-one', name: '5기', cohort_code: 'FIFTH' },
  ];
  const weekVisibility: Row[] = [
    { id: 'fourth:w0', cohort_id: 'fourth', week_id: 'w0', is_published: true },
    { id: 'fourth:w1', cohort_id: 'fourth', week_id: 'w1', is_published: false },
    { id: 'fifth:w0', cohort_id: 'fifth', week_id: 'w0', is_published: false },
    { id: 'fifth:w1', cohort_id: 'fifth', week_id: 'w1', is_published: false },
  ];
  const lessonVisibility: Row[] = [
    { id: 'fourth:a', cohort_id: 'fourth', lesson_id: 'a', is_published: true },
    ...['b', 'c'].map(id => ({ id: `fourth:${id}`, cohort_id: 'fourth', lesson_id: id, is_published: false })),
    ...['a', 'b', 'c'].map(id => ({ id: `fifth:${id}`, cohort_id: 'fifth', lesson_id: id, is_published: false })),
  ];
  const writes: Record<string, unknown>[] = [];
  const cohortWrites: { cohortId: string; changes: Change[] }[] = [];
  let failed = false, readFailure = false;
  await page.route('**/api/platform?**', route => readFailure
    ? route.fulfill({ status: 503, json: { error: '조회 일시 중단' } })
    : route.fulfill({ json: { data: { cohorts, curriculum_weeks: weeks, curriculum_lessons: lessons, lesson_contents: contents,
      edu_cohort_week_visibility: weekVisibility, edu_cohort_lesson_visibility: lessonVisibility } } }));
  await page.route('**/api/platform/cohort-visibility', route => {
    const body = route.request().postDataJSON() as { cohortId: string; changes: Change[] };
    cohortWrites.push(body);
    if (options.failOnce && !failed) {
      failed = true;
      readFailure = Boolean(options.uncertain);
      return route.fulfill({ status: 409, json: { error: '합성 저장 실패' } });
    }
    if (body.changes.some(change => {
      const rows = change.kind === 'week' ? weekVisibility : lessonVisibility;
      const key = change.kind === 'week' ? 'week_id' : 'lesson_id';
      return Boolean(rows.find(row => row.cohort_id === body.cohortId && row[key] === change.id)?.is_published) !== change.expected;
    })) return route.fulfill({ status: 409, json: { error: '이미 변경된 공개 범위입니다.' } });
    for (const change of body.changes) {
      const rows = change.kind === 'week' ? weekVisibility : lessonVisibility;
      const key = change.kind === 'week' ? 'week_id' : 'lesson_id';
      const row = rows.find(row => row.cohort_id === body.cohortId && row[key] === change.id);
      if (row) row.is_published = change.published;
      else rows.push({ id: `${body.cohortId}:${change.id}`, cohort_id: body.cohortId, [key]: change.id, is_published: change.published });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/studio-save', route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (body.action === 'reorder-weeks') body.ids.forEach((id: string, index: number) => { weeks.find(week => week.id === id)!.week_number = index; });
    else if (body.action === 'set-curriculum-archive') { const row = weeks.find(week => week.id === body.id)!; row.archived_at = null; row.week_number = 3; row.is_published = false; }
    else { const row = (body.section === 'weeks' ? weeks : lessons).find(item => item.id === body.id)!; Object.assign(row, body.values, { updated_at: '2026-09-30T02:00:00Z' }); }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/curriculum-editor-test');
  await page.getByRole('button', { name: 'AI 문샷 챌린지 커리큘럼 열기' }).click();
  await expect(page.getByRole('button', { name: '기수별 공개 범위', exact: true })).toBeEnabled();
  return { writes, cohortWrites, weeks, lessons, weekVisibility, lessonVisibility, restoreReads: () => { readFailure = false; } };
}

async function visibility(page: Page) {
  await page.getByRole('button', { name: '기수별 공개 범위', exact: true }).click();
  return page.getByRole('dialog', { name: '수업 공개 범위' });
}

test('4기 공개 미리보기와 저장이 5기, 본문, 무료 미리보기 설정을 바꾸지 않는다', async ({ page }, info) => {
  const h = await setup(page), dialog = await visibility(page);
  await expect(dialog.getByRole('combobox', { name: '공개 범위를 설정할 기수' })).toHaveValue('fourth');
  await expect(dialog.getByRole('checkbox', { name: /아직 작성 전/ })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: '1주차 · AI 업무 시작', exact: true }).check();
  await dialog.getByRole('checkbox', { name: /나의 첫 프롬프트/ }).check();
  await dialog.getByRole('button', { name: '변경 내용 확인' }).click();
  await expect(dialog.getByRole('region', { name: '공개 변경 확인' })).toContainText('나의 첫 프롬프트 · 무료 미리보기 설정 있음');
  expect(h.writes).toHaveLength(0); expect(h.cohortWrites).toHaveLength(0);
  await expect(dialog.getByText('새로 공개 1개 · 비공개 전환 0개')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`visibility-${info.project.name}.png`), fullPage: true });
  await dialog.getByRole('button', { name: '확인한 공개 범위 적용' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: '공개 범위를 저장' })).toBeVisible();
  expect(h.cohortWrites).toEqual([{ cohortId: 'fourth', changes: [
    { kind: 'lesson', id: 'b', expected: false, published: true },
    { kind: 'week', id: 'w1', expected: false, published: true },
  ] }]);
  expect(h.weekVisibility.find(row => row.cohort_id === 'fifth' && row.week_id === 'w1')?.is_published).toBe(false);
  expect(h.lessons[1].is_preview).toBe(true); expect(h.weeks[2].is_published).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('원자적 저장이 실패하면 기수 공개 상태는 일부만 바뀌지 않고 재시도할 수 있다', async ({ page }) => {
  const h = await setup(page, { failOnce: true }), dialog = await visibility(page);
  await dialog.getByRole('checkbox', { name: '1주차 · AI 업무 시작', exact: true }).check();
  await dialog.getByRole('checkbox', { name: /나의 첫 프롬프트/ }).check();
  await dialog.getByRole('button', { name: '변경 내용 확인' }).click();
  await dialog.getByRole('button', { name: '확인한 공개 범위 적용' }).click();
  await expect(dialog.getByRole('alert')).toContainText('합성 저장 실패');
  expect(h.weekVisibility.find(row => row.cohort_id === 'fourth' && row.week_id === 'w1')?.is_published).toBe(false);
  expect(h.lessonVisibility.find(row => row.cohort_id === 'fourth' && row.lesson_id === 'b')?.is_published).toBe(false);
  await dialog.getByRole('button', { name: '변경 내용 확인' }).click();
  await dialog.getByRole('button', { name: '확인한 공개 범위 적용' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: '공개 범위를 저장' })).toBeVisible();
  expect(h.cohortWrites).toHaveLength(2);
});

test('저장 결과를 확인할 수 없으면 새 조회 전 재저장을 막는다', async ({ page }) => {
  const h = await setup(page, { failOnce: true, uncertain: true }), dialog = await visibility(page);
  await dialog.getByRole('checkbox', { name: '1주차 · AI 업무 시작', exact: true }).check();
  await dialog.getByRole('button', { name: '변경 내용 확인' }).click();
  await dialog.getByRole('button', { name: '확인한 공개 범위 적용' }).click();
  await expect(dialog.getByRole('alert')).toContainText('저장 상태를 확인하지 못했습니다');
  h.restoreReads();
  await dialog.getByRole('button', { name: '저장 상태 다시 확인' }).click();
  await expect(dialog.getByRole('button', { name: '변경 내용 확인' })).toBeEnabled();
  expect(h.cohortWrites).toHaveLength(1);
});

test('동료가 커리큘럼을 바꾸면 오래된 공개 변경을 저장하지 않는다', async ({ page }) => {
  const h = await setup(page), dialog = await visibility(page);
  await dialog.getByRole('checkbox', { name: '1주차 · AI 업무 시작', exact: true }).check();
  await dialog.getByRole('button', { name: '변경 내용 확인' }).click();
  h.lessons.push({ id: 'new', week_id: 'w1', day_number: 5, title: '동료가 추가한 수업', is_published: true, has_blocks: true });
  await dialog.getByRole('button', { name: '확인한 공개 범위 적용' }).click();
  await expect(dialog.getByRole('alert')).toContainText('다른 곳에서 커리큘럼이 변경');
  expect(h.cohortWrites).toHaveLength(0);
  await expect(dialog.getByRole('checkbox', { name: /동료가 추가한 수업/ })).toBeVisible();
});

test('주차 순서 변경과 삭제 주차 복구는 기존 확인 절차를 유지한다', async ({ page }) => {
  const h = await setup(page);
  await page.getByRole('region', { name: '2주차 업무 자동화', exact: true }).locator('summary').first().click();
  await page.getByRole('button', { name: '업무 자동화 주차 위로', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '주차 순서를 바꿀까요?' });
  await expect(dialog).toContainText('0주차 온보딩'); expect(h.writes).toHaveLength(0);
  await dialog.getByRole('button', { name: '이 순서로 저장' }).click(); await expect(dialog).toBeHidden();
  expect(h.writes[0]).toMatchObject({ action: 'reorder-weeks', ids: ['w0', 'w2', 'w1'] });
  await page.getByRole('button', { name: '삭제한 항목 복구', exact: true }).click();
  await expect(page.getByRole('button', { name: '주차 복구', exact: true })).toBeVisible();
  page.once('dialog', event => { expect(event.message()).toContain('이미 사용 중'); return event.dismiss(); });
  await page.getByRole('button', { name: '주차 복구', exact: true }).click(); expect(h.writes).toHaveLength(1);
  page.once('dialog', event => event.accept());
  await page.getByRole('button', { name: '주차 복구', exact: true }).click();
  await expect.poll(() => h.writes.length).toBe(2);
  expect(h.writes[1]).toMatchObject({ action: 'set-curriculum-archive', reassignOnConflict: true, archived: false });
});

test('공개 범위 확인창을 닫으면 기수 설정이 저장되지 않는다', async ({ page }) => {
  const h = await setup(page), dialog = await visibility(page);
  await dialog.getByRole('checkbox', { name: '0주차 · 온보딩', exact: true }).uncheck();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  expect(h.cohortWrites).toHaveLength(0);
  expect(h.weekVisibility.find(row => row.cohort_id === 'fourth' && row.week_id === 'w0')?.is_published).toBe(true);
});
