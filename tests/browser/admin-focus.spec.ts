import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectFocused(page: Page, target: Locator) {
  // Check immediately after the key; a second Tab or a delayed recovery must
  // not hide a transient escape to BODY (the reported regression).
  expect(await target.evaluate(element => element === document.activeElement)).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
}
async function boundaryCycle(page: Page, first: Locator, last: Locator) {
  await last.focus(); await page.keyboard.press('Tab'); await expectFocused(page,first);
  await page.keyboard.press('Shift+Tab'); await expectFocused(page,last);
}
async function locked(page: Page, value: string) { expect(await page.evaluate(()=>document.body.style.overflow)).toBe(value); }

test.beforeEach(async({page})=>{await page.goto('/admin/landing');await expect(page.getByRole('combobox',{name:'캠페인',exact:true})).toHaveValue('bbbbbbbb-bbbb-4000-8000-000000000002');});

test('campaign final input wraps immediately in both directions; Escape restores opener and scrolling',async({page})=>{
  const opener=page.getByRole('region',{name:'무료클래스 조회 조건'}).getByRole('button',{name:'캠페인 설정',exact:true});
  await opener.click(); const dialog=page.getByRole('dialog',{name:'캠페인 설정',exact:true});
  await locked(page,'hidden'); await expect(dialog.getByRole('button',{name:'설정 저장',exact:true})).toBeDisabled();
  for(let i=0;i<3;i++) await boundaryCycle(page,dialog.getByRole('button',{name:'닫기',exact:true}),dialog.getByRole('textbox',{name:/^Meta 캠페인 ID/}));
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expectFocused(page,opener);await locked(page,'auto');
});

test('campaign unsaved confirm alone traps keys; Escape returns to drawer; discard restores opener',async({page})=>{
  const opener=page.getByRole('region',{name:'무료클래스 조회 조건'}).getByRole('button',{name:'캠페인 설정',exact:true});
  await opener.click();const drawer=page.getByRole('dialog',{name:'캠페인 설정',exact:true});
  await drawer.getByRole('textbox',{name:'캠페인명',exact:true}).fill('미저장 변경');await expect(drawer.getByRole('button',{name:'설정 저장',exact:true})).toBeEnabled();
  await drawer.getByRole('button',{name:'닫기',exact:true}).click();const confirm=page.getByRole('dialog',{name:'저장하지 않은 변경사항',exact:true});
  await boundaryCycle(page,confirm.getByRole('button',{name:'닫기',exact:true}),confirm.getByRole('button',{name:'변경사항 버리기',exact:true}));
  await page.keyboard.press('Escape');await expect(confirm).not.toBeVisible();await expectFocused(page,drawer.getByRole('button',{name:'닫기',exact:true}));await locked(page,'hidden');
  await drawer.getByRole('button',{name:'닫기',exact:true}).click();await confirm.getByRole('button',{name:'변경사항 버리기',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await expectFocused(page,opener);await locked(page,'auto');
});

for(const editing of [false,true]) test(`actual ${editing?'edit':'add'} drawer and nested unsaved confirm preserve focus`,async({page})=>{
  const opener=editing?page.getByRole('button',{name:/실측 기록 수정$/}):page.getByRole('button',{name:'실측 기록 추가',exact:true});
  await opener.click();const drawer=page.getByRole('dialog',{name:editing?'실측 기록 수정':'실측 기록 추가',exact:true});
  const submit=drawer.getByRole('button',{name:editing?'부분 저장':'실측 기록 저장',exact:true});await expect(submit).toBeEnabled();
  await boundaryCycle(page,drawer.getByRole('button',{name:'닫기',exact:true}),submit);
  await drawer.getByRole('textbox',{name:'메모',exact:true}).fill('저장하지 않는 포커스 검증');
  await drawer.getByRole('button',{name:'닫기',exact:true}).click();const confirm=page.getByRole('dialog',{name:'저장하지 않은 변경사항',exact:true});
  await boundaryCycle(page,confirm.getByRole('button',{name:'닫기',exact:true}),confirm.getByRole('button',{name:'변경사항 버리기',exact:true}));
  await page.keyboard.press('Escape');await expect(confirm).not.toBeVisible();await expectFocused(page,drawer.getByRole('button',{name:'닫기',exact:true}));await locked(page,'hidden');
  await drawer.getByRole('button',{name:'닫기',exact:true}).click();await confirm.getByRole('button',{name:'변경사항 버리기',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await expectFocused(page,opener);await locked(page,'auto');
});

test('hidden/disabled/inert/negative tabindex controls are excluded and dynamic endpoints are recomputed',async({page})=>{
  await page.getByRole('button',{name:'경계 조건 Drawer',exact:true}).click();const dialog=page.getByRole('dialog',{name:'경계 조건',exact:true});
  const first=dialog.getByRole('button',{name:'닫기',exact:true}),input=dialog.getByRole('textbox',{name:'마지막 입력',exact:true});
  await boundaryCycle(page,first,input);
  await dialog.getByRole('button',{name:'활성 요소 전환',exact:true}).click();await boundaryCycle(page,first,dialog.getByRole('button',{name:'동적 마지막 버튼',exact:true}));
  await dialog.getByRole('button',{name:'활성 요소 전환',exact:true}).click();await boundaryCycle(page,first,input);
});

test('nested modal Escape closes only the top layer; simultaneous unmount restores original trigger',async({page})=>{
  const opener=page.getByRole('button',{name:'경계 조건 Drawer',exact:true});await opener.click();const drawer=page.getByRole('dialog',{name:'경계 조건',exact:true});
  const launch=drawer.getByRole('button',{name:'중첩 확인',exact:true});await launch.click();const confirm=page.getByRole('dialog',{name:'중첩 확인',exact:true});
  await boundaryCycle(page,confirm.getByRole('button',{name:'닫기',exact:true}),confirm.getByRole('button',{name:'확인',exact:true}));
  await page.keyboard.press('Escape');await expect(confirm).not.toBeVisible();await expectFocused(page,launch);await locked(page,'hidden');
  await launch.click();await confirm.getByRole('button',{name:'확인',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expectFocused(page,opener);await locked(page,'auto');
});
