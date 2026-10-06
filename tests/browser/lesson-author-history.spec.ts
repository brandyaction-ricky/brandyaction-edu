import {test,expect} from '@playwright/test';
import {backend,id} from './helpers/lesson-author-backend';
import {detailedAuthor} from './helpers/detailed-author';

test('manual checkpoints carry notes; autosave stays private; older records are reachable',async({page},testInfo)=>{
 const server=await backend(page);await detailedAuthor(page);await page.goto('/lesson-block-author-test?serverDraft=1');
 await page.getByLabel('제목 *',{exact:true}).fill('수업 보완');await expect.poll(()=>server.writes.filter(w=>w.saveSource==='autosave').length).toBeGreaterThan(0);
 await page.getByText('저장 메모 남기기 (선택)',{exact:true}).click();await page.getByLabel('이번 수정 메모').fill('설치 안내 완성');await page.getByRole('button',{name:'지금 저장',exact:true}).click();
 await expect.poll(()=>server.writes.some(w=>w.saveSource==='manual'&&w.saveNote==='설치 안내 완성')).toBe(true);expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByText('이전 초안·반영 이력',{exact:true}).click();
 await expect(page.locator('.author-history-browser')).toContainText('설치 안내 완성');await expect(page.locator('.author-history-browser')).toContainText('직접 저장');
 for(let n=0;n<42;n++)server.get().history.push({revision:id(100+n),createdAt:new Date(Date.UTC(2026,8,30,10,0,42-n)).toISOString(),title:'이전 편집 '+n,baseline:false,published:false,...{source:'autosave',createdBy:id(1),editor:'테스트 관리자',note:''}});
 await page.getByLabel('기록 종류').selectOption('all');await page.getByRole('button',{name:'기록 찾기'}).click();await expect(page.getByRole('button',{name:'이전 기록 더 보기'})).toBeVisible();
 await page.getByRole('button',{name:'이전 기록 더 보기'}).click();await expect(page.locator('.author-history-browser')).toContainText('마지막 기록까지');
 await page.locator('.author-history-browser').scrollIntoViewIfNeeded();
 await page.locator('.author-history-browser').screenshot({path:testInfo.outputPath('curriculum-history.png')});
 await page.getByText(/^자동저장 42회/).click();await expect(page.locator('.author-history-browser')).toContainText('이전 편집 41');
 await page.getByLabel('편집자',{exact:true}).fill('없는 관리자');await page.getByRole('button',{name:'기록 찾기'}).click();await expect(page.locator('.author-history-browser')).toContainText('조건에 맞는 기록이 없습니다');
 expect(server.writes.some(w=>w.action==='publish')).toBe(false);
});

test('manual save after an uncertain autosave preserves its request and the unsaved note',async({page})=>{
 const server=await backend(page);await detailedAuthor(page);await page.goto('/lesson-block-author-test?serverDraft=1');server.failSave(503);
 await page.getByLabel('제목 *',{exact:true}).fill('응답이 끊긴 자동저장');await expect.poll(()=>server.writes.length).toBe(1);await expect(page.getByRole('button',{name:'지금 저장',exact:true})).toBeEnabled();
 await page.getByText('저장 메모 남기기 (선택)',{exact:true}).click();await page.getByLabel('이번 수정 메모').fill('최종 확인');await page.getByRole('button',{name:'지금 저장',exact:true}).click();
 await expect(page.getByText('이전 자동저장을 복구했습니다.',{exact:false})).toBeVisible();expect(server.writes[1].requestId).toBe(server.writes[0].requestId);expect(server.writes[1].saveSource).toBe('autosave');await expect(page.getByLabel('이번 수정 메모')).toHaveValue('최종 확인');
 await page.getByRole('button',{name:'지금 저장',exact:true}).click();await expect.poll(()=>server.writes.some(w=>w.saveSource==='manual'&&w.saveNote==='최종 확인')).toBe(true);await expect(page.getByLabel('이번 수정 메모')).toHaveValue('');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
});

test('failed history fetch preserves editor and retries without a save or publication',async({page})=>{
 const server=await backend(page);await detailedAuthor(page);await page.goto('/lesson-block-author-test?serverDraft=1');let fail=true;
 await page.route('**/api/admin/lesson-author?**',async route=>{if(new URL(route.request().url()).searchParams.get('history')==='1'&&fail){fail=false;await route.fulfill({status:503,json:{error:'기록 서버 연결 실패'}});}else await route.fallback();});
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByText('이전 초안·반영 이력',{exact:true}).click();await expect(page.getByRole('alert')).toContainText('기록 서버 연결 실패');
 await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await expect(page.locator('.author-history-browser')).toContainText('조건에 맞는 기록이 없습니다');expect(server.writes).toHaveLength(0);
});

test('history restore waits until the in-flight autosave finishes',async({page})=>{
 const server=await backend(page);await detailedAuthor(page);await page.goto('/lesson-block-author-test?serverDraft=1');await page.getByRole('button',{name:'지금 저장',exact:true}).click();
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByText('이전 초안·반영 이력',{exact:true}).click();await expect(page.getByRole('button',{name:'이 내용 불러오기'}).first()).toBeEnabled();
 const resume=server.pauseNextSave();await page.getByLabel('제목 *',{exact:true}).fill('전송 중인 내용');await expect.poll(()=>server.writes.some(w=>w.saveSource==='autosave')).toBe(true);
 await expect(page.getByRole('button',{name:'이 내용 불러오기'}).first()).toBeDisabled();resume();await expect(page.getByRole('button',{name:'이 내용 불러오기'}).first()).toBeEnabled();
});
