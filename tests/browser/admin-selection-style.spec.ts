import { expect, test } from '@playwright/test';

test('question and marketing selections use the shared admin accent without changing status colours', async ({ page }) => {
  await page.setContent(`
    <main class="adm edu-admin">
      <nav class="question-state-tabs"><button aria-pressed="true">답변 대기</button><button aria-pressed="false">답변 완료</button></nav>
      <button class="question-inbox-item" aria-pressed="true">선택된 질문</button>
      <button class="pill active" aria-pressed="true">전체 주차</button>
      <div class="marketing-workspace"><nav><a aria-current="page" href="#">광고 결과</a></nav></div>
      <span class="admin-status-badge admin-status-badge--success">완료</span>
      <span class="admin-status-badge admin-status-badge--warning">확인 필요</span>
    </main>
  `);
  await page.addStyleTag({ path: 'features/admin-ui/styles/admin-system.css' });
  await page.addStyleTag({ path: 'app/ui/marketing-workspace.css' });

  const primary = 'rgb(201, 35, 45)';
  await expect(page.getByRole('button', { name: '답변 대기' })).toHaveCSS('border-bottom-color', primary);
  await expect(page.getByRole('button', { name: '선택된 질문' })).toHaveCSS('background-color', 'rgb(255, 240, 241)');
  await expect(page.getByRole('link', { name: '광고 결과' })).toHaveCSS('background-color', primary);
  await expect(page.getByRole('button', { name: '전체 주차' })).toHaveCSS('background-color', primary);
  await expect(page.getByText('완료', { exact: true }).last()).toHaveCSS('color', 'rgb(23, 99, 69)');
  await expect(page.getByText('확인 필요')).toHaveCSS('color', 'rgb(134, 86, 0)');

  await page.getByRole('button', { name: '답변 대기' }).focus();
  await expect(page.getByRole('button', { name: '답변 대기' })).toHaveCSS('outline-color', primary);
});
