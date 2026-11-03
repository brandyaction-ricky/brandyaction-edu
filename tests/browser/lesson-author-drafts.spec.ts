import {expect,test,type Page} from '@playwright/test';
import {detailedAuthor} from './helpers/detailed-author';
import type {AuthorPayload} from '../../lib/lesson-author-drafts';
import {backend,id} from './helpers/lesson-author-backend';
test.beforeEach(async({page})=>{await detailedAuthor(page);page.on('dialog',d=>d.accept());});
const save=(page:Page)=>page.getByRole('button',{name:'지금 저장',exact:true});
const publish=(page:Page)=>page.getByRole('button',{name:'학생 화면에 반영',exact:true});
async function open(page:Page){await page.goto('/lesson-block-author-test?serverDraft=1');await expect(save(page)).toBeEnabled();}

test('concurrent changes to different fields save automatically and retain both editors work',async({page})=>{
 const server=await backend(page);await open(page);await page.getByLabel('학생에게 표시할 태그').fill('내 태그');server.get().revision=id(81);server.get().payload.form.basic.title='다른 분의 새 제목';
 await save(page).click();await expect(page.locator('.learning-save-feedback')).toContainText('다른 분의 수정도 함께 보관했습니다.');
 expect(server.get().payload.form.basic.title).toBe('다른 분의 새 제목');expect(server.get().payload.blocks.document.presentation?.tagLabel).toBe('내 태그');await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('다른 분의 새 제목');
 await expect(page.locator('.editor-savebar .dirty-note')).toHaveText('자동저장 완료');
 expect(server.writes.filter(x=>x.action==='save')).toHaveLength(2);expect(server.writes[1].expectedRevision).toBe(id(81));expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('overlapping title edits show both choices and selecting mine preserves later independent edits',async({page})=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('내 제목');server.get().revision=id(81);server.get().payload.form.basic.title='다른 분 제목';
 await save(page).click();const panel=page.getByRole('region',{name:'함께 편집한 내용 비교'});await expect(panel).toContainText('내 제목');await expect(panel).toContainText('다른 분 제목');await expect(panel.getByRole('button',{name:'선택한 내용으로 초안 저장'})).toBeDisabled();
 await panel.getByRole('radio',{name:'내가 작성한 내용'}).check();server.get().revision=id(82);server.get().payload.form.basic.duration_label='30분';await panel.getByRole('button',{name:'선택한 내용으로 초안 저장'}).click();
 await expect(panel).toHaveCount(0);expect(server.get().payload.form.basic.title).toBe('내 제목');expect(server.get().payload.form.basic.duration_label).toBe('30분');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
});

test('another overlapping save during comparison opens a fresh choice instead of overwriting it',async({page})=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('내 제목');server.get().revision=id(81);server.get().payload.form.basic.title='첫 번째 다른 제목';await save(page).click();
 const panel=page.getByRole('region',{name:'함께 편집한 내용 비교'});await panel.getByRole('radio',{name:'내가 작성한 내용'}).check();server.get().revision=id(82);server.get().payload.form.basic.title='또 저장된 새 제목';await panel.getByRole('button',{name:'선택한 내용으로 초안 저장'}).click();
 await expect(panel).toContainText('또 저장된 새 제목');await expect(panel.getByRole('button',{name:'선택한 내용으로 초안 저장'})).toBeDisabled();expect(server.get().payload.form.basic.title).toBe('또 저장된 새 제목');
 await panel.getByRole('radio',{name:'다른 분이 저장한 내용'}).check();await panel.getByRole('button',{name:'선택한 내용으로 초안 저장'}).click();await expect(panel).toHaveCount(0);await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('또 저장된 새 제목');
});

