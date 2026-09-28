import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { imageBytes } from '../fixtures/replit-import-source.mjs';
import { gradeBlockQuiz, publicLessonBlocks, validateBlockAnswers, validateLessonBlocks, type LessonBlockAnswers } from '../../lib/lesson-blocks';

// Run the real offline converter under Node ESM. Playwright transpiles imported
// .mjs files to CommonJS, which cannot evaluate the converter's import.meta URL.
const plan = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', "import {prepareReplitLessonPlan} from './scripts/lib/replit-lesson-plan.mjs'; import {sourceFixture} from './tests/fixtures/replit-import-source.mjs'; console.log(JSON.stringify((await prepareReplitLessonPlan(sourceFixture())).plan));"], { encoding: 'utf8' }));
async function backend(page: Page, learning = false) {
  const document = validateLessonBlocks(plan.lessons[learning ? 1 : 0].document);
  let values: LessonBlockAnswers | null = null, writeId: string | null = null;
  await page.route('https://media.example.test/**', route => route.fulfill({ body: imageBytes, contentType: 'image/png' }));
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { document: publicLessonBlocks(document), revision: '11111111-1111-4111-8111-111111111111', currentRevision: '11111111-1111-4111-8111-111111111111', draft: values ? { values, writeId, updatedAt: '2026-09-29T00:00:00Z' } : null, previousDrafts: [] } }); return;
    }
    const body = route.request().postDataJSON();
    if (body.action === 'grade') {
      await route.fulfill({ json: { result: gradeBlockQuiz(document.blocks.find(b => b.id === body.blockId)!, validateBlockAnswers(body.values, document).blocks[body.blockId] as Record<string, number>) } }); return;
    }
    expect(body.action).toBe('draft'); values = validateBlockAnswers(body.values, document); writeId = body.requestId;
    await route.fulfill({ json: { writeId, updatedAt: '2026-09-29T00:00:00Z' } });
  });
  return { document, values: () => values };
}

test('converted daily lesson renders numeric order, tools, media controls and saved answers in the real learner component', async ({ page }) => {
  const server = await backend(page); await page.goto('/lesson-blocks-test');
  await expect(page.locator('[data-lesson-block]').first()).toContainText('첫 번째 제목');
  await expect(page.getByRole('link', { name: '학습 링크' })).toHaveAttribute('href', 'https://example.test/guide');
  await page.getByRole('textbox', { name: '무엇을 실행하나요?' }).fill('내가 고른 실행');
  const generator = page.getByRole('region', { name: '프롬프트 생성기', exact: true });
  await generator.getByRole('textbox', { name: '나의 목표' }).fill('완성');
  await generator.getByRole('textbox', { name: '고객' }).fill('참여자');
  await generator.getByRole('button', { name: '프롬프트 만들기' }).click();
  await expect(generator.locator('pre')).toHaveText('완성를 위한 참여자 안내문');
  await page.getByRole('radio', { name: '실행', exact: true }).check();
  await page.getByRole('button', { name: '답안 확인', exact: true }).click();
  await expect(page.getByText('정답입니다.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '기록했습니다.' }).check();
  await expect(page.locator('audio')).toHaveAttribute('src', 'https://media.example.test/audio.mp3');
  await expect(page.locator('video')).toHaveAttribute('src', 'https://media.example.test/movie.mp4');
  await expect(page.getByLabel('답변 이미지 선택')).toBeEnabled();
  await expect(page.getByRole('region', { name: '핵심 고객 페르소나 생성기' })).toBeVisible();
  await expect(page.getByRole('region', { name: '랜딩페이지 기획 문답' })).toBeVisible();
  await expect(page.getByRole('region', { name: '마케팅 퍼널 만들기' })).toBeVisible();
  await expect.poll(() => server.values()?.checklist.length).toBe(1);
  await page.reload(); await expect(page.getByRole('textbox', { name: '무엇을 실행하나요?' })).toHaveValue('내가 고른 실행');
  await expect(generator.getByRole('textbox', { name: '고객' })).toHaveValue('참여자');
  await expect(page.getByRole('radio', { name: '실행', exact: true })).toBeChecked();
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('converted learning HTML displays formatted text and links rather than markup, with introduction, tip and original choices', async ({ page }, info) => {
  await backend(page, true); await page.goto('/lesson-blocks-test');
  await expect(page.locator('.lesson-rich-body strong')).toHaveText('중요한 부분');
  await expect(page.getByRole('heading', { name: '중간 제목' })).toBeVisible();
  await expect(page.getByRole('link', { name: '참고 링크' })).toHaveAttribute('href', 'https://example.test/learn');
  const blocks = page.locator('[data-lesson-block]');
  await expect(blocks.nth(0)).toContainText('도입 안내'); await expect(blocks.nth(2)).toContainText('실행 팁');
  await expect(page.getByRole('radio', { name: '가', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: '나', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('<strong>');
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('converted-learning.png'), fullPage: true });
});
