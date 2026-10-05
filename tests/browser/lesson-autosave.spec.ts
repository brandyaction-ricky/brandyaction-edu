import {test,expect,type Page} from '@playwright/test';
import {backend,id} from './helpers/lesson-author-backend';
import {detailedAuthor} from './helpers/detailed-author';
async function open(page:Page){await detailedAuthor(page);await page.goto('/lesson-block-author-test?serverDraft=1');await expect(page.getByRole('button',{name:'지금 저장',exact:true})).toBeEnabled();}
const title=(page:Page)=>page.getByLabel('제목 *',{exact:true});

test('typing saves to the server without a click, leaves students unchanged and continues editing',async({page})=>{
 const server=await backend(page);await open(page);
 await title(page).fill('자동으로 보관할 제목');await expect.poll(()=>server.get().payload.form.basic.title).toBe('자동으로 보관할 제목');
 await expect(page.locator('.editor-savebar')).toContainText('자동저장 완료');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
 await title(page).fill('두 번째 입력');await expect.poll(()=>server.get().payload.form.basic.title).toBe('두 번째 입력');
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(title(page)).toHaveValue('두 번째 입력');
});

test('each block edit triggers autosave, including edits after the first dirty change',async({page})=>{
 const server=await backend(page);await open(page);const tag=page.getByLabel('학생에게 표시할 태그');
 await tag.fill('첫 자동저장');await expect.poll(()=>server.get().payload.blocks.document.presentation?.tagLabel).toBe('첫 자동저장');
 await tag.fill('두 번째 자동저장');await expect.poll(()=>server.get().payload.blocks.document.presentation?.tagLabel).toBe('두 번째 자동저장');
});

