import {expect, test, type Page} from '@playwright/test';
import {student} from '../campus-fixture/data';
import {withExistingCohortVisibility} from '../browser/fixture/cohort-visibility';
import {defaultProfile} from '../../features/campus/space/domain';

const scope = student.scopes[0];
const lessons = student.lessons.slice(0, 3).map((item, index) => ({
  ...item, week: 1, completed: index === 0, locked: index === 2, missions: [],
}));
const [first, second, locked] = lessons;
const body = (day: number) => `공개 본문 ${day} · 고객과 나눈 대화에서 다음 질문을 찾습니다.`;
const roomUrl = '/campus/workspace?' + new URLSearchParams({
  tourLive: '1', studyPresence: '1', enrollmentId: scope.enrollmentId, room: 'study',
});

// Content and permission checks do not need a WebGL renderer. The first journey uses the real scene.
async function simpleScene(page: Page) {
  await page.route('**/campus/world/**/index.html*', route => route.fulfill({contentType: 'text/html',
    body: `<script>const token=new URLSearchParams(location.hash.slice(1)).get('bridge');addEventListener('message',e=>{
      if(e.origin===location.origin && e.data.type==='init')parent.postMessage({source:'moonshot-tour',token,type:'ready',payload:{}},location.origin);
    });</script>`,
  }));
}

async function connect(page: Page, guidedLessons = false, realScene = false) {
  if (!realScene) await simpleScene(page);
  const data = withExistingCohortVisibility({
    enrollments: [{id: scope.enrollmentId, course_id: scope.courseId, cohort_id: scope.cohortId, status: 'active'}],
    courses: [{id: scope.courseId, title: scope.courseTitle}],
    cohorts: [{id: scope.cohortId, course_id: scope.courseId, name: scope.cohortName}],
    curriculum_weeks: [{id: 'week-1', course_id: scope.courseId, week_number: 1, title: '대화 실습', is_published: true}],
    curriculum_lessons: lessons.map(item => ({id: item.id, week_id: 'week-1', title: item.title, day_number: item.day, is_published: true})),
    lesson_progress: [{enrollment_id: scope.enrollmentId, lesson_id: first.id, completed_at: '2026-11-02T10:00:00Z'}],
  });
  await page.route('**/api/platform/lesson-questions?**', route => route.fulfill({json: {questions: [], hasMore: false}}));
  const reads: string[] = [];
  let deny = false;
  await page.route('**/api/campus?**', route => route.fulfill({json: {...student, guidedLessons, lessons}}));
  await page.route('**/api/campus/library?**', route => route.fulfill({json: {resources: []}}));
  await page.route('**/api/campus/community/rewards?**', route => route.fulfill({json: {level: 1}}));
  await page.route('**/api/campus/space**', route => route.fulfill({json: {
    profile: defaultProfile('검수 동료'), peers: [], messages: [], seats: [], serverNow: new Date().toISOString(),
  }}));
  await page.route('**/api/platform?**', route => {
    const query = new URL(route.request().url()).searchParams;
    const lesson = lessons.find(item => item.id === query.get('lesson'));
    if (query.get('section') !== 'learn') return route.fulfill({json: {data: {}}});
    expect(route.request().method()).toBe('GET');
    expect(query.get('view')).toBe('member');
    expect(query.get('enrollment')).toBe(scope.enrollmentId);
    expect(lesson).toBeDefined();
    reads.push(lesson!.id);
    if (deny) return route.fulfill({status: 403, json: {error: '수강 권한을 다시 확인해 주세요.'}});
    return route.fulfill({json: {
      user: {id: student.viewer.id, role: 'student'},
      data: {...data, lesson_contents: [{id: 'content-' + lesson!.id, lesson_id: lesson!.id, body_text: body(lesson!.day)}]},
    }});
  });
  return {reads, revoke: () => {deny = true;}};
}

function verifyRoom(page: Page) {
  return expect(page).toHaveURL(url => url.pathname === '/campus/workspace' &&
    url.searchParams.get('room') === 'study' && url.searchParams.get('enrollmentId') === scope.enrollmentId);
}

