import { test, expect } from '@playwright/test';
import { withExistingCohortVisibility } from './fixture/cohort-visibility';

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
for (const sample of [
  { name: 'published day 27 with earlier lessons filtered out', week: 6, stored: 2, cumulative: 27, gateDay: null, ongoing: false, expected: '27일차', outline: 'DAY 27' },
  { name: 'preparation week keeps its own day two', week: 0, stored: 2, cumulative: 2, gateDay: null, ongoing: false, expected: '2일차', outline: 'DAY 2' },
  { name: 'separate learning uses the same track day as the outline', week: 6, stored: 2, cumulative: 57, gateDay: 27, ongoing: false, expected: '27일차', outline: 'DAY 27' },
  { name: 'ongoing challenge has no numbered day', week: 7, stored: 1, cumulative: 31, gateDay: null, ongoing: true, expected: '지속 챌린지', outline: '지속 챌린지' },
]) {
  test(`question panel matches outline: ${sample.name}`, async ({ page }, info) => {
    await page.route('**/api/platform?**', route => route.fulfill({ json: { user: { id: id(99), role: 'student' }, support: {}, data: withExistingCohortVisibility({
      enrollments: [{ id: id(1), course_id: id(2), cohort_id: id(3), status: 'active' }],
      courses: [{ id: id(2), title: '질문 일차 검수 과정' }], cohorts: [{ id: id(3), name: 'QA 기수' }],
      curriculum_weeks: [{ id: id(5), course_id: id(2), week_number: sample.week, title: '검수 주차', is_published: true }],
      curriculum_lessons: [{ id: id(4), week_id: id(5), day_number: sample.stored, curriculum_day_number: sample.cumulative, title: '목차와 같은 수업', is_published: true }],
      lesson_progress: [],
    }) } }));
    let gateReads = 0;
    await page.route('**/api/platform/lesson-blocks?**', route => {
      if (new URL(route.request().url()).searchParams.get('action') === 'progression') {
        gateReads++;
        return route.fulfill({ json: { lessons: [{ lessonId: id(4), isUnlocked: true, automaticApproval: false, track: sample.gateDay ? 'learning' : null, dayNumber: sample.gateDay, ongoing: sample.ongoing, reason: '' }] } });
      }
      return route.fulfill({ json: { document: { schemaVersion: 1, blocks: [{ id: 'text', type: 'text', content: '질문 표시 검수용 본문' }], checklist: [], completion: { mode: 'self', requireAnswers: false, requireQuizPass: false } }, revision: id(10), currentRevision: id(10), draft: null, submission: null, previousDrafts: [], editable: true } });
    });
    await page.route('**/api/platform/lesson-questions?**', route => route.fulfill({ json: { questions: [], hasMore: false } }));
    await page.route('**/api/platform/question-hub**', route => route.fulfill({ json: { answers: [], contexts: [] } }));
    // Existing users may reopen a panel whose old, incorrect label is in session storage.
    await page.addInitScript(({ member, enrollment, lesson }) => sessionStorage.setItem('edu-floating-question:' + member, JSON.stringify({ open: true, pageLesson: enrollment + ':' + lesson, selected: { enrollmentId: enrollment, lessonId: lesson, label: '오래된 2일차 표시', recent: true } })), { member: id(99), enrollment: id(1), lesson: id(4) });
    await page.goto('/learning-question-blocks-test');
    const dialog = page.getByRole('dialog', { name: '질문하기' });
    await expect(page.locator('.lesson-header')).toContainText(sample.outline);
    // Mobile deliberately closes a restored panel while the lesson loads.
    if (!await dialog.isVisible()) await page.getByRole('button', { name: '질문하기', exact: true }).click();
    await expect(dialog.locator('.floating-question-context')).toContainText(`${sample.expected} · 목차와 같은 수업`);
    await expect(dialog).not.toContainText('오래된 2일차 표시');
    await dialog.getByRole('textbox', { name: '질문 내용', exact: true }).fill('입력 중인 질문은 그대로');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.locator('.lesson-header')).toContainText(sample.outline);
    if (await page.getByRole('button', { name: /학습 목차|학습 목록/ }).isVisible()) await page.getByRole('button', { name: /학습 목차|학습 목록/ }).click();
    await expect(page.locator('.lesson-nav.active')).toContainText(sample.outline);
    await page.getByRole('button', { name: '질문하기', exact: true }).click();
    await expect(dialog.locator('.floating-question-context')).toContainText(sample.expected);
    await expect(dialog.getByRole('textbox', { name: '질문 내용', exact: true })).toHaveValue('입력 중인 질문은 그대로');
    // The parent and classroom share one progression request, rather than fetching twice.
    expect(gateReads).toBeLessThanOrEqual(2); // React StrictMode may abort its initial read.
    await page.screenshot({ path: info.outputPath('question-day.png'), fullPage: false });
  });
}