test('typing after a conflict choice never saves the older comparison over new local work',async({page})=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('처음 내 제목');server.get().revision=id(81);server.get().payload.form.basic.title='다른 분 제목';await save(page).click();
 const panel=page.getByRole('region',{name:'함께 편집한 내용 비교'});await panel.getByRole('radio',{name:'내가 작성한 내용'}).check();await page.getByLabel('제목 *',{exact:true}).fill('비교 중 이어 쓴 제목');await panel.getByRole('button',{name:'선택한 내용으로 초안 저장'}).click();
 await expect(panel).toContainText('비교 중 이어 쓴 제목');await expect(panel.getByRole('button',{name:'선택한 내용으로 초안 저장'})).toBeDisabled();expect(server.get().payload.form.basic.title).toBe('다른 분 제목');
 await panel.getByRole('radio',{name:'내가 작성한 내용'}).check();await panel.getByRole('button',{name:'선택한 내용으로 초안 저장'}).click();await expect(panel).toHaveCount(0);expect(server.get().payload.form.basic.title).toBe('비교 중 이어 쓴 제목');
});

test('multiple overlapping fields can be selected together while independent edits remain merged',async({page},info)=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('내 제목');await page.getByLabel('학생에게 표시할 태그').fill('내 태그');server.get().revision=id(81);server.get().payload.form.basic.title='다른 분 제목';server.get().payload.form.basic.duration_label='40분';server.get().payload.blocks.document.presentation={tag:'other',tagLabel:'다른 태그'};
 await save(page).click();const panel=page.getByRole('region',{name:'함께 편집한 내용 비교'});await expect(panel.getByRole('button',{name:'선택한 내용으로 초안 저장'})).toBeDisabled();await panel.getByRole('button',{name:'겹친 부분 모두 내 내용 선택'}).click();await expect(panel.getByRole('button',{name:'선택한 내용으로 초안 저장'})).toBeEnabled();
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('draft-conflict-choices.png')});
 await panel.getByRole('button',{name:'선택한 내용으로 초안 저장'}).click();await expect(panel).toHaveCount(0);expect(server.get().payload.form.basic.title).toBe('내 제목');expect(server.get().payload.blocks.document.presentation?.tagLabel).toBe('내 태그');expect(server.get().payload.form.basic.duration_label).toBe('40분');
});

test('a newer head after an acknowledged save does not falsely block the editor or overwrite the newer work',async({page})=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('내가 저장한 초안');let advanced=false;
 await page.route('**/api/admin/lesson-author**',async route=>{
  if(route.request().method()!=='GET'||!server.writes.length)return route.fallback();
  if(!advanced){advanced=true;server.get().revision=id(88);server.get().payload.form.basic.title='이어서 저장한 최신 초안';}
  await route.fulfill({json:server.get()});
 });
 await save(page).click();await expect(page.locator('.learning-save-feedback')).toContainText('서버에 초안을 저장했습니다.');await expect(save(page)).toBeEnabled();await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('이어서 저장한 최신 초안');expect(server.writes).toHaveLength(1);expect((server.writes[0].payload as AuthorPayload).form.basic.title).toBe('내가 저장한 초안');expect(server.get().payload.form.basic.title).toBe('이어서 저장한 최신 초안');
});

test('the top save button confirms a long unfinished draft beside the button and survives reopening',async({page})=>{
 await page.removeLocatorHandler(page.getByRole('button',{name:'항목별 상세 설정',exact:true}));
 const server=await backend(page);
 server.get().payload.blocks.document.blocks=Array.from({length:51},(_,index)=>({id:`long-${index}`,type:'text',content:`긴 수업 본문 ${index+1}`}));
 server.get().public.payload=structuredClone(server.get().payload);
 await page.goto('/lesson-block-author-test?serverDraft=1&embedded=1');
 const topSave=page.locator('.studio-document-actions').getByRole('button',{name:'지금 저장',exact:true});
 await expect(topSave).toBeEnabled();await page.getByRole('textbox',{name:'수업 제목',exact:true}).fill('');await topSave.click();
 await expect(page.locator('.learning-save-feedback')).toContainText('서버에 초안을 저장했습니다.');
 await expect(page.locator('.learning-save-feedback')).toBeInViewport();
 expect(server.writes.filter(x=>x.action==='save')).toHaveLength(1);expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
 expect(server.get().payload.form.basic.title).toBe('');expect(server.get().payload.blocks.document.blocks).toHaveLength(51);
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'학생 화면에 반영',exact:true}).click();expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('a rejected top save shows its reason beside the button without losing edited text',async({page})=>{
 const server=await backend(page);server.failSave(400);
 await page.goto('/lesson-block-author-test?serverDraft=1&embedded=1');
 const topSave=page.locator('.studio-document-actions').getByRole('button',{name:'지금 저장',exact:true});await expect(topSave).toBeEnabled();
 await page.getByRole('textbox',{name:'수업 제목',exact:true}).fill('지켜야 할 작성 내용');await topSave.click();
 await expect(page.locator('.learning-save-feedback')).toContainText('저장 응답을 확인하지 못했습니다.');await expect(page.locator('.learning-save-feedback')).toBeInViewport();
 await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('지켜야 할 작성 내용');
});