test('study shortcut and 3D lesson hotspot open published content in the same study room', async ({page}) => {
  test.setTimeout(90000);
  const api = await connect(page, false, true);
  await page.goto(roomUrl);
  const shortcut = page.getByRole('region', {name: '이어서 할 수업·실습'}).getByRole('button', {name: '수업 열기'});
  const dialog = page.getByRole('dialog', {name: '수업', exact: true});
  await shortcut.click();
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  await verifyRoom(page);

  const selector = dialog.getByRole('combobox', {name: '수업 선택'});
  await expect(selector.locator(`option[value="${locked.id}"]`)).toHaveJSProperty('disabled', true);
  await selector.selectOption(first.id);
  await expect(dialog.getByText(body(1), {exact: true})).toBeVisible();
  await expect(dialog.getByText(body(2), {exact: true})).toHaveCount(0);
  await dialog.getByRole('button', {name: /다음 학습/}).click();
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  await expect(selector).toHaveValue(second.id);
  await verifyRoom(page);
  await dialog.getByRole('button', {name: '수업 닫기'}).click();
  await expect(shortcut).toBeVisible();

  const scene = page.frameLocator('iframe[title="문샷 캠퍼스 3D 미리보기"]');
  await scene.getByRole('button', {name: '수업', exact: true}).click();
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  await verifyRoom(page);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await verifyRoom(page);
  await expect(shortcut).toBeVisible();
  expect(api.reads).toContain(first.id);
  expect(api.reads).not.toContain(locked.id);
});

test('the room discards previously read content when the next member read is denied', async ({page}) => {
  const api = await connect(page);
  await page.goto(roomUrl);
  await page.getByRole('region', {name: '이어서 할 수업·실습'}).getByRole('button', {name: '수업 열기'}).click();
  const dialog = page.getByRole('dialog', {name: '수업', exact: true});
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  api.revoke();
  await dialog.getByRole('combobox', {name: '수업 선택'}).selectOption(first.id);
  await expect(dialog.getByRole('alert')).toContainText('수강 권한');
  await expect(dialog.getByText(body(2), {exact: true})).toHaveCount(0);
  await expect(dialog.getByText(body(1), {exact: true})).toHaveCount(0);
  await verifyRoom(page);
});

test('staff without enrollment can read and switch published lessons inside their preview room', async ({page}) => {
  const requested: string[] = [];
  await simpleScene(page);
  await page.route('**/api/platform/curriculum-review?**', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('cohort')).toBe(scope.cohortId);
    expect(route.request().method()).toBe('GET');
    const lesson = lessons.find(item => item.id === query.get('lesson'));
    if (lesson) {
      requested.push(lesson.id);
      return route.fulfill({json: {revision: 'published-1', body: body(lesson.day), video: '', external: '', document: null}});
    }
    return route.fulfill({json: {
      cohorts: [{id: scope.cohortId, courseId: scope.courseId, title: scope.cohortName}],
      cohortId: scope.cohortId, enrollmentId: null, studentStateError: false,
      lessons: lessons.map(item => ({...item, weekTitle: '대화 실습', description: '', studentUnlocked: false})),
    }});
  });
  await page.goto('/operator-tour?cohort=' + scope.cohortId);
  await page.getByRole('button', {name: '이 공간에서 할 일', exact: true}).click();
  await page.getByRole('region', {name: '이 공간에서 할 일'}).getByRole('button', {name: '수업', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '수업', exact: true});
  await expect(dialog.getByText(body(1), {exact: true})).toBeVisible();
  await dialog.getByRole('combobox', {name: '수업 선택'}).selectOption(second.id);
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name: '학습 완료하기', exact: true})).toHaveCount(0);
  await expect(page).toHaveURL(url => url.pathname === '/operator-tour' && url.searchParams.get('cohort') === scope.cohortId);
  expect(requested).toEqual([first.id, second.id]);
});

