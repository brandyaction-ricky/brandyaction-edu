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

test('lesson removal uses a confirmation and the recoverable archive action',async({page})=>{
 await page.route('**/api/platform?**part=curriculum',r=>r.fulfill({json:{data:{curriculum_weeks:[{id:'synthetic-week',course_id:'synthetic-course',week_number:1,title:'보관 검수 주차'}],curriculum_lessons:[{id:'one',week_id:'synthetic-week',day_number:1,title:'보관 검수 학습',content_type:'text'}],lesson_contents:[{lesson_id:'one',body_text:'기록 보존 대상'}]}}}));
 await page.goto('/product-sale-test');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 const week=page.getByRole('region',{name:'1주차 보관 검수 주차'});
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('학습 진도·미션 제출 기록·자료는 지우지 않고 보관');return dialog.accept();});
 await week.getByRole('button',{name:'보관 검수 학습 삭제',exact:true}).click();
 await expect(page.getByLabel('합성 보관 요청')).toContainText('"kind":"lesson"');
 await expect(page.getByLabel('합성 보관 요청')).toContainText('"archived":true');
});
