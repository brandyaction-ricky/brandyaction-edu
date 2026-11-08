import { expect, test, type Page } from '@playwright/test';

const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

for (const menu of ['seo', 'automations']) test(`${menu}: grouped shortcuts preserve routes, selection and help`, async ({ page, viewport }, info) => {
  const writes: string[] = [];
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url()); });
  await page.goto(`/admin-ux-audit-test?menu=${menu}`);
  const nav = page.getByRole('navigation', { name: '마케팅 작업 빠른 이동' });
  await expect(nav.getByRole('link')).toHaveCount(9);
  const current = nav.locator('[aria-current=page]');
  await expect(current).toHaveAttribute('href', `/admin/${menu}`);
  for (const link of await nav.getByRole('link').all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(60);
    expect(await link.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  }
  await page.locator('.marketing-workspace-help>summary').click();
  await expect(page.locator('.marketing-workspace-guide')).toBeVisible();
  const help = (await page.locator('.marketing-workspace-guide').boundingBox())!, navBox = (await nav.boundingBox())!;
  expect(help.y).toBeGreaterThanOrEqual(navBox.y + navBox.height);
  await page.locator('.marketing-workspace-help>summary').click();
  await fits(page);expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${menu}-${viewport!.width}.png`), fullPage: true });
});

for (const state of ['open', 'answered']) test(`questions ${state}: full-width list and readable conversation sections`, async ({ page, viewport }, info) => {
  const writes: string[] = [];
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url()); });
  await page.route('**/api/platform/question-thread?*', route => route.fulfill({ json: {
    question: { id: new URL(route.request().url()).searchParams.get('question'), status: state, resolved: false, archived: false, headId: state === 'answered' ? 'answer-1' : null },
    answers: state === 'answered' ? [{ id: 'answer-1', source: 'staff', authorName: '합성 운영자', createdAt: '2026-11-06T01:00:00Z', content: '설정의 경로와 파일 이름부터 확인해 주세요.\n처음 단계로 돌아가 실행 결과를 비교하면 차이를 확인할 수 있습니다.' }] : [], nextCursor: null, canAnswer: false, canFollowUp: false,
  } }));
  await page.goto(`/question-comments-test?menu=questions&${state}`);
  const list = page.getByRole('region', { name: '질문 목록', exact: true });
  await expect(list.getByRole('button')).toHaveCount(3);
  expect(await list.evaluate(e => e.getBoundingClientRect().width - parseFloat(getComputedStyle(e).borderRightWidth) - e.querySelector('button')!.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  const detail = page.getByRole('article', { name: '선택한 질문 상세' });
  await expect(detail.getByRole('region', { name: '질문 내용', exact: true })).toContainText('마지막 단계');
  await expect(detail.locator('.question-learning-context')).toContainText('1주차');
  await expect(detail.getByRole('region', { name: '후속 질문과 답변 댓글' })).toBeVisible();
  if (state === 'answered') await expect(detail.locator('.answer')).toContainText('경로와 파일 이름');
  await list.getByRole('button').nth(1).click();
  await expect(detail.getByRole('heading', { level: 2 })).toContainText('2번째 합성 질문');
  await expect(detail.getByRole('button', { name: '질문 보관' })).toHaveCount(1);
  await fits(page);expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath(`questions-${state}-${viewport!.width}.png`), fullPage: true });
});

test('curriculum: flat outline and icon ordering preserve keyboard and dialog behavior', async ({ page, viewport }, info) => {
  const writes: string[] = [];
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url()); });
  await page.route('**/api/platform?**', route => route.fulfill({ json: { data: {
    curriculum_weeks: [1, 2, 3].map(n => ({ id: `week-${n}`, course_id: 'synthetic-course', week_number: n, title: `실무 도구 설정과 실행 결과 정리 ${n}`, is_published: false })),
    curriculum_lessons: [1, 2, 3].flatMap(w => [1, 2, 3].map(n => ({ id: `lesson-${w}-${n}`, week_id: `week-${w}`, day_number: n, title: `내 업무의 반복 작업을 정리하고 실행하기 ${n}`, content_type: 'text', is_published: false }))),
    lesson_contents: [], curriculum_missions: [],
  } } }));
  await page.goto('/admin-ux-audit-test?menu=learning');
  const outline = page.getByLabel('커리큘럼 목차', { exact: true });
  await expect(outline.locator('.studio-week-disclosure')).toHaveCount(3);
  const week = outline.locator('.studio-week-disclosure').first();
  await week.locator('summary').first().click();
  await week.locator('.studio-lesson-link').nth(1).click();
  await expect(outline.locator('li.selected')).toHaveCSS('border-radius', '0px');
  await expect(week).toHaveCSS('border-top-width', '0px');
  const down = week.getByRole('button', { name: /주차 아래로$/ });
  await expect(down).toHaveText('');
  await expect(down).toHaveAttribute('title', '주차 아래로');
  await down.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await fits(page);expect(writes).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`curriculum-${viewport!.width}.png`), fullPage: true });
});

test('marketing and question layout fit the annotated wide screen and a narrow phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Additional widths are covered once.');
  for (const width of [2560,320]) {
    await page.setViewportSize({ width, height: width === 2560 ? 1247 : 844 });
    for (const menu of ['seo', 'automations', 'questions']) {
      await page.goto(`/admin-ux-audit-test?menu=${menu}`);
      await expect(page.locator('h1')).toBeVisible();
      await fits(page);
      await page.screenshot({ path: info.outputPath(`${menu}-${width}.png`), fullPage: true });
    }
  }
});
