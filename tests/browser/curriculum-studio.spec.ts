import { expect,test } from '@playwright/test';
test('compact outline supports contextual creation, preview and protects unsaved lesson content',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-week',course_id:'synthetic-course',week_number:1,title:'기존 합성 주차'}],curriculum_lessons:[{id:'one',week_id:'synthetic-week',day_number:1,title:'첫 학습',content_type:'text'},{id:'two',week_id:'synthetic-week',day_number:2,title:'둘째 학습',content_type:'text'}],lesson_contents:[{lesson_id:'one',body_text:'첫 본문'},{lesson_id:'two',body_text:'두번째 본문'}]}}}));
 await page.goto('/product-sale-test');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await expect(page.locator('.editor-aside')).toBeHidden();await expect(page.getByRole('textbox',{name:'주차 제목',exact:true})).toBeHidden();
 const week=page.getByRole('region',{name:'1주차 기존 합성 주차'});
 await week.getByRole('button',{name:'학습 편집',exact:true}).nth(0).click();await page.getByRole('textbox',{name:'학습 본문'}).fill('수정 중 본문');
 await page.getByRole('button',{name:'학습 내용 미리보기',exact:true}).click();await expect(page.getByRole('region',{name:'학습 내용 미리보기'})).toContainText('수정 중 본문');
 page.once('dialog',d=>d.dismiss());await week.getByRole('button',{name:'학습 편집',exact:true}).nth(1).click();await expect(page.getByRole('textbox',{name:'학습 본문'})).toHaveText('수정 중 본문');
 page.once('dialog',d=>{expect(d.message()).toContain('저장하지 않은');return d.dismiss();});await page.getByRole('button',{name:'목록으로',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'학습 본문'})).toHaveText('수정 중 본문');
 await week.getByRole('button',{name:'＋ 학습 추가'}).click();await expect(week.getByRole('textbox',{name:'새 일차 제목'})).toBeVisible();
 await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('imported block lessons show registered content and open their full editor instead of an empty text field',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-week',course_id:'synthetic-course',week_number:1,title:'가져온 주차',is_published:true}],curriculum_lessons:[{id:'imported',week_id:'synthetic-week',day_number:1,title:'질문과 도구',content_type:'text',has_blocks:true}],lesson_contents:[]}}}));
 await page.goto('/product-sale-test');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 const week=page.getByRole('region',{name:'1주차 가져온 주차'});await expect(week).toContainText('내용 등록됨');await expect(week).not.toContainText('내용 없음');await week.getByRole('button',{name:'학습 편집',exact:true}).click();
 await expect(page.getByRole('link',{name:'학습 구성 편집·미리보기'})).toHaveAttribute('href','/admin/learning-editor?id=imported');await expect(page.getByRole('textbox',{name:'학습 본문'})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'일차 공개'}).check();await page.getByRole('button',{name:'일차 저장',exact:true}).click();await expect(page.getByLabel('합성 커리큘럼 저장 횟수')).toHaveText('1');
 const mutation=JSON.parse(await page.getByLabel('합성 커리큘럼 요청').innerText());expect(mutation).toMatchObject({action:'save',section:'learning',id:'imported',values:{is_published:true}});
});

test('lesson removal uses a confirmation and the recoverable archive action',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-week',course_id:'synthetic-course',week_number:1,title:'보관 검수 주차'}],curriculum_lessons:[{id:'one',week_id:'synthetic-week',day_number:1,title:'보관 검수 학습',content_type:'text'}],lesson_contents:[{lesson_id:'one',body_text:'기록 보존 대상'}]}}}));
 await page.goto('/product-sale-test');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 const week=page.getByRole('region',{name:'1주차 보관 검수 주차'});
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('학습 진도·미션 제출 기록·자료는 지우지 않고 보관');return dialog.accept();});
 await week.getByRole('button',{name:'보관 검수 학습 삭제',exact:true}).click();
 await expect(page.getByLabel('합성 보관 요청')).toContainText('"kind":"lesson"');
 await expect(page.getByLabel('합성 보관 요청')).toContainText('"archived":true');
});

test('new week reuses the lowest active number when only deleted week one remains',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-archived-week',course_id:'synthetic-course',week_number:1,title:'삭제된 첫 주차',archived_at:'2026-09-28T00:00:00Z'}],curriculum_lessons:[],lesson_contents:[]}}}));
 await page.goto('/product-sale-test?archivedFirst=1');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await expect(page.getByText('먼저 주차를 추가해 주세요.')).toBeVisible();
 await page.getByRole('textbox',{name:'새 주차 제목'}).fill('새 첫 주차');
 await page.getByRole('button',{name:'주차 추가'}).click();
 await expect(page.getByLabel('합성 커리큘럼 저장 횟수')).toHaveText('1');
 const body=JSON.parse(await page.getByLabel('합성 커리큘럼 요청').innerText());
 expect(body).toMatchObject({action:'create-curriculum-week',title:'새 첫 주차',courseId:'synthetic-course'});
 expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(body.week_number).toBeUndefined();
});

test('restoring a reused week number asks before moving the archived week',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-active-week',course_id:'synthetic-course',week_number:1,title:'현재 사용 중인 주차'},{id:'synthetic-archived-week',course_id:'synthetic-course',week_number:1,title:'복구할 기존 주차',archived_at:'2026-09-28T00:00:00Z'}],curriculum_lessons:[],lesson_contents:[]}}}));
 await page.goto('/product-sale-test?archiveCollision=1');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await page.locator('.curriculum-archive > summary').click();
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('1주차 번호는 이미 사용 중');expect(dialog.message()).toContain('학습 기록과 연결은 그대로 유지');return dialog.accept();});
 await page.getByRole('button',{name:'주차 복구'}).click();
 await expect(page.getByLabel('합성 보관 시도')).toHaveText('1');
 await expect(page.getByLabel('합성 보관 요청')).toContainText('"reassignOnConflict":true');
});

test('restoring a reused week number can be cancelled without changing it',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-active-week',course_id:'synthetic-course',week_number:1,title:'현재 사용 중인 주차'},{id:'synthetic-archived-week',course_id:'synthetic-course',week_number:1,title:'복구할 기존 주차',archived_at:'2026-09-28T00:00:00Z'}],curriculum_lessons:[],lesson_contents:[]}}}));
 await page.goto('/product-sale-test?archiveCollision=1');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await page.locator('.curriculum-archive > summary').click();
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('1주차 번호는 이미 사용 중');return dialog.dismiss();});
 await page.getByRole('button',{name:'주차 복구'}).click();
 await expect(page.getByRole('button',{name:'주차 복구'})).toBeVisible();
 await expect(page.getByLabel('합성 보관 요청')).toHaveText('null');
});

test('a restore conflict discovered during the request asks before retrying in another free slot',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-archived-week',course_id:'synthetic-course',week_number:1,title:'복구할 기존 주차',archived_at:'2026-09-28T00:00:00Z'}],curriculum_lessons:[],lesson_contents:[]}}}));
 await page.goto('/product-sale-test?archivedFirst=1&restoreRace=1');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await page.locator('.curriculum-archive > summary').click();
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('복구 중 1주차 번호가 다른 주차에 배정');return dialog.accept();});
 await page.getByRole('button',{name:'주차 복구'}).click();
 await expect(page.getByLabel('합성 보관 시도')).toHaveText('2');
 await expect(page.getByLabel('합성 보관 요청')).toContainText('"reassignOnConflict":true');
});
