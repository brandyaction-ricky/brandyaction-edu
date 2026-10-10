import { expect, test } from '@playwright/test';

test('top notice edits inline and survives learner rendering and reopening', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: '필독 공지 추가', exact: true }).click();
  const callout = editor.locator('[data-lesson-callout]');
  await expect(callout).toHaveCount(1);
  await page.keyboard.type('강의를 시작하기 전에 안내를 확인하세요.');
  await page.getByRole('button', { name: '필독 공지 추가', exact: true }).click();
  await expect(callout).toHaveCount(1);
  await expect(editor.locator(':scope > :first-child [data-lesson-callout]')).toHaveAttribute('data-lesson-callout', '');
  await expect(editor).toContainText('내 사업에서 일할 AI팀');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  const learner = page.getByRole('region', { name: '저장된 학습자 화면' });
  await expect(learner.getByRole('complementary', { name: '학습 안내' })).toContainText('강의를 시작하기 전에 안내를 확인하세요.');
  await expect(learner.locator('[data-lesson-callout]')).toHaveCSS('background-color', 'rgb(255, 249, 232)');
  await page.getByRole('button', { name: '저장한 학습 다시 열기' }).click();
  await expect(callout).toContainText('강의를 시작하기 전에 안내를 확인하세요.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await callout.locator('p').last().click();
  await page.getByRole('button', { name: '콜아웃', exact: true }).click();
  await expect(editor).toContainText('강의를 시작하기 전에 안내를 확인하세요.');
});

