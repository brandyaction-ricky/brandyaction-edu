import { test, expect, type Page } from '@playwright/test';
import type { Row } from '../../lib/platform';

async function setup(page: Page, options: { conflict?: boolean; uncertain?: boolean } = {}) {
  const stamp='2026-10-01T01:00:00.123456Z';
  const weeks=[{id:'week',course_id:'course-one',week_number:1,title:'회사의 두뇌 만들기',is_published:false}];
  const lessons: Row[]=[{id:'a',week_id:'week',day_number:6,title:'우리 회사 소개하기',is_published:true,updated_at:stamp}, {id:'b',week_id:'week',day_number:8,title:'나만의 프롬프트 만들기',is_published:false,updated_at:stamp}, {id:'c',week_id:'week',day_number:10,title:'실행 결과 정리하기',is_published:true,updated_at:stamp}, {id:'deleted',week_id:'week',day_number:7,title:'삭제된 이전 수업',archived_at:stamp}];
  const writes: Record<string, unknown>[]=[];
  let readError=false;
  await page.route('**/api/platform?**',r=>readError?r.fulfill({status:503,json:{error:'일시 오류'}}):r.fulfill({json:{data:{curriculum_weeks:weeks,curriculum_lessons:lessons,lesson_contents:lessons.map(x=>({lesson_id:x.id,body_text:'합성 시험 본문'}))}}}));
  await page.route('**/api/admin/lesson-order',async r=>{
    const body=r.request().postDataJSON(); writes.push(body);
    if(options.conflict){lessons[1].title='동료가 수정한 수업';return r.fulfill({status:409,json:{error:'다른 곳에서 수업이 변경됐습니다.'}});}
    body.ids.forEach((id:string,index:number)=>{lessons.find(row=>row.id===id)!.day_number=[6,8,10][index];});
    if(options.uncertain){readError=true;return r.abort('failed');}
    return r.fulfill({json:{ok:true,changed:2}});
  });
  await page.goto('/curriculum-editor-test');
  await page.getByRole('button',{name:'AI 문샷 챌린지 커리큘럼 열기'}).click();
  await page.getByRole('region',{name:'1주차 회사의 두뇌 만들기',exact:true}).locator('summary').first().click();
  return {writes,lessons,restoreRead:()=>{readError=false;}};
}
async function open(page:Page) {
  await page.getByRole('button',{name:'회사의 두뇌 만들기 수업 순서 바꾸기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'수업 순서 바꾸기',exact:true});
  await expect(dialog.getByRole('listitem')).toHaveCount(3);return dialog;
}
test('reorder previews cumulative days, supports touch-sized controls, and cancel writes nothing',async({page})=>{
  const h=await setup(page), dialog=await open(page);
  await expect(dialog.getByRole('button',{name:'우리 회사 소개하기 위로',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'실행 결과 정리하기 아래로',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'이 순서로 저장'})).toBeDisabled();
  const down=dialog.getByRole('button',{name:'우리 회사 소개하기 아래로',exact:true});
  const box=await down.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);
  await down.click();await expect(dialog.getByRole('listitem').first()).toContainText('나만의 프롬프트 만들기');
  await expect(dialog.getByRole('listitem').first()).toContainText('현재 2일차 → 1일차');
  await expect(dialog).not.toContainText('삭제된 이전 수업');expect(h.writes).toHaveLength(0);
  await dialog.screenshot({path:test.info().outputPath('lesson-order.png')});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(h.writes).toHaveLength(0);
});
test('save sends the complete expected snapshot once and refreshes outline without changing publication',async({page})=>{
  const h=await setup(page),dialog=await open(page);
  await dialog.getByRole('button',{name:'나만의 프롬프트 만들기 위로'}).click();
  await dialog.getByRole('button',{name:'이 순서로 저장'}).click();
  await expect(dialog.getByRole('status')).toContainText('수업 순서를 저장했습니다.');
  expect(h.writes).toHaveLength(1);expect(h.writes[0]).toMatchObject({courseId:'course-one',weekId:'week',ids:['b','a','c'],expected:[{id:'a',day:6,updatedAt:'2026-10-01T01:00:00.123456Z'},{id:'b',day:8},{id:'c',day:10}]});
  expect(h.lessons[0].is_published).toBe(true);expect(h.lessons[1].is_published).toBe(false);expect(h.lessons[3].day_number).toBe(7);
  await expect(dialog.getByRole('button',{name:'이 순서로 저장'})).toBeDisabled();
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();
  await expect(page.getByRole('button',{name:'1일차 나만의 프롬프트 만들기',exact:true})).toBeVisible();
});
test('stale data reloads latest titles instead of replaying the old order',async({page})=>{
  const h=await setup(page,{conflict:true}),dialog=await open(page);
  await dialog.getByRole('button',{name:'나만의 프롬프트 만들기 위로'}).click();await dialog.getByRole('button',{name:'이 순서로 저장'}).click();
  await expect(dialog.getByRole('alert')).toContainText('다른 곳에서 수업이 변경');
  await expect(dialog).toContainText('동료가 수정한 수업');
  await expect(dialog.getByRole('button',{name:'이 순서로 저장'})).toBeDisabled();expect(h.writes).toHaveLength(1);
});
test('uncertain save disables further changes until current state has been fetched',async({page})=>{
  const h=await setup(page,{uncertain:true}),dialog=await open(page);
  await dialog.getByRole('button',{name:'나만의 프롬프트 만들기 위로'}).click();await dialog.getByRole('button',{name:'이 순서로 저장'}).click();
  await expect(dialog.getByRole('alert')).toContainText('현재 상태를 확인하지 못했습니다');
  await expect(dialog.getByRole('button',{name:'이 순서로 저장'})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'우리 회사 소개하기 위로'})).toBeDisabled();
  h.restoreRead();await dialog.getByRole('button',{name:'저장 상태 다시 확인'}).click();
  await expect(dialog.getByRole('listitem').first()).toContainText('나만의 프롬프트 만들기');
  await expect(dialog.getByRole('alert')).toHaveCount(0);expect(h.writes).toHaveLength(1);
});
test('opening order controls cannot discard the current lesson draft',async({page})=>{
  const h=await setup(page);
  await page.getByRole('button',{name:'1일차 우리 회사 소개하기',exact:true}).click();
  await page.getByRole('textbox',{name:'수업 제목',exact:true}).fill('작성 중인 수업 제목');
  await page.getByRole('button',{name:'회사의 두뇌 만들기 수업 순서 바꾸기',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'수업 순서 바꾸기',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'계속 작성',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('작성 중인 수업 제목');
  expect(h.writes).toHaveLength(0);
});