test('an unfinished separately saved quiz does not prevent saving the lesson draft',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test?serverDraft=1&quiz=1');await expect(save(page)).toBeEnabled();
 await page.getByRole('button',{name:'문제 추가',exact:true}).click();await page.getByRole('textbox',{name:'1번 문제',exact:true}).fill('작성 중인 별도 퀴즈');
 await save(page).click();await expect(page.locator('.learning-save-feedback')).toContainText('서버에 초안을 저장했습니다.');
 expect(server.writes.filter(x=>x.action==='save')).toHaveLength(1);expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
 await expect(page.getByRole('textbox',{name:'1번 문제',exact:true})).toHaveValue('작성 중인 별도 퀴즈');
 await publish(page).click();await expect(page.locator('.learning-save-feedback')).toContainText('확인 퀴즈의 변경사항을 먼저 저장');expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('server draft survives reopening and publishes only after explicit action; history restores without changing students',async({page},info)=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('편집한 제목');await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('편집한 제목');await expect(page.getByLabel('기본 정보 저장 횟수')).toHaveText('0');await expect(page.getByLabel('기존 본문 변경 횟수')).toHaveText('0');
 await publish(page).click();await expect(page.getByText('학생 화면에 반영했습니다. 공개 범위는 선택한 설정을 따릅니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.form.basic.title).toBe('편집한 제목');
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByText(/^이전 초안·반영 이력/).click();await page.locator('.lesson-author-history').filter({hasText:'기존 공개본'}).getByRole('button').click();await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('공개된 수업');expect(server.get().public.payload.form.basic.title).toBe('편집한 제목');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.get().public.payload.form.basic.title).toBe('편집한 제목');
 await page.locator('.lesson-publication-panel').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('lesson-draft-history.png'),fullPage:false});
});
test('unfinished questions can be saved and reopened, but cannot be published',async({page})=>{
 const server=await backend(page);await open(page);await page.getByRole('combobox',{name:'추가할 항목'}).selectOption('question');await page.getByRole('button',{name:'항목 추가',exact:true}).click();await page.getByLabel('제목 *',{exact:true}).fill('');await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByLabel('질문 문구')).toHaveValue('');await publish(page).click();expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);expect(server.get().public.payload.blocks.document.blocks).toHaveLength(1);
});
test('lost save response leaves editing available and retry retains the acknowledged version',async({page})=>{
 const server=await backend(page);await open(page);server.failSave(503);await page.getByLabel('제목 *',{exact:true}).fill('응답 전에 저장된 내용');await save(page).click();
 await expect(save(page)).toBeEnabled();await expect(publish(page)).toBeDisabled();await expect(page.locator('.editor-savebar')).toContainText('서버 저장 재시도 대기');
 await save(page).click();await expect(publish(page)).toBeEnabled();expect(server.writes[0].requestId).toBe(server.writes[1].requestId);
 await page.getByLabel('제목 *',{exact:true}).fill('복구 후 이어 쓴 내용');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.get().payload.form.basic.title).toBe('복구 후 이어 쓴 내용');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
});