for (const [shortcut, selector] of [['# ', 'h1'], ['## ', 'h2'], ['### ', 'h3'], ['- ', 'ul li'], ['1. ', 'ol li'], ['" ', 'blockquote']] as const) {
  test(`line-start shortcut ${JSON.stringify(shortcut)} supports undo, saving and reloading`, async ({ page }) => {
    await page.goto('/lesson-formatting-test');
    const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
    await editor.fill('');
    await editor.pressSequentially(shortcut);
    await expect(editor.locator(selector)).toHaveCount(1);
    await editor.press('ControlOrMeta+z');
    await expect(editor.locator(selector)).toHaveCount(0);
    expect(await editor.textContent()).toBe(shortcut);
    await editor.fill('');
    await editor.pressSequentially(shortcut + '작성한 학습 내용');
    await page.getByRole('button', { name: '학습 저장', exact: true }).click();
    await expect(page.getByRole('region', { name: '저장된 학습자 화면' }).locator('.reading-copy').locator(selector)).toHaveText('작성한 학습 내용');
    await page.reload();
    await expect(editor.locator(selector)).toHaveText('작성한 학습 내용');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('toggle shortcut preserves nested content and safe links through save/reload and keyboard disclosure', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  await editor.fill('');
  await editor.pressSequentially('> ');
  await expect(editor.locator('[data-type=details]')).toHaveCount(1);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  expect(await editor.textContent()).toBe('> ');
  await editor.fill('');
  await editor.pressSequentially('> 참고 자료');
  const expand = editor.getByRole('button', { name: '내용 펼치기', exact: true });
  await expand.focus(); await expand.press('Enter');
  await expect(editor.getByRole('button', { name: '내용 접기' })).toHaveAttribute('aria-expanded', 'true');
  await editor.locator('summary').click(); await editor.press('End'); await editor.press('Enter');
  await editor.pressSequentially('## 자세한 설명');
  await editor.press('End'); await editor.press('Enter');
  await editor.pressSequentially('https://example.test/guide');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  const learner = page.getByRole('region', { name: '저장된 학습자 화면' });
  await expect(learner.locator('summary')).toHaveText('참고 자료');
  await expect(learner.getByRole('heading', { name: '자세한 설명' })).toBeHidden();
  await learner.locator('summary').focus(); await learner.locator('summary').press('Enter');
  await expect(learner.getByRole('heading', { name: '자세한 설명', level: 2 })).toBeVisible();
  await expect(learner.getByRole('link', { name: 'https://example.test/guide' })).toHaveAttribute('href', 'https://example.test/guide');
  const saved = await page.getByLabel('저장된 본문').textContent();
  await page.reload();
  await expect(page.getByLabel('저장된 본문')).toHaveText(saved!);
  await expect(editor.locator('summary')).toHaveText('참고 자료');
  await expect(learner.getByRole('heading', { name: '자세한 설명' })).toBeHidden();
  await editor.getByRole('button', { name: '내용 펼치기' }).click();
  await expect(editor.getByRole('heading', { name: '자세한 설명', level: 2 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('typing shortcuts in the middle of a sentence remains literal text', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  await editor.fill('');
  await editor.pressSequentially('본문 # 제목 > 기호 " 인용 - 목록 1. 번호');
  await expect(editor.locator('h1,h2,h3,blockquote,ul,ol,[data-type=details]')).toHaveCount(0);
  await expect(editor).toHaveText('본문 # 제목 > 기호 " 인용 - 목록 1. 번호');
});

test('opening and saving a legacy lesson preserves text, blank lines, numbering and named links', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCSS('font-weight', '400');
  await expect(editor.getByRole('link', { name: '클로드 다운로드 페이지' })).toHaveAttribute('href', 'https://claude.com/download');
  await expect(editor.locator('p')).toHaveCount(5);
  await expect(page.getByLabel('본문 저장 횟수')).toHaveText('0');
  const before = await page.getByLabel('저장된 본문').textContent();
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByLabel('본문 저장 횟수')).toHaveText('1');
  await expect(page.getByLabel('저장된 본문')).toHaveText(before!);
  await page.getByRole('button', { name: '저장한 학습 다시 열기' }).click();
  await expect(editor).toContainText('2. 앱을 설치합니다.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('headings, size, bold and underline survive preview, save, reopening and learner rendering', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  const preview = page.locator('.preview-window .reading-copy');
  await editor.fill('큰 제목');
  await page.getByRole('combobox', { name: '문단 스타일' }).selectOption('h2');
  await expect(preview.getByRole('heading', { name: '큰 제목', level: 2 })).toHaveCSS('font-size', '28px');
  await expect(editor.getByRole('heading', { name: '큰 제목', level: 2 })).toHaveCSS('font-size', '28px');
  await editor.press('End'); await editor.press('Enter');
  await editor.pressSequentially('작은 제목');
  await page.getByRole('combobox', { name: '글자 크기' }).selectOption('32px');
  await page.getByRole('combobox', { name: '문단 스타일' }).selectOption('h3');
  await expect(editor.getByRole('heading', { name: '작은 제목', level: 3 })).toHaveCSS('font-size', '22px');
  await expect(page.getByRole('combobox', { name: '글자 크기' })).toHaveValue('');
  await expect(preview.getByRole('heading', { name: '작은 제목', level: 3 })).toBeVisible();
  await editor.press('End'); await editor.press('Enter');
  await editor.pressSequentially('강조할 본문');
  for (let i = 0; i < '강조할 본문'.length; i++) await editor.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: '굵게', exact: true }).click();
  await page.getByRole('button', { name: '밑줄', exact: true }).click();
  await page.getByRole('combobox', { name: '글자 크기' }).selectOption('20px');
  await expect(preview.locator('strong')).toHaveText('강조할 본문');
  await expect(preview.locator('u')).toHaveText('강조할 본문');
  await expect(preview.getByText('강조할 본문', { exact: true })).toHaveCSS('font-size', '20px');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '글자 크기' })).toHaveValue('');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '글자 크기' })).toHaveValue('20px');
  await expect(editor).toBeFocused();
  await editor.press('ArrowRight');
  // Chromium dispatches native selectionchange on the next frame.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await editor.press('Enter');
  await editor.pressSequentially('다음 문단');
  await expect(preview.locator('strong').filter({hasText:'강조할 본문'})).toHaveText('강조할 본문');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByLabel('본문 저장 횟수')).toHaveText('1');
  const learner = page.getByRole('region', { name: '저장된 학습자 화면' });
  await expect(learner.getByRole('heading', { name: '큰 제목', level: 2 })).toHaveCSS('font-size', '28px');
  await expect(learner.getByRole('heading', { name: '작은 제목', level: 3 })).toHaveCSS('font-size', '22px');
  await expect(learner.locator('strong').filter({hasText:'강조할 본문'})).toHaveText('강조할 본문');
  await expect(learner.getByText('강조할 본문', { exact: true })).toHaveCSS('font-size', '20px');
  await page.getByRole('button', { name: '저장한 학습 다시 열기' }).click();
  await expect(editor.getByRole('heading', { name: '큰 제목', level: 2 })).toBeVisible();
  await expect(editor.locator('strong').filter({hasText:'강조할 본문'})).toHaveText('강조할 본문');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('link toolbar validates URLs, empty rich text cannot overwrite saved content and busy editor is locked', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  await editor.fill('참고 자료'); await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByRole('textbox', { name: '링크 주소' }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('올바른 주소');
  await page.getByRole('textbox', { name: '링크 주소' }).fill('https://example.test/guide');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.preview-window').getByRole('link', { name: '참고 자료', exact: true })).toHaveAttribute('href', 'https://example.test/guide');
  await page.getByRole('button', { name: '저장 중 상태 전환' }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: '굵게', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '저장 중 상태 전환' }).click();
  await editor.fill('');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByLabel('본문 저장 횟수')).toHaveText('0');
  await expect(page.getByText('선택한 콘텐츠 유형에 맞는 본문·영상·자료·링크를 입력해 주세요.')).toBeVisible();
});

test('pasted text only keeps supported formatting and list commands save readable learner lists', async ({ page }) => {
  await page.goto('/lesson-formatting-test');
  const editor = page.getByRole('textbox', { name: '학습 내용', exact: true });
  await editor.fill('');
  await editor.evaluate(element => {
    const data = new DataTransfer();
    data.setData('text/html', '<p><strong>붙여넣은 글</strong><span style="font-size:9999px;color:red">큰 글자 차단</span><img src="x" onerror="window.__lessonUnsafe=true"><a href="javascript:alert(1)">위험한 링크</a></p>');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(editor.locator('strong')).toHaveText('붙여넣은 글');
  await expect(editor.locator('img,script,a')).toHaveCount(0);
  await expect(editor.locator('[style*="9999"]')).toHaveCount(0);
  await editor.fill('첫 항목');
  await page.getByRole('button', { name: '글머리 목록', exact: true }).click();
  await editor.press('Enter'); await editor.pressSequentially('둘째 항목');
  await expect(editor.locator('ul li')).toHaveCount(2);
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  const learner = page.getByRole('region', { name: '저장된 학습자 화면' });
  await expect(learner.locator('ul li')).toHaveCount(2);
  await expect(learner.locator('ul')).toHaveCSS('list-style-type', 'disc');
  await page.getByRole('button', { name: '저장한 학습 다시 열기' }).click();
  await expect(editor.locator('ul li')).toHaveCount(2);
});
