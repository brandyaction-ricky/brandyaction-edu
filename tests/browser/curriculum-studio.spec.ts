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