test('reopening a browser backup restores the unsaved content automatically without a save gate',async({page},info)=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('보관된 편집 제목');await page.getByRole('textbox',{name:'학생에게 표시할 태그'}).fill('보관된 태그');
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByRole('button',{name:'지금 임시저장',exact:true}).click();await page.getByRole('button',{name:'편집 다시 열기'}).click();
 await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('보관된 편집 제목');await expect(page.getByRole('textbox',{name:'학생에게 표시할 태그'})).toHaveValue('보관된 태그');await expect(save(page)).toBeEnabled();
 await expect.poll(()=>server.get().payload.form.basic.title).toBe('보관된 편집 제목');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
 await page.locator('.editor-savebar').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('save-backup-guidance.png')});
});

test('changed publication permits saving but explains the comparison needed before publishing',async({page})=>{
 const server=await backend(page);server.get().revision=id(80);server.get().public.stamp='c'.repeat(32);await page.goto('/lesson-block-author-test?serverDraft=1');await expect(save(page)).toBeEnabled();await expect(publish(page)).toBeDisabled();
 await expect(page.getByText('학생에게 공개된 내용이 다른 곳에서 바뀌었습니다.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'공개본 비교하기'}).click();await page.getByRole('button',{name:'현재 공개본 불러오기',exact:true}).click();
 await expect(save(page)).toBeEnabled();expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
});
test('rejected publication retains acknowledged draft so correcting it does not cause a false conflict',async({page})=>{
 const server=await backend(page);await open(page);server.failPublish(400);await publish(page).click();await expect(page.getByText('파일 연결을 확인해 주세요.',{exact:true})).toBeVisible();await page.getByLabel('제목 *',{exact:true}).fill('수정 후 다시 반영');await publish(page).click();await expect(page.getByText('학생 화면에 반영했습니다. 공개 범위는 선택한 설정을 따릅니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.form.basic.title).toBe('수정 후 다시 반영');
});

test('after recovering the latest server draft, browser backup still restores later unsaved work',async({page})=>{
 const server=await backend(page);await open(page);server.failSave(503);await page.getByLabel('제목 *',{exact:true}).fill('서버에 남은 초안');await save(page).click();await expect(save(page)).toBeEnabled();
 await page.getByText('저장 기록 · 이전 편집본 복구',{exact:true}).click();await page.getByRole('button',{name:'서버 초안 다시 불러오기'}).click();await expect(save(page)).toBeEnabled();
 await page.getByRole('textbox',{name:'학생에게 표시할 태그'}).fill('복구 후 편집');await page.getByRole('button',{name:'지금 임시저장',exact:true}).click();await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByRole('textbox',{name:'학생에게 표시할 태그'})).toHaveValue('복구 후 편집');
});
test('new lesson keeps one stable identity after saving an unfinished server draft',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test?serverDraft=1&new=1');await page.getByRole('combobox',{name:'주차 (Week) *',exact:true}).selectOption(id(5));await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();expect(server.writes[0].create).toBe(true);const identity=server.writes[0].lessonId;await page.getByLabel('제목 *',{exact:true}).fill('새 초안 제목');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.writes[1].lessonId).toBe(identity);expect(server.writes[1].create).toBe(false);expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('continuous document edits remain private in server drafts and retain question identities on publication',async({page})=>{
 await page.removeLocatorHandler(page.getByRole('button',{name:'항목별 상세 설정',exact:true}));
 const server=await backend(page);server.get().payload.blocks.document.blocks.push({id:'existing-question',type:'question',question:{label:'기존 질문',kind:'text',required:true}});server.get().public.payload=structuredClone(server.get().payload);
 await open(page);const document=page.getByRole('textbox',{name:'수업 문서',exact:true});await expect(document).toBeVisible();await document.locator('[data-author-block="original"] p').first().click();await page.keyboard.press('End');await page.keyboard.type(' 이어 쓴 내용');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.get().payload.blocks.document.blocks[0].content).toContain('이어 쓴 내용');expect(server.get().public.payload.blocks.document.blocks[0].content).not.toContain('이어 쓴 내용');
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(document).toContainText('이어 쓴 내용');await publish(page).click();await expect(page.getByText('학생 화면에 반영했습니다. 공개 범위는 선택한 설정을 따릅니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.blocks.document.blocks[1].id).toBe('existing-question');
});
