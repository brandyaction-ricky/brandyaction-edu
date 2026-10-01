import { expect, test } from '@playwright/test';

test('sales stay available before curriculum publication across editor tabs and preview', async ({ page }) => {
  await page.goto('/product-sale-test');
  for (const tab of ['기본·판매', '수강·권한', '공개·검색']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('판매 중', { exact: true }).first()).toBeVisible();
    await expect(panel.getByText('신청 전 확인할 항목', { exact: true })).toHaveCount(0);
    await expect(panel.getByText(/연결 기수 상태: 합성 4기/)).toBeVisible();
  }
  await expect(page.locator('aside').getByText('판매 중', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.on('dialog', async dialog => { await dialog.dismiss(); throw new Error('정상 판매 상품에는 확인창이 필요하지 않습니다.'); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('ready upcoming offer saves without a warning or changing cohort status', async ({ page }) => {
  await page.goto('/product-sale-test?ready=1');
  await expect(page.locator('aside').getByText('판매 중', { exact: true }).first()).toBeVisible();
  page.on('dialog', async dialog => { await dialog.dismiss(); throw new Error('정상 판매 상품에는 확인창이 필요하지 않습니다.'); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('product curriculum tab loads existing scoped lessons without submitting the product form', async ({ page }) => {
  await page.goto('/product-sale-test');
  const tab = page.getByRole('tab', { name: '커리큘럼' });
  await tab.click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  await expect(panel.getByRole('heading', { name: /1주차 · 기존 합성 주차/ })).toBeVisible();
  await expect(panel.getByText(/Day 1 · 기존 합성 학습/)).toBeVisible();
  await panel.getByRole('button', { name: '학습 편집' }).click();
  await expect(panel.getByRole('textbox', { name: '학습 본문' })).toHaveText('기존 학습 본문');
  await panel.getByRole('textbox', { name: '새 주차 제목' }).fill('새 주차');
  await panel.getByRole('textbox', { name: '새 주차 제목' }).press('Enter');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await expect(page.getByRole('button', { name: '저장하기', exact: true })).toHaveCount(0);
});

test('existing week and day can be edited and published in product curriculum without product save', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '커리큘럼' }).click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  const week = panel.getByRole('region', { name: /1주차 기존 합성 주차/ });
  await week.locator('summary').filter({hasText:'주차 설정'}).click();
  await week.getByRole('textbox', { name: '주차 제목' }).fill('수정된 주차');
  await week.getByRole('checkbox', { name: '주차 공개' }).check();
  await week.getByRole('button', { name: '주차 저장' }).click();
  await expect(page.getByLabel('합성 커리큘럼 저장 횟수')).toHaveText('1');
  expect(JSON.parse(await page.getByLabel('합성 커리큘럼 요청').innerText())).toMatchObject({
    action: 'save', section: 'weeks', id: 'synthetic-week', values: { title: '수정된 주차', is_published: true },
  });
  await week.getByRole('button', { name: '학습 편집' }).click();
  const lesson = panel.getByRole('region', { name: '일차별 콘텐츠 편집' });
  await lesson.getByRole('textbox', { name: '일차 제목' }).fill('수정된 일차');
  await lesson.getByRole('checkbox', { name: '일차 공개' }).check();
  await lesson.getByRole('button', { name: '일차 저장' }).click();
  await expect(page.getByLabel('합성 커리큘럼 저장 횟수')).toHaveText('2');
  expect(JSON.parse(await page.getByLabel('합성 커리큘럼 요청').innerText())).toMatchObject({
    action: 'save', section: 'learning', id: 'synthetic-lesson', values: { title: '수정된 일차', is_published: true },
  });
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});

test('product cohort tab edits only its linked cohort without submitting the product form', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '기수·회차' }).click();
  const panel = page.getByRole('tabpanel', { name: '기수·회차' });
  const editor = panel.getByRole('region', { name: '합성 4기 편집' });
  await expect(panel.getByRole('button', { name: /합성 4기 · 준비 중 · 100,000원/ })).toBeVisible();
  await editor.getByRole('textbox', { name: '기수명' }).fill('합성 4기 수정');
  await editor.getByRole('button', { name: '기수 저장' }).click();
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  const mutation = JSON.parse(await page.getByLabel('합성 기수 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'cohorts', id: 'synthetic-cohort', values: { name: '합성 4기 수정' } });
  expect(mutation.values.course_id).toBeUndefined();
});

test('new product cohort is created as upcoming and invalid periods never submit', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '기수·회차' }).click();
  const panel = page.getByRole('tabpanel', { name: '기수·회차' });
  await panel.getByRole('button', { name: '+ 새 기수' }).click();
  await page.getByRole('tab', { name: '수강·권한' }).click();
  await expect(page.getByRole('combobox', { name: '연결 기수' })).toHaveValue('synthetic-cohort');
  await page.getByRole('tab', { name: '기수·회차' }).click();
  await panel.getByRole('button', { name: '+ 새 기수' }).click();
  const editor = panel.getByRole('region', { name: '새 기수 등록' });
  await editor.getByRole('textbox', { name: '기수명' }).fill('합성 5기');
  await editor.getByRole('textbox', { name: '기수 코드' }).fill('FIFTH');
  await editor.getByLabel('모집 시작 · KST').fill('2099-10-02T10:00');
  await editor.getByLabel('모집 마감 · KST').fill('2099-10-01T10:00');
  await editor.getByRole('button', { name: '기수 추가' }).click();
  await expect(editor.getByRole('alert')).toContainText('종료일은 시작일 이후');
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('0');
  await editor.getByLabel('모집 마감 · KST').fill('2099-10-03T10:00');
  await editor.getByRole('button', { name: '기수 추가' }).click();
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  const mutation = JSON.parse(await page.getByLabel('합성 기수 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'cohorts', values: { course_id: 'synthetic-course', name: '합성 5기', cohort_code: 'FIFTH', status: 'upcoming', price: 100000 } });
  await expect(panel.getByRole('button', { name: /합성 5기 · 준비 중 · 100,000원/ })).toBeVisible();
});

test('integrated curriculum edits only the selected lesson mission without submitting the product', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '커리큘럼' }).click();
  await page.getByRole('button', { name: '학습 편집' }).click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  await expect(panel.getByRole('region', { name: '1주차 미션' }).getByText(/Day 1 · 기존 합성 학습/)).toBeVisible();
  await expect(panel.getByText(/기존 합성 미션 · 비공개 · 필수/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole('button', { name: '미션 편집' }).click();
  const editor = panel.getByRole('region', { name: '기존 미션 편집' });
  await editor.getByRole('textbox', { name: '미션 제목' }).fill('수정된 합성 미션');
  await editor.getByRole('checkbox', { name: '공개' }).check();
  await editor.getByRole('button', { name: '미션 저장' }).click();
  await expect(page.getByLabel('합성 미션 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  const mutation = JSON.parse(await page.getByLabel('합성 미션 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'missions', id: 'synthetic-mission', values: { course_id: 'synthetic-course', week_id: 'synthetic-week', lesson_id: 'synthetic-lesson', title: '수정된 합성 미션', is_required: true, is_published: true } });
});

test('new product mission is tied to its lesson and remains hidden until reviewed', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '커리큘럼' }).click();
  await page.getByRole('button', { name: '학습 편집' }).click();
  const editor = page.getByRole('region', { name: '새 미션 등록' });
  await editor.getByRole('textbox', { name: '미션 제목' }).fill('새 합성 미션');
  await editor.getByRole('textbox', { name: '미션 제목' }).press('Enter');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await expect(editor.getByRole('checkbox', { name: /공개/ })).toBeDisabled();
  await editor.getByRole('checkbox', { name: '필수 미션' }).uncheck();
  await editor.getByRole('button', { name: '비공개 미션 추가' }).click();
  await expect(page.getByLabel('합성 미션 저장 횟수')).toHaveText('1');
  const mutation = JSON.parse(await page.getByLabel('합성 미션 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save', section: 'missions', values: { course_id: 'synthetic-course', week_id: 'synthetic-week', lesson_id: 'synthetic-lesson', title: '새 합성 미션', is_required: false, is_published: false } });
  expect(mutation.id).toBeUndefined();
});


