import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/admin-component-system-test'); });

test('tokens, controls and feedback expose default, focus, disabled, loading and error states', async ({ page, viewport }) => {
  await expect(page.getByRole('heading', { name: '컴포넌트 검증' })).toBeVisible();
  await expect(page.locator('.edu-admin')).toHaveCSS('--adm-control', '36px');
  await expect(page.getByRole('button', { name: 'disabled' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '전체 2' })).toHaveCSS('font-size', '13px');
  await expect(page.locator('.admin-button[aria-busy=true]')).toBeDisabled();
  await expect(page.locator('.admin-button[aria-busy=true]')).toHaveAttribute('aria-busy', 'true');
  const primary = page.getByRole('button', { name: 'primary' });
  if ((viewport?.width || 0) > 1024) {
    await primary.hover();
    await expect(primary).toHaveCSS('background-color', 'rgb(167, 25, 34)');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus-visible')).toHaveCount(1);
  }
  await expect(page.getByRole('textbox', { name: '이름' })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('이름을 입력하세요')).toBeVisible();
  await page.getByRole('radio', { name: '옵션 A' }).check();
  await expect(page.getByRole('radio', { name: '옵션 A' })).toBeChecked();
  await page.getByRole('switch', { name: '즉시 설정' }).check();
  await expect(page.getByRole('switch', { name: '즉시 설정' })).toBeChecked();
  await expect(page.getByText('처리가 필요한 항목이 있습니다.')).toBeVisible();
});

test('table supports sorting, row click, selection, bulk action, pagination and status cells', async ({ page }) => {
  const region = page.getByRole('region', { name: '합성 회원' });
  await expect(region.getByRole('row')).toHaveCount(3);
  await expect(region.getByLabel('상태: 검토 대기')).toBeVisible();
  await region.getByRole('columnheader', { name: /제출/ }).getByRole('button').click();
  await expect(region.getByRole('row').nth(1)).toContainText('라마바');
  await expect(region.getByRole('columnheader', { name: /제출/ })).toHaveAttribute('aria-sort', 'ascending');
  await region.getByRole('row').nth(1).click();
  await expect(page.getByText('선택 행: 라마바')).toBeVisible();
  await region.getByRole('checkbox', { name: '현재 페이지 모두 선택' }).check();
  await expect(page.getByText('2개 선택')).toBeVisible();
  await page.getByRole('button', { name: '선택 해제' }).click();
  await expect(page.getByText('2개 선택')).toBeHidden();
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('navigation', { name: '페이지 이동' })).toContainText('3–4 / 4건');
});

test('empty, loading, error, quick filter and overlay focus work without page migration', async ({ page }) => {
  await page.getByRole('button', { name: 'empty', exact: true }).click();
  await expect(page.getByText('현재 필터에 결과가 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: 'loading', exact: true }).first().click();
  await expect(page.getByRole('region', { name: '합성 회원' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('합성 회원 불러오는 중')).toBeVisible();
  await page.getByRole('button', { name: 'error', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '일시적인 조회 오류' })).toBeVisible();
  await expect(page.getByText('현재 필터에 결과가 없습니다.')).toBeHidden();
  await page.getByRole('button', { name: '검토 필요 1' }).click();
  await expect(page.getByRole('button', { name: '검토 필요 1' })).toHaveAttribute('aria-pressed', 'true');
  const opener = page.getByRole('button', { name: 'Drawer 열기' });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: '회원 상세' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: '회원 상세' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await page.getByRole('button', { name: 'Modal 열기' }).click();
  await expect(page.getByRole('dialog', { name: '짧은 확인' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.admin-popover>summary').click();
  await expect(page.getByText('팝오버 내용')).toBeVisible();
  await page.getByRole('button', { name: 'Tooltip 보기' }).focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
});

test('filter toolbar keeps search flexible and wraps at narrow widths', async ({ page, viewport }) => {
  const search = page.getByRole('searchbox', { name: '회원 검색' });
  await expect(search).toBeVisible();
  await expect(page.getByRole('combobox', { name: '상품' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '상태' })).toBeVisible();
  await expect(page.getByRole('button', { name: '등록' })).toBeVisible();
  if ((viewport?.width || 0) > 1024) {
    const widths = await page.evaluate(() => ({ search: document.querySelector('.admin-filter-bar-search')!.getBoundingClientRect().width, select: document.querySelector('.admin-filter-bar-filters')!.getBoundingClientRect().width }));
    expect(widths.search).toBeGreaterThan(widths.select);
  } else {
    const positions = await page.evaluate(() => ({ search: document.querySelector('.admin-filter-bar-search')!.getBoundingClientRect().top, select: document.querySelector('.admin-filter-bar-filters')!.getBoundingClientRect().top }));
    expect(positions.search).toBeGreaterThan(positions.select);
  }
});

test('admin workspace stays inside 1280 and 1440 desktop viewports', async ({ page, viewport }) => {
  test.skip((viewport?.width || 0) <= 1024, 'desktop width verification');
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(true))));
    const layout = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll<HTMLElement>('.admin-filter-bar :is(input,select,.admin-button)'));
      const table = document.querySelector<HTMLElement>('.admin-table-scroll');
      const action = document.querySelector<HTMLElement>('.admin-data-table thead [data-align="action"]');
      const tableRect = table?.getBoundingClientRect();
      const actionRect = action?.getBoundingClientRect();
      return {
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
        controlSizes: controls.map(control => {
          const style = getComputedStyle(control);
          return { name: control.getAttribute('aria-label') || control.textContent?.trim() || control.tagName, className: control.className, height: Math.round(control.getBoundingClientRect().height), cssHeight: style.height, minHeight: style.minHeight, boxSizing: style.boxSizing, padding: style.padding };
        }),
        actionVisible: Boolean(tableRect && actionRect && actionRect.right <= tableRect.right + 1 && actionRect.left >= tableRect.left - 1),
      };
    });
    expect(layout.pageFits, `${width}px page overflow`).toBe(true);
    expect(layout.controlSizes.every(control => control.height === 36), JSON.stringify(layout.controlSizes)).toBe(true);
    expect(layout.actionVisible, `${width}px action column`).toBe(true);
  }
});