for (const guided of [false, true]) {
  test(`published blocks open inside the room with guided lessons ${guided ? 'on' : 'off'}`, async ({page}) => {
    await connect(page, guided);
    const blockReads: string[] = [];
    await page.route('**/api/platform/lesson-blocks?**', route => {
      const query = new URL(route.request().url()).searchParams;
      expect(route.request().method()).toBe('GET');
      expect(query.get('enrollment')).toBe(scope.enrollmentId);
      if (query.get('action') === 'progression') {
        return route.fulfill({json: {lessons: lessons.map(item => ({
          lessonId: item.id, isUnlocked: !item.locked, dayNumber: item.day,
          automaticApproval: true, track: 'learning', reason: item.locked ? '이전 학습을 완료해 주세요.' : '',
        }))}});
      }
      const lesson = lessons.find(item => item.id === query.get('lesson'));
      expect(lesson).toBeDefined();
      blockReads.push(lesson!.id);
      return route.fulfill({json: {
        document: {schemaVersion: 1, blocks: [{id: 'text', type: 'text', content: '게시된 블록 · ' + body(lesson!.day)}],
          checklist: [], completion: {mode: 'self', requireAnswers: false, requireQuizPass: false}},
        revision: '00000000-0000-4000-8000-000000000100', currentRevision: '00000000-0000-4000-8000-000000000100',
        draft: null, submission: null, previousDrafts: [], editable: true,
      }});
    });
    await page.goto(roomUrl + '&lessonBlocks=1');
    await page.getByRole('region', {name: '이어서 할 수업·실습'}).getByRole('button', {name: '수업 열기'}).click();
    const dialog = page.getByRole('dialog', {name: '수업', exact: true});
    await expect(dialog.getByText('게시된 블록 · ' + body(2), {exact: true})).toBeVisible();
    const selector = dialog.getByRole('combobox', {name: '수업 선택'});
    await expect(selector.locator(`option[value="${locked.id}"]`)).toHaveJSProperty('disabled', true);
    await selector.selectOption(first.id);
    await expect(dialog.getByText('게시된 블록 · ' + body(1), {exact: true})).toBeVisible();
    await expect(dialog.getByText('게시된 블록 · ' + body(2), {exact: true})).toHaveCount(0);
    await verifyRoom(page);
    expect(blockReads).toContain(second.id);
    expect(blockReads).not.toContain(locked.id);
  });
}

test('a partner can read a later published lesson with their own access and no student writes', async ({page}) => {
  await connect(page);
  await page.route('**/api/campus?**', route => route.fulfill({json: {
    ...student, scopes: [{...scope, externalPartner: true}],
    lessons: lessons.map(item => ({...item, locked: false, completed: false})),
  }}));
  const memberReads: string[] = [], reviewReads: string[] = [];
  await page.route('**/api/platform?**', route => {
    if (new URL(route.request().url()).searchParams.get('section') === 'learn') memberReads.push(route.request().url());
    return route.fulfill({status: 403, json: {error: '수강생 전용'}});
  });
  await page.route('**/api/platform/curriculum-review?**', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('partner')).toBe('1');
    expect(params.get('access')).toBe(scope.enrollmentId);
    expect(route.request().method()).toBe('GET');
    const lesson = lessons.find(item => item.id === params.get('lesson'));
    expect(lesson).toBeDefined();
    reviewReads.push(lesson!.id);
    return route.fulfill({json: {revision: 'published-2', body: body(lesson!.day), video: '', external: '', document: null}});
  });
  await page.goto(roomUrl);
  await page.getByRole('button', {name: '이 공간에서 할 일', exact: true}).click();
  await page.getByRole('region', {name: '이 공간에서 할 일'}).getByRole('button', {name: '수업', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '수업', exact: true});
  await expect(dialog.getByText(body(1), {exact: true})).toBeVisible();
  await dialog.getByRole('combobox', {name: '수업 선택'}).selectOption(locked.id);
  await expect(dialog.getByText(body(3), {exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name:'학습 완료하기',exact:true})).toHaveCount(0);
  await verifyRoom(page);
  expect(memberReads).toEqual([]);
  expect(reviewReads).toEqual([first.id, locked.id]);
});

