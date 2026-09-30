import {test,expect,type Page} from '@playwright/test';
import type {Row} from '../../lib/platform';

async function setup(page:Page, options:{failParent?:boolean; uncertain?:boolean}={}) {
 const stamp='2026-09-30T01:00:00Z';
 const weeks:Row[]=[{id:'w0',course_id:'course-one',week_number:0,title:'온보딩',is_published:true,updated_at:stamp},{id:'w1',course_id:'course-one',week_number:1,title:'AI 업무 시작',is_published:false,updated_at:stamp},{id:'w2',course_id:'course-one',week_number:2,title:'업무 자동화',is_published:false,updated_at:stamp},{id:'archived',course_id:'course-one',week_number:1,title:'이전 시작 주차',archived_at:stamp,is_published:false,updated_at:stamp}];
 const lessons:Row[]=[{id:'a',week_id:'w0',day_number:1,title:'학습 준비',is_published:true,content_type:'text',updated_at:stamp},{id:'b',week_id:'w1',day_number:2,title:'나의 첫 프롬프트',is_published:true,is_preview:true,content_type:'text',updated_at:stamp},{id:'c',week_id:'w1',day_number:3,title:'내 업무 정리',is_published:false,content_type:'text',updated_at:stamp},{id:'empty',week_id:'w2',day_number:4,title:'아직 작성 전',is_published:false,content_type:'text',updated_at:stamp}];
 const contents=lessons.filter(x=>x.id!=='empty').map(x=>({lesson_id:x.id,body_text:'검수용 학습 본문'}));
 const writes:Record<string,unknown>[]=[];
 let failed=false,readFailure=false;
 await page.route('**/api/platform?**',r=>readFailure?r.fulfill({status:503,json:{error:'조회 일시 중단'}}):r.fulfill({json:{data:{curriculum_weeks:weeks,curriculum_lessons:lessons,lesson_contents:contents}}}));
 await page.route('**/studio-save',async r=>{
  const body=r.request().postDataJSON();writes.push(body);
  if(body.section==='weeks'&&body.id==='w1'&&options.failParent&&!failed){failed=true;readFailure=!!options.uncertain;return r.fulfill({status:409,json:{error:'주차 저장 실패'}});}
  if(body.action==='reorder-weeks')body.ids.forEach((id:string,index:number)=>{weeks.find(w=>w.id===id)!.week_number=index;});
  else if(body.action==='set-curriculum-archive'){const row=weeks.find(w=>w.id===body.id)!;row.archived_at=null;row.week_number=3;row.is_published=false;}
  else {const row=(body.section==='weeks'?weeks:lessons).find(x=>x.id===body.id)!;Object.assign(row,body.values,{updated_at:'2026-09-30T02:00:00Z'});}
  return r.fulfill({json:{ok:true}});
 });
 await page.goto('/curriculum-editor-test');
 await page.getByRole('button',{name:'AI 문샷 챌린지 커리큘럼 열기'}).click();
 await expect(page.getByRole('button',{name:'공개 범위 확인',exact:true})).toBeEnabled();
 return {writes,weeks,lessons,restoreReads:()=>{readFailure=false;}};
}
async function visibility(page:Page){await page.getByRole('button',{name:'공개 범위 확인',exact:true}).click();return page.getByRole('dialog',{name:'수업 공개 범위'});}