test('curriculum can be published independently without losing unsaved product edits', async ({ page }) => {
  const week = { id: 'synthetic-week', course_id: 'synthetic-course', week_number: 1, title: '기존 합성 주차', is_published: false };
  const lesson = { id: 'synthetic-lesson', week_id: week.id, day_number: 1, title: '기존 합성 학습', content_type: 'text', is_published: false };
  await page.route('**/api/platform?**part=curriculum', route => route.fulfill({ json: { data: {
    curriculum_weeks: [week], curriculum_lessons: [lesson], lesson_contents: [{ lesson_id: lesson.id, body_text: '기존 학습 본문' }],
  } } }));
  await page.goto('/product-sale-test');
  await page.getByRole('textbox', { name: '상품명', exact: true }).fill('저장 전 상품명');
  await expect(page.locator('aside').getByText('판매 중', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: '커리큘럼', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  const guide = panel.getByRole('region', { name: '학습 공개 상태' });
  await expect(guide.getByRole('status')).toContainText('공개 주차 0개');
  await panel.locator('summary').filter({hasText:'주차 설정'}).click();
  week.is_published = true;
  await panel.getByRole('checkbox', { name: '주차 공개' }).check();
  await panel.getByRole('button', { name: '주차 저장' }).click();
  await expect(guide.getByRole('status')).toContainText('공개 주차 1개');
  await expect(guide.getByRole('status')).toContainText('공개 학습 0개');
  await expect(page.locator('.editor-aside')).toBeHidden();
  await panel.getByRole('button', { name: '학습 편집' }).click();
  lesson.is_published = true;
  await panel.getByRole('checkbox', { name: '일차 공개' }).check();
  await panel.getByRole('button', { name: '일차 저장' }).click();
  await expect(guide).toContainText('본문이 준비된 학습이 있습니다. 실제 수강생 공개 여부는 기수별 공개 범위에서 확인해 주세요.');
  await expect(page.locator('aside').getByText('판매 보류', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await page.getByRole('tab', { name: '기본·판매', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '상품명', exact: true })).toHaveValue('저장 전 상품명');
  await expect(page.getByRole('tabpanel', { name: '기본·판매' }).getByRole('button', { name: '공개 커리큘럼 설정하기' })).toHaveCount(0);
});

test('curriculum guidance does not count a public lesson under a private week or hide read failures', async ({ page }) => {
  await page.route('**/api/platform?**part=curriculum', route => route.fulfill({ json: { data: {
    curriculum_weeks: [{ id: 'private-week', course_id: 'synthetic-course', week_number: 1, title: '비공개 주차', is_published: false }],
    curriculum_lessons: [{ id: 'public-lesson', week_id: 'private-week', day_number: 1, title: '공개 학습', is_published: true }], lesson_contents: [],
  } } }));
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '커리큘럼', exact: true }).click();
  const guide = page.getByRole('region', { name: '학습 공개 상태' });
  await expect(guide.getByRole('status')).toContainText('공개 학습 0개');
  await expect(page.locator('li').getByText(/주차 비공개로 숨김/)).toBeVisible();
  await page.getByRole('button', { name: '학습 편집', exact: true }).click();
  const editor = page.getByRole('region', { name: '일차별 콘텐츠 편집' });
  await expect(editor.getByRole('checkbox', { name: '일차 공개' })).toBeChecked();
  await expect(editor.getByLabel('저장된 학습 공개 상태')).toContainText('주차 비공개로 숨김');
  await editor.getByRole('textbox', { name: '일차 제목' }).fill('저장 전 제목');
  await editor.getByRole('button', { name: '이 학습의 주차 설정' }).click();
  await expect(page.getByRole('checkbox', { name: '주차 공개' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '주차 공개' })).not.toBeChecked();
  await expect(page.getByLabel('합성 커리큘럼 저장 횟수')).toHaveText('0');
  await expect(editor.getByRole('textbox', { name: '일차 제목' })).toHaveValue('저장 전 제목');
  await page.getByRole('tab', { name: '기본·판매', exact: true }).click();
  await page.route('**/api/platform?**part=curriculum', route => route.fulfill({ status: 500, json: { error: '조회 실패 시험' } }));
  await page.getByRole('tab', { name: '커리큘럼', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('조회 실패 시험');
  await expect(guide.getByRole('status')).toHaveCount(0);
});


test('curriculum contains common materials, preserves permissions and keeps drafts across product tabs', async ({ page }) => {
  await page.goto('/product-sale-test?resources=1');
  await expect(page.getByRole('tab', { name: '제공 자료', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '미션', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '커리큘럼', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  await panel.locator('summary').filter({ hasText: '과정 공통 자료' }).click();
  await panel.getByRole('button', { name: '설정', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: '다운로드 권한' })).toHaveValue('purchaser');
  await panel.getByRole('textbox', { name: '자료 이름' }).fill('수정 중인 교재.pdf');
  await panel.getByRole('button', { name: '학습 편집' }).click();
  await panel.getByRole('textbox', { name: '학습 본문' }).fill('저장 전 본문');
  await panel.getByRole('textbox', { name: '미션 제목' }).fill('저장 전 미션');
  await page.getByRole('tab', { name: '기본·판매' }).click();
  await page.getByRole('tab', { name: '커리큘럼' }).click();
  await expect(panel.getByRole('textbox', { name: '학습 본문' })).toHaveText('저장 전 본문');
  await expect(panel.getByRole('textbox', { name: '미션 제목' })).toHaveValue('저장 전 미션');
  await expect(panel.getByRole('textbox', { name: '자료 이름' })).toHaveValue('수정 중인 교재.pdf');
  await panel.getByRole('button', { name: '자료 저장', exact: true }).click();
  const mutation = JSON.parse(await page.getByLabel('합성 자료 요청').innerText());
  expect(mutation).toMatchObject({ action: 'save-product-resource', courseId: 'synthetic-course', accessScope: 'purchaser', resourceName: '수정 중인 교재.pdf' });
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await expect(page.getByLabel('합성 미션 저장 횟수')).toHaveText('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('digital products retain their content manager and entitlement settings', async ({ page }) => {
  await page.goto('/product-sale-test?digital=1');
  await expect(page.getByRole('tab', { name: '커리큘럼', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '콘텐츠 구성', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: '콘텐츠 구성' })).toBeVisible();
  await page.getByRole('tab', { name: '수강·권한', exact: true }).click();
  await expect(page.getByRole('link', { name: '주문·수강 권한 확인' })).toBeVisible();
});


test('switching lessons scopes missions and preserves unfinished mission drafts', async ({ page }) => {
  const weeks = [{ id: 'synthetic-week', course_id: 'synthetic-course', week_number: 1, title: '주차' }];
  const lessons = [1, 2].map(n => ({ id: `lesson-${n}`, week_id: 'synthetic-week', day_number: n, title: `수업 ${n}`, content_type: 'text' }));
  await page.route('**/api/platform?**part=curriculum', route => route.fulfill({ json: { data: { curriculum_weeks: weeks, curriculum_lessons: lessons, lesson_contents: [] } } }));
  await page.route('**/api/platform?**part=missions', route => route.fulfill({ json: { data: { curriculum_weeks: weeks, curriculum_lessons: lessons, curriculum_missions: [1, 2].map(n => ({ id: `mission-${n}`, lesson_id: `lesson-${n}`, title: `수업 ${n} 미션`, submission_type: 'text' })) } } }));
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '커리큘럼' }).click();
  const week = page.getByRole('region', { name: '1주차 주차', exact: true });
  await week.getByRole('listitem').filter({ hasText: '수업 1' }).getByRole('button', { name: '학습 편집' }).click();
  await expect(page.getByText('수업 1 미션 · 비공개 · 선택')).toBeVisible();
  await expect(page.getByText('수업 2 미션 · 비공개 · 선택')).toHaveCount(0);
  await page.getByRole('textbox', { name: '미션 제목' }).fill('첫 수업 임시 미션');
  await week.getByRole('listitem').filter({ hasText: '수업 2' }).getByRole('button', { name: '학습 편집' }).click();
  await expect(page.getByText('수업 2 미션 · 비공개 · 선택')).toBeVisible();
  await page.getByRole('textbox', { name: '미션 제목' }).fill('두 번째 수업 미션');
  await page.getByRole('button', { name: '비공개 미션 추가' }).click();
  expect(JSON.parse(await page.getByLabel('합성 미션 요청').innerText()).values.lesson_id).toBe('lesson-2');
  await week.getByRole('listitem').filter({ hasText: '수업 1' }).getByRole('button', { name: '학습 편집' }).click();
  await expect(page.getByRole('textbox', { name: '미션 제목' })).toHaveValue('첫 수업 임시 미션');
});
