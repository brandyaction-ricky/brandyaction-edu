import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, options: {fail?: boolean; blocks?: boolean; quiz?: boolean} = {}) {
  const writes: {section?:string; id?:string; values?:Record<string, unknown>}[] = [];
  const weeks = [{ id: 'week-one', course_id: 'course-one', week_number: 0, title: '온보딩', is_published: true }, {id:'week-two',course_id:'course-one',week_number:1,title:'회사의 두뇌 만들기',is_published:false}];
  const lessons = [{ id: 'lesson-one', week_id:'week-one',day_number:1,title:'학습 목적 이해하기',is_published:true,content_type:'text'}, {id:'lesson-two',week_id:'week-two',day_number:2,title:'AI에게 내 사업 알려주기',is_published:false,content_type:'text'}];
  const quizzes = options.quiz ? [{mission_id:'mission-one',revision:'revision-one',pass_percent:100,questions:[{id:'q1',prompt:'첫 질문',options:['답 A','답 B'],correctIndex:0}]}] : [];
  const contents = [{lesson_id:'lesson-one',body_text:'온보딩 본문'},{lesson_id:'lesson-two',body_text:'비공개 원문'}];
  await page.route('**/api/platform?**',route=> { const query=new URL(route.request().url()).searchParams;return route.fulfill({json:{data: query.get('record')==='course-two' ? {curriculum_weeks:[],curriculum_lessons:[],lesson_contents:[]} : {curriculum_weeks:weeks,curriculum_lessons:lessons,lesson_contents:contents,curriculum_missions: options.quiz ? [{id:'mission-one',lesson_id:'lesson-one',title:'첫 미션'}] : [],mission_quizzes:quizzes}}}); });
  await page.route('**/studio-save',async route=>{
    const body=route.request().postDataJSON();writes.push(body);
    if(options.fail) return route.fulfill({status:409,json:{error:'다른 관리자가 수정했습니다. 다시 확인해 주세요.'}});
    if(body.section==='learning') {
      const row=lessons.find(item=>item.id===body.id);
      if(row) Object.assign(row,body.values);
      else lessons.push({id:'lesson-new',...body.values});
    }
    if(body.action==='quiz') { expect(body.revision).toBe(quizzes[0].revision);Object.assign(quizzes[0],{revision:'revision-next',questions:body.quiz.questions}); }
    if(body.section==='contents') { const row=contents.find(item=>item.lesson_id===body.values.lesson_id); if(row) Object.assign(row,body.values); else contents.push(body.values); }
    await route.fulfill({json:{row:lessons.find(item=>item.id===body.id)||lessons.at(-1)}});
  });
  const blockWrites: unknown[] = [];
  let document = {schemaVersion:1,blocks:[{id:'intro',type:'text',content:'수업 문서 본문'},{id:'q-one',type:'question',question:{label:'오늘의 목표는?',kind:'text',required:true}},{id:'gen-one',type:'prompt-generator',content:'나의 목표: {goal}',fields:[{id:'field-goal',variable:'goal',label:'목표',placeholder:'',required:true,sensitive:false}]}],checklist:[],completion:{mode:'mentor',requireAnswers:true,requireQuizPass:false}};
  await page.route('**/api/platform/lesson-blocks**',async route=>{
    if(route.request().method()==='POST') { const body=route.request().postDataJSON();blockWrites.push(body);document=body.document;await route.fulfill({json:{revision:body.requestId}});return; }
    await route.fulfill({json:{document:options.blocks?document:null,revision:'bbbbbbbb-1111-4111-8111-111111111111',editable:true}});
  });
  return {writes,lessons,blockWrites};
}
async function openLesson(page:Page, second=false) {
  await page.getByRole('button',{name:'AI 문샷 챌린지 커리큘럼 열기'}).click();
  await page.locator('.studio-week-disclosure > summary').nth(second?1:0).click();
  await page.getByRole('button',{name:second?'2일차 AI에게 내 사업 알려주기':'1일차 학습 목적 이해하기',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue(second?'AI에게 내 사업 알려주기':'학습 목적 이해하기');
}

test('product picker opens scoped document editing, full week rows work by keyboard and layout fits',async({page},info)=>{
  await setup(page);await page.goto('/curriculum-editor-test');await openLesson(page);
  await expect(page.getByRole('textbox',{name:'학습 내용',exact:true})).toBeVisible();
  const header=page.locator('.studio-week-disclosure > summary').first();await header.focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'1일차 학습 목적 이해하기'})).toBeHidden();await page.keyboard.press('Enter');
  const bounds=await header.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('curriculum-studio.png'),fullPage:true});
});