test('search icon spacing does not change iconless admin input padding', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: '회원 검색' });
  const ordinary = page.getByRole('textbox', { name: '이름' });
  const paddings = await page.evaluate(() => {
    const searchInput = document.querySelector<HTMLInputElement>('.admin-search-field input');
    const ordinaryInput = document.querySelector<HTMLInputElement>('.admin-input');
    if (!searchInput || !ordinaryInput) throw new Error('관리자 입력 필드가 없습니다.');
    return {
      search: Number.parseFloat(getComputedStyle(searchInput).paddingLeft),
      ordinary: Number.parseFloat(getComputedStyle(ordinaryInput).paddingLeft),
    };
  });
  await expect(search).toBeVisible();
  await expect(ordinary).toBeVisible();
  expect(paddings.search).toBeGreaterThanOrEqual(paddings.ordinary + 16);
  expect(paddings.ordinary).toBe(12);
});

test('question, coupon, tag and article spacing resolves from shared tokens', async ({ page, viewport }) => {
  const spacing = await page.evaluate(() => {
    const admin = document.querySelector('.edu-admin');
    if (!admin) throw new Error('관리자 테스트 화면이 없습니다.');
    const sample = document.createElement('div');
    sample.innerHTML = `
      <section class="question-admin-card"><div class="panel-body"></div></section>
      <div class="question-answer-editor"><span>질문</span><span>답변</span></div>
      <div class="tag-rule-box"></div>
      <div class="coupon-limit-group"></div>
      <div class="coupon-settings-form"><div></div><div></div></div>
    `;
    admin.append(sample);
    const front = document.createElement('div');
    front.className = 'edu-front';
    front.innerHTML = '<div class="article-thumbnail"></div>';
    document.body.append(front);
    const css = (selector: string) => getComputedStyle(document.querySelector(selector) as Element);
    return {
      questionPadding: css('.question-admin-card .panel-body').paddingTop,
      answerGap: css('.question-answer-editor').rowGap,
      tagPadding: css('.tag-rule-box').paddingTop,
      couponPadding: css('.coupon-limit-group').paddingTop,
      couponGap: css('.coupon-settings-form').rowGap,
      articleMargin: css('.article-thumbnail').marginBottom,
    };
  });
  expect(spacing.questionPadding).toBe((viewport?.width || 0) <= 680 ? '16px' : '20px');
  expect(spacing.answerGap).toBe('20px');
  expect(spacing.tagPadding).toBe('20px');
  expect(spacing.couponPadding).toBe('20px');
  expect(spacing.couponGap).toBe('20px');
  expect(spacing.articleMargin).toBe('20px');
});
