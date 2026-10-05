import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { withExistingCohortVisibility } from './fixture/cohort-visibility';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const context = { enrollmentId:id(1),lessonId:id(4),label:'막힌 화면 따라하기',recent:true };
async function backend(page: Page, {fail = false, forbidden = false, contextFails = false} = {}) {
  const bodies: Record<string,unknown>[] = []; let platformReads = 0, questionReads = 0;
  await page.route('**/api/platform?**',route => { platformReads++; return route.fulfill({json:{user:{id:id(99),role:'student',full_name:'검수 회원',email:'synthetic@example.test'},support:{},data:withExistingCohortVisibility({
    enrollments:[{id:id(1),course_id:id(2),cohort_id:id(3),status:'active'}],courses:[{id:id(2),title:'합성 학습 과정'}],cohorts:[{id:id(3),course_id:id(2),name:'합성 4기'}],
    curriculum_weeks:[{id:id(5),course_id:id(2),title:'질문 연습',week_number:1,is_published:true}],curriculum_lessons:[{id:id(4),week_id:id(5),day_number:1,title:context.label,is_published:true}],lesson_contents:[{lesson_id:id(4),body_text:'보고 있던 학습 본문\n\n'+('수업 내용\n'.repeat(60))}],lesson_progress:[],
  })}}); });
  await page.route('**/api/platform/lesson-questions?**',route => {questionReads++; return route.fulfill({json:{questions:bodies.length && !fail && !forbidden ? [{id:id(9),title:'등록한 질문',content:'막힌 부분입니다',status:'open'}] : [],hasMore:false}});});
  await page.route('**/api/platform/question-hub**',route => {
    if(route.request().method()==='POST'){bodies.push(route.request().postDataJSON());return route.fulfill(forbidden ? {status:403,json:{error:'질문 작성 권한을 확인해 주세요.'}} : fail && bodies.length===1 ? {status:503,json:{error:'등록 결과 확인 실패'}} : {json:{question:{id:id(9)}}});}
    const mode=new URL(route.request().url()).searchParams.get('mode');
    return route.fulfill(mode==='contexts' ? contextFails ? {status:503,json:{error:'합성 목록 실패'}} : {json:{contexts:[context]}} : {json:{answers:[]}});
  });
  return {bodies,reads:()=>({platformReads,questionReads})};
}
async function open(page: Page) { await page.goto('/learning-question-test'); await page.getByRole('button',{name:'질문·답변',exact:true}).click(); return page.getByRole('dialog',{name:'이 수업에 질문하기'}); }
test('real learning header opens a focused quick composer without leaving or remounting the lesson',async({page},info)=>{
  const h=await backend(page);const dialog=await open(page);const start=page.url(),reads=h.reads().platformReads;
  await expect(dialog).toBeVisible();await expect(dialog.locator('.learning-question-context')).toContainText(context.label);
  await expect(dialog.getByRole('textbox',{name:'질문 내용',exact:true})).toBeFocused();await expect(dialog.getByRole('textbox',{name:'질문 제목 (선택)',exact:true})).toBeHidden();
  await expect(dialog.getByRole('button',{name:'질문 등록',exact:true})).toBeDisabled();
  await dialog.getByRole('textbox',{name:'질문 내용',exact:true}).fill('막힌 부분입니다');await dialog.getByRole('radio',{name:'비밀 질문',exact:true}).check();
  await expect(dialog.getByRole('button',{name:'질문 등록',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('learning-question-popup.png')});
  await dialog.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(dialog.getByRole('heading',{name:'질문을 등록했어요'})).toBeVisible();
  expect(h.bodies[0]).toMatchObject({enrollmentId:id(1),lessonId:id(4),content:'막힌 부분입니다',title:'',visibility:'private'});
  await dialog.getByRole('button',{name:'학습 계속하기'}).click();await expect(dialog).toHaveCount(0);expect(page.url()).toBe(start);expect(h.reads().platformReads).toBe(reads);
  await expect(page.getByRole('button',{name:'질문·답변',exact:true})).toBeFocused();await expect(page.getByRole('heading',{name:'등록한 질문'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Escape and close preserve an unsent question when discard is cancelled',async({page})=>{
  await backend(page);const dialog=await open(page);await dialog.getByRole('textbox',{name:'질문 내용',exact:true}).fill('아직 작성 중입니다');
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue('아직 작성 중입니다');
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'질문·답변',exact:true})).toBeFocused();
});
test('uncertain registration stays open and retries the same request without duplicates',async({page})=>{
  const h=await backend(page,{fail:true});const dialog=await open(page);await dialog.getByRole('textbox',{name:'질문 내용',exact:true}).fill('등록 결과가 궁금합니다');await dialog.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('등록 결과 확인 실패');
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByText('질문 등록·첨부가 끝날 때까지', {exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'등록 결과 다시 확인'}).click();expect(h.bodies).toHaveLength(2);expect(h.bodies[1]).toEqual(h.bodies[0]);await expect(dialog.getByRole('heading',{name:'질문을 등록했어요'})).toBeVisible();
});
test('context lookup or permission failure does not erase the draft or announce success',async({page})=>{
  await backend(page,{forbidden:true,contextFails:true});const dialog=await open(page);await expect(dialog.getByText('학습 목록을 불러오지 못했습니다.', {exact:false})).toBeVisible();await dialog.getByRole('textbox',{name:'질문 내용',exact:true}).fill('질문 작성 내용');await dialog.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('질문 작성 권한');await expect(dialog.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue('질문 작성 내용');await expect(dialog.getByRole('heading',{name:'질문을 등록했어요'})).toHaveCount(0);
});
test('keyboard focus stays inside the popup and background scroll is restored',async({page})=>{
  await backend(page);const dialog=await open(page);const before=await page.evaluate(()=>window.scrollY);await expect(page.locator('body')).toHaveCSS('overflow','hidden');
  const close=dialog.getByRole('button',{name:'닫기',exact:true});await close.focus();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('radio',{name:'비밀 질문',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');expect(await page.evaluate(()=>window.scrollY)).toBe(before);
});
test('screenshot attachment opens the file picker and registers an image-only question in the current lesson',async({page})=>{
  const h=await backend(page);let image='';
  await page.route('**/api/platform/question-images',route=>{const body=route.request().postDataJSON();if(body.action==='prepare'){image=body.requestId;expect(body).toMatchObject({enrollmentId:id(1),lessonId:id(4)});return route.fulfill({json:{id:image,signedUrl:'https://storage.test/quick-question'}});}return route.fulfill({json:{id:image}});});
  await page.route('https://storage.test/quick-question',route=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''}));
  const dialog=await open(page);const chooser=page.waitForEvent('filechooser');
  await dialog.getByRole('button',{name:'사진·화면 캡처 첨부',exact:true}).click();
  await (await chooser).setFiles({name:'화면.png',mimeType:'image/png',buffer:readFileSync('public/brandy-action-logo.png')});
  await expect(dialog.getByText('이미지 준비 완료. 질문을 등록하면 함께 저장됩니다.')).toBeVisible();
  await dialog.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(dialog.getByRole('heading',{name:'질문을 등록했어요'})).toBeVisible();
  expect(h.bodies[0]).toMatchObject({enrollmentId:id(1),lessonId:id(4),content:'',imageId:image});
});