test('the earlier spatial workspace also reads both lessons and closes back to its own room', async ({page}) => {
  await connect(page);
  await page.goto('/workspace-live?section=learning&enrollmentId=' + scope.enrollmentId);
  const panel = page.getByRole('dialog', {name: '수업·과제', exact: true});
  await expect(panel.getByText(body(2), {exact: true})).toBeVisible();
  await panel.getByRole('combobox', {name: '수업 선택'}).selectOption(first.id);
  await expect(panel.getByText(body(1), {exact: true})).toBeVisible();
  await panel.getByRole('button', {name: /다음 학습/}).click();
  await expect(panel.getByText(body(2), {exact: true})).toBeVisible();
  await panel.getByRole('button', {name: '수업·과제 닫기'}).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(url => url.pathname === '/workspace-live' && url.searchParams.get('section') === 'space' && url.searchParams.get('enrollmentId') === scope.enrollmentId);
});

test('a mentor question draft survives a cancelled lesson change and cancelled room close', async ({page}) => {
  await connect(page);
  await page.route('**/api/platform/curriculum-ai/history?**', route => route.fulfill({json: {exchanges: [], hasMore: false}}));
  await page.goto(roomUrl);
  await page.getByRole('region', {name: '이어서 할 수업·실습'}).getByRole('button', {name: '수업 열기'}).click();
  const dialog = page.getByRole('dialog', {name: '수업', exact: true});
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: '이 학습에 질문하기'}).click();
  const popup = page.getByRole('dialog', {name: '질문하기', exact: true});
  await expect(popup).toBeVisible();
  await page.goBack();
  await expect(popup).toBeHidden();
  await expect(dialog.getByRole('heading', {name: second.title, exact: true})).toHaveCount(1);
  await dialog.getByRole('button', {name: '이 학습에 질문하기'}).click();
  await popup.getByRole('button', {name: '멘토에게 질문', exact: true}).click();
  const draft = '이전 수업의 고객 사례를 다시 확인하고 싶습니다.';
  await popup.getByRole('textbox', {name: '질문 내용'}).fill(draft);
  await popup.getByRole('button', {name: '닫기', exact: true}).click();
  await expect(popup).toBeHidden();
  const selector = dialog.getByRole('combobox', {name: '수업 선택'});
  const prompts: string[] = [];
  page.on('dialog', async confirmation => {
    prompts.push(confirmation.message());
    await confirmation.dismiss();
  });
  await selector.selectOption(first.id);
  await expect(selector).toHaveValue(second.id);
  await dialog.getByRole('button', {name: '수업 닫기'}).click();
  await expect(dialog.getByText(body(2), {exact: true})).toBeVisible();
  expect(prompts).toHaveLength(2);
  await dialog.getByRole('button', {name: '이 학습에 질문하기'}).click();
  await expect(popup.getByRole('textbox', {name: '질문 내용'})).toHaveValue(draft);
  await verifyRoom(page);
});

test('staff preview of a locked guided lesson reads the published review without a student block request', async ({page}) => {
  await connect(page);
  const reviewed: string[] = [], studentDocuments: string[] = [];
  await page.route('**/api/campus?**', route => route.fulfill({json: {
    ...student, guidedLessons: true, lessons: [{...locked, locked: true, staffPreview: true}],
  }}));
  await page.route('**/api/platform/lesson-blocks?**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('action') === 'progression') return route.fulfill({json: {lessons: [{
      lessonId: locked.id, track: 'learning', dayNumber: locked.day, isUnlocked: false, automaticApproval: false, reason: '아직 열리지 않았습니다.',
    }]}});
    studentDocuments.push(params.get('lesson') || '');
    return route.fulfill({status: 403, json: {error: '학생에게 아직 열리지 않았습니다.'}});
  });
  await page.route('**/api/platform/curriculum-review?**', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('cohort')).toBe(scope.cohortId);
    expect(params.get('lesson')).toBe(locked.id);
    expect(route.request().method()).toBe('GET');
    reviewed.push(locked.id);
    return route.fulfill({json: {revision: 'published-3', body: body(3), video: '', external: '', document: null}});
  });
  await page.goto(roomUrl + '&lessonBlocks=1');
  await page.getByRole('button', {name: '이 공간에서 할 일', exact: true}).click();
  await page.getByRole('region', {name: '이 공간에서 할 일'}).getByRole('button', {name: '수업', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '수업', exact: true});
  await expect(dialog.getByText(body(3), {exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name: '학습 완료하기', exact: true})).toHaveCount(0);
  await verifyRoom(page);
  expect(reviewed).toEqual([locked.id]);
  expect(studentDocuments).toEqual([]);
});