test('publication previews inherited visibility and preserves unrelated/private and free-preview settings',async({page},info)=>{
 const h=await setup(page),dialog=await visibility(page);
 await expect(dialog.getByRole('checkbox',{name:/아직 작성 전/})).toBeDisabled();
 await dialog.getByRole('checkbox',{name:'1주차 · AI 업무 시작',exact:true}).check();
 await dialog.getByRole('button',{name:'변경 내용 확인'}).click();
 await expect(dialog.getByRole('region',{name:'공개 변경 확인'})).toContainText('나의 첫 프롬프트 · 무료 미리보기 설정 있음');
 expect(h.writes).toHaveLength(0);
 await expect(dialog.getByText('새로 공개 1개 · 비공개 전환 0개')).toBeVisible();
 await page.screenshot({path:test.info().outputPath(`visibility-${info.project.name}.png`),fullPage:true});
 await dialog.getByRole('button',{name:'확인한 공개 범위 적용'}).click();
 await expect(dialog.getByRole('status').filter({hasText:'공개 범위를 저장'})).toBeVisible();
 expect(h.writes).toEqual([{action:'save',section:'weeks',id:'w1',expectedUpdatedAt:'2026-09-30T01:00:00Z',values:{is_published:true}}]);
 expect(h.weeks[2].is_published).toBe(false);expect(h.lessons[1].is_preview).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('partial failure refreshes actual state and retries only the remaining parent',async({page})=>{
 const h=await setup(page,{failParent:true}),dialog=await visibility(page);
 await dialog.getByRole('checkbox',{name:'1주차 · AI 업무 시작',exact:true}).check();await dialog.getByRole('checkbox',{name:/内 업무 정리|내 업무 정리/}).check();
 await dialog.getByRole('button',{name:'변경 내용 확인'}).click();await dialog.getByRole('button',{name:'확인한 공개 범위 적용'}).click();
 await expect(dialog.getByRole('alert')).toContainText('남은 변경만');await expect(dialog.getByRole('status')).toHaveText('변경 1개');
 expect(h.weeks[1].is_published).toBe(false);expect(h.lessons[2].is_published).toBe(true);
 await dialog.getByRole('button',{name:'변경 내용 확인'}).click();await dialog.getByRole('button',{name:'확인한 공개 범위 적용'}).click();
 await expect(dialog.getByRole('status').filter({hasText:'공개 범위를 저장'})).toBeVisible();expect(h.writes.map(x=>x.id)).toEqual(['c','w1','w1']);
});
test('unknown saved state blocks retries until a fresh read succeeds',async({page})=>{
 const h=await setup(page,{failParent:true,uncertain:true}),dialog=await visibility(page);
 await dialog.getByRole('checkbox',{name:'1주차 · AI 업무 시작',exact:true}).check();await dialog.getByRole('button',{name:'변경 내용 확인'}).click();await dialog.getByRole('button',{name:'확인한 공개 범위 적용'}).click();
 await expect(dialog.getByRole('alert')).toContainText('현재 상태를 확인하지 못했습니다');await expect(dialog.getByRole('button',{name:'변경 내용 확인'})).toBeDisabled();
 h.restoreReads();await dialog.getByRole('button',{name:'저장 상태 다시 확인'}).click();await expect(dialog.getByRole('button',{name:'변경 내용 확인'})).toBeEnabled();expect(h.writes).toHaveLength(1);
});
test('changed curriculum aborts before writing and shows the latest settings',async({page})=>{
 const h=await setup(page),dialog=await visibility(page);
 await dialog.getByRole('checkbox',{name:'1주차 · AI 업무 시작',exact:true}).check();await dialog.getByRole('button',{name:'변경 내용 확인'}).click();
 h.lessons.push({id:'new',week_id:'w1',day_number:5,title:'동료가 추가한 수업',is_published:true,has_blocks:true});
 await dialog.getByRole('button',{name:'확인한 공개 범위 적용'}).click();await expect(dialog.getByRole('alert')).toContainText('다른 곳에서 커리큘럼이 변경');expect(h.writes).toHaveLength(0);
 await expect(dialog.getByRole('checkbox',{name:/동료가 추가한 수업/})).toBeVisible();
});
test('week move previews numbers, keeps onboarding first, and archive restore requires conflict consent',async({page})=>{
 const h=await setup(page);
 await page.getByRole('region',{name:'2주차 업무 자동화',exact:true}).locator('summary').first().click();
 await page.getByRole('button',{name:'업무 자동화 주차 위로',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'주차 순서를 바꿀까요?'});await expect(dialog).toContainText('0주차 온보딩');expect(h.writes).toHaveLength(0);
 await dialog.getByRole('button',{name:'이 순서로 저장'}).click();await expect(dialog).toBeHidden();
 expect(h.writes[0]).toMatchObject({action:'reorder-weeks',ids:['w0','w2','w1']});expect(h.weeks[0].week_number).toBe(0);
 await page.getByRole('button',{name:'삭제한 항목 복구',exact:true}).click();await expect(page.getByRole('button',{name:'주차 복구',exact:true})).toBeVisible();
 page.once('dialog',d=>{expect(d.message()).toContain('이미 사용 중');return d.dismiss();});await page.getByRole('button',{name:'주차 복구',exact:true}).click();expect(h.writes).toHaveLength(1);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'주차 복구',exact:true}).click();await expect.poll(()=>h.writes.length).toBe(2);expect(h.writes[1]).toMatchObject({action:'set-curriculum-archive',reassignOnConflict:true,archived:false});
});
test('closing the publication dialog without applying never saves',async({page})=>{
 const h=await setup(page),dialog=await visibility(page);await dialog.getByRole('checkbox',{name:'0주차 · 온보딩',exact:true}).uncheck();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(h.writes).toHaveLength(0);expect(h.weeks[0].is_published).toBe(true);
});