test('unsaved document stays on cancel, saves before switching and never publishes a hidden lesson',async({page})=>{
  const {writes}=await setup(page);await page.goto('/curriculum-editor-test');await openLesson(page,true);
  await page.getByRole('textbox',{name:'수업 제목',exact:true}).fill('비공개 수업 수정');
  await page.locator('.studio-week-disclosure > summary').first().click();
  await page.getByRole('button',{name:'1일차 학습 목적 이해하기'}).click();
  await page.getByRole('button',{name:'계속 작성',exact:true}).click();await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('비공개 수업 수정');expect(writes).toHaveLength(0);
  await page.getByRole('button',{name:'1일차 학습 목적 이해하기'}).click();await page.getByRole('button',{name:'저장하고 이동',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('학습 목적 이해하기');
  expect(writes.find(body=>body.section==='learning')).toMatchObject({id:'lesson-two',values:{title:'비공개 수업 수정',is_published:false,week_id:'week-two'}});
});

test('failed save keeps edits and course selection, then refresh resumes last saved location only for this actor',async({page})=>{
  const {writes}=await setup(page,{fail:true});await page.goto('/curriculum-editor-test');await openLesson(page);
  await page.getByRole('textbox',{name:'수업 제목',exact:true}).fill('저장 전 제목');await page.getByRole('combobox',{name:'편집할 상품'}).selectOption('course-two');
  await page.getByRole('button',{name:'저장하고 이동'}).click();await expect(page.getByRole('alert').filter({hasText:'현재 수업을 유지'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('저장 전 제목');await expect(page.getByRole('combobox',{name:'편집할 상품'})).toHaveValue('course-one');expect(writes).toHaveLength(1);
  await page.goto('/curriculum-editor-test?actor=other');await expect(page.getByRole('button',{name:'AI 문샷 챌린지 커리큘럼 열기'})).toBeVisible();
});

test('new lesson keeps chosen week and is private; recent selection opens directly after reload',async({page})=>{
  const {writes}=await setup(page);await page.goto('/curriculum-editor-test');await openLesson(page,true);
  const week=page.getByRole('region',{name:'1주차 회사의 두뇌 만들기'});await week.getByRole('button',{name:'＋ 학습 추가'}).click();await week.getByRole('textbox',{name:'새 일차 제목'}).fill('새로운 연습');await week.getByRole('button',{name:'일차 추가',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('새로운 연습');expect(writes[0]).toMatchObject({section:'learning',values:{week_id:'week-two',is_published:false,is_preview:false}});
  await page.reload();await expect(page.getByRole('textbox',{name:'수업 제목',exact:true})).toHaveValue('새로운 연습');
});

test('continuous document opens directly and saving keeps question, generator and mentor-review identity',async({page},info)=>{
 const {blockWrites}=await setup(page,{blocks:true});await page.goto('/curriculum-editor-test?blocks=1');await openLesson(page,true);
 await expect(page.getByText('1 · 수업 정보',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'2 · 학습 구성'})).toBeVisible();
 await expect(page.getByText('3 · 반복 학습 운영',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'4 · 확인 퀴즈'})).toBeVisible();await expect(page.getByRole('heading',{name:'버전·임시저장'})).toBeVisible();
 const editorDocument=page.getByRole('textbox',{name:'수업 문서',exact:true});await expect(editorDocument).toBeVisible();await expect(editorDocument).toContainText('오늘의 목표는?');
 await expect(page.getByRole('link',{name:'학습 구성 편집·미리보기'})).toHaveCount(0);
 await editorDocument.locator('[data-author-block="intro"] p').click();await page.keyboard.press('End');await page.keyboard.type(' 수정한 문장');
 await page.getByRole('button',{name:'학습 저장',exact:true}).first().click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();
 expect(blockWrites[0]).toMatchObject({document:{blocks:expect.arrayContaining([{id:'q-one',type:'question',question:{label:'오늘의 목표는?',kind:'text',required:true}},{id:'gen-one',type:'prompt-generator',content:'나의 목표: {goal}',fields:[{id:'field-goal',variable:'goal',label:'목표',placeholder:'',required:true,sensitive:false}]}]),completion:{mode:'mentor',requireAnswers:true,requireQuizPass:false}}});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('curriculum-document.png'),fullPage:true});
});

test('quiz drafts block lesson changes and a second quiz save uses the refreshed revision',async({page})=>{
 await setup(page,{quiz:true});await page.goto('/curriculum-editor-test');await openLesson(page);
 await page.getByRole('textbox',{name:'1번 문제',exact:true}).fill('수정한 질문');
 await page.getByRole('combobox',{name:'편집할 상품'}).selectOption('course-two');await page.getByRole('button',{name:'저장하고 이동'}).click();
 await expect(page.getByText('아래 확인 퀴즈의 변경사항을 먼저 저장해 주세요.')).toBeVisible();await expect(page.getByRole('textbox',{name:'1번 문제',exact:true})).toHaveValue('수정한 질문');
 await page.getByRole('button',{name:'퀴즈 저장',exact:true}).click();await expect(page.getByRole('button',{name:'퀴즈 저장',exact:true})).toBeDisabled();
 await page.getByRole('textbox',{name:'1번 문제',exact:true}).fill('다시 수정한 질문');await page.getByRole('button',{name:'퀴즈 저장',exact:true}).click();await expect(page.getByRole('button',{name:'퀴즈 저장',exact:true})).toBeDisabled();
});

test('outline search keeps unsaved week settings and blocks leaving until they are saved',async({page})=>{
 await setup(page);await page.goto('/curriculum-editor-test');await openLesson(page);
 const week=page.getByRole('region',{name:'0주차 온보딩'});await week.getByText('주차 설정',{exact:true}).click();await week.getByRole('textbox',{name:'주차 제목',exact:true}).fill('수정 중인 온보딩');
 await page.getByRole('searchbox',{name:'수업 찾기'}).fill('회사의');await expect(week).toBeHidden();await page.getByRole('searchbox',{name:'수업 찾기'}).fill('');await expect(week.getByRole('textbox',{name:'주차 제목',exact:true})).toHaveValue('수정 중인 온보딩');
 await page.getByRole('combobox',{name:'편집할 상품'}).selectOption('course-two');await expect(page.getByRole('alert').filter({hasText:'주차 설정을 먼저 저장'})).toBeVisible();await expect(page.getByRole('combobox',{name:'편집할 상품'})).toHaveValue('course-one');
});