test('separate simultaneous edits merge; overlapping edits save both versions without publishing',async({page})=>{
 const server=await backend(page);await open(page);await title(page).fill('내 제목');
 server.get().revision=id(81);server.get().payload.form.basic.duration_label='동료의 25분';
 await expect.poll(()=>server.get().payload.form.basic.title).toBe('내 제목');expect(server.get().payload.form.basic.duration_label).toBe('동료의 25분');
 await title(page).fill('내 두 번째 제목');server.get().revision=id(82);server.get().payload.form.basic.title='동료 두 번째 제목';
 await expect(page.getByRole('region',{name:'함께 편집한 내용 비교'})).toBeVisible();
 expect(server.writes.some(x=>x.action==='backup'&&(x.payload as {form:{basic:{title:string}}}).form.basic.title==='내 두 번째 제목')).toBe(true);
 expect(server.get().payload.form.basic.title).toBe('동료 두 번째 제목');await expect(title(page)).toHaveValue('내 두 번째 제목');
 await expect(page.getByRole('button',{name:'지금 저장',exact:true})).toBeEnabled();
 expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('lost response retries the same request and preserves typing during recovery',async({page})=>{
 const server=await backend(page);await open(page);server.failSave(503);await title(page).fill('첫 요청');
 await expect.poll(()=>server.writes.filter(x=>x.action==='save').length).toBe(1);await title(page).fill('응답이 끊긴 뒤 이어 쓴 내용');
 await expect.poll(()=>server.get().payload.form.basic.title,{timeout:16000}).toBe('응답이 끊긴 뒤 이어 쓴 내용');
 const writes=server.writes.filter(x=>x.action==='save');expect(writes[0].requestId).toBe(writes[1].requestId);
 await expect(title(page)).toHaveValue('응답이 끊긴 뒤 이어 쓴 내용');
});

test('a stale browser backup is recovered without locking save or losing newer server fields',async({page})=>{
 const server=await backend(page);await open(page);await title(page).fill('브라우저에 남은 내 제목');
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByRole('button',{name:'지금 임시저장',exact:true}).click();
 server.get().revision=id(83);server.get().payload.form.basic.duration_label='새 서버 소요시간';
 await page.getByRole('button',{name:'편집 다시 열기'}).click();
 await expect(title(page)).toHaveValue('브라우저에 남은 내 제목');await expect(page.getByLabel(/소요 시간/)).toHaveValue('새 서버 소요시간');
 await expect.poll(()=>server.get().payload.form.basic.title).toBe('브라우저에 남은 내 제목');
 expect(server.get().payload.form.basic.duration_label).toBe('새 서버 소요시간');
});

test('changing the public lesson does not block backing up new text',async({page})=>{
 const server=await backend(page);server.get().revision=id(80);server.get().public.stamp='c'.repeat(32);await open(page);
 await title(page).fill('공개 설정이 바뀌어도 내 작업 보관');
 await expect.poll(()=>server.writes.some(x=>x.action==='backup')).toBe(true);
 await expect(title(page)).toHaveValue('공개 설정이 바뀌어도 내 작업 보관');
 expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('typing during an in-flight autosave remains editable and is saved after the acknowledgement',async({page})=>{
 const server=await backend(page);await open(page);const resume=server.pauseNextSave();await title(page).fill('전송 중인 제목');
 await expect.poll(()=>server.writes.filter(x=>x.action==='save').length).toBe(1);await expect(title(page)).toBeEnabled();await title(page).fill('전송 중에도 이어 쓴 제목');resume();
 await expect.poll(()=>server.get().payload.form.basic.title,{timeout:10000}).toBe('전송 중에도 이어 쓴 제목');await expect(title(page)).toHaveValue('전송 중에도 이어 쓴 제목');
});

test('two real editor tabs save independent changes without overwriting either author',async({page,context})=>{
 const server=await backend(page);await open(page);const second=await context.newPage();await server.attach(second);await open(second);
 await title(page).fill('첫 창의 제목');await second.getByLabel('학생에게 표시할 태그').fill('둘째 창의 태그');
 await expect.poll(()=>server.get().payload.form.basic.title).toBe('첫 창의 제목');await expect.poll(()=>server.get().payload.blocks.document.presentation?.tagLabel).toBe('둘째 창의 태그');
 expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);await second.close();
});

test('lost response after merging another editor preserves both changes on retry',async({page})=>{
 const server=await backend(page);await open(page);server.get().revision=id(85);server.get().payload.form.basic.duration_label='다른 분의 시간';server.failSave(503);
 await title(page).fill('내 저장 제목');await expect.poll(()=>server.writes.filter(x=>x.action==='save').length).toBe(2);await title(page).fill('재시도 전에 이어 쓴 제목');
 await expect.poll(()=>server.get().payload.form.basic.title,{timeout:18000}).toBe('재시도 전에 이어 쓴 제목');expect(server.get().payload.form.basic.duration_label).toBe('다른 분의 시간');
 await expect(page.getByLabel(/소요 시간/)).toHaveValue('다른 분의 시간');expect(server.writes[1].requestId).toBe(server.writes[2].requestId);
});

test('offline text is recovered after reopening and saved when the connection returns',async({page})=>{
 const server=await backend(page);await open(page);let offline=true;
 await page.route('**/api/admin/lesson-author**',route=>route.request().method()==='POST'&&offline?route.abort('internetdisconnected'):route.fallback());
 await title(page).fill('인터넷 없이 쓴 수업');await expect(page.locator('.editor-savebar')).toContainText('서버 저장 재시도 대기');
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(title(page)).toHaveValue('인터넷 없이 쓴 수업');offline=false;
 await expect.poll(()=>server.get().payload.form.basic.title,{timeout:16000}).toBe('인터넷 없이 쓴 수업');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
});

test('browser storage failure is visible without opening history and server saving continues',async({page})=>{
 const server=await backend(page);await open(page);await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
 await title(page).fill('브라우저 보관 불가 시 서버 저장');await expect(page.getByRole('alert')).toContainText('브라우저 보관에 실패했습니다.');
 await expect.poll(()=>server.get().payload.form.basic.title).toBe('브라우저 보관 불가 시 서버 저장');await expect(page.locator('.editor-savebar')).toContainText('자동저장 완료');
});
