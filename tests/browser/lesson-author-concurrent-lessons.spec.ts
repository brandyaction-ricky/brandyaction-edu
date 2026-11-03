import {test,expect,type Page} from '@playwright/test';
import {backend,id} from './helpers/lesson-author-backend';

test('one administrator can save day 16 while day 1 is still saving in another tab',async({page})=>{
 const other=await page.context().newPage();
 const first=await backend(page),second=await backend(other,{lessonId:id(16),day:16});
 const release=first.pauseNextSave();
 try{
  await Promise.all([page.goto('/lesson-block-author-test?serverDraft=1&embedded=1'),other.goto('/lesson-block-author-test?serverDraft=1&embedded=1&day=16')]);
  const title=(p:Page)=>p.getByRole('textbox',{name:'수업 제목',exact:true});
  const save=(p:Page)=>p.locator('.studio-document-actions').getByRole('button',{name:'지금 저장',exact:true});
  await title(page).fill('1일차에서 작성한 초안');await save(page).click();
  await expect.poll(()=>first.writes.filter(w=>w.action==='save').length).toBe(1);
  await title(other).fill('16일차에서 작성한 초안');await save(other).click();
  await expect(other.locator('.learning-save-feedback')).toContainText('서버에 초안을 저장했습니다.');
  await expect(save(page)).toBeDisabled();await expect(title(page)).toHaveValue('1일차에서 작성한 초안');
  release();await expect(page.locator('.learning-save-feedback')).toContainText('서버에 초안을 저장했습니다.');
  expect(first.writes.filter(w=>w.action==='save').every(w=>w.lessonId===id(4))).toBe(true);
  expect(second.writes.filter(w=>w.action==='save').every(w=>w.lessonId===id(16))).toBe(true);
  expect([...first.writes,...second.writes].some(w=>w.action==='publish')).toBe(false);
  await Promise.all([page.getByRole('button',{name:'편집 다시 열기'}).click(),other.getByRole('button',{name:'편집 다시 열기'}).click()]);
  await expect(title(page)).toHaveValue('1일차에서 작성한 초안');await expect(title(other)).toHaveValue('16일차에서 작성한 초안');
 }finally{release();await other.close();}
});
