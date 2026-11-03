import { test, expect, type Page } from '@playwright/test';
import type { DiagnosisQuestion } from '../../lib/diagnosis-session';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture() {
  const base={section:'합성 검사',required:true,core:true,pickExactly:null,exclusiveOptionIds:[],reconfirmInstructions:false,confirmationOptionId:null,placeholder:'',pair:null};
  const questions:DiagnosisQuestion[]=[{...base,id:id(10),code:'pair',type:'pair_choice',text:'평소의 나와 가까운 문장을 골라 주세요.',pair:{left:'계획을 먼저 세우는 편이에요.',right:'직접 해 보면서 방법을 찾는 편이에요.'},options:[{id:id(11),label:'A에 더 가까워요'},{id:id(12),label:'B에 더 가까워요'}]},
    {...base,id:id(20),code:'story',type:'text',required:false,core:false,text:'최근 몰입했던 경험이 있나요?',options:[]},
    {...base,id:id(30),code:'aspire_pick',type:'multi_choice',required:false,core:false,pickExactly:2,text:'내가 바라는 모습을 골라 주세요.',options:[{id:id(31),label:'합성 모습 하나'},{id:id(32),label:'합성 모습 둘'},{id:id(33),label:'합성 모습 셋'}]}];
  return {state:'in_progress',revision:0,answers:[] as Record<string,unknown>[],submittedAt:null as string|null,needsReview:false,survey:{code:'needs6_n30',version:'synthetic',title:'합성 N6 검사',coreQuestionCount:1,questions}};
}
async function api(page:Page,{started=false,failSave=false,conflict=false}={}) {
  let current=fixture(),writes=0,submissions=0;
  await page.route('**/api/platform/diagnosis/session',async route=>{
    const body=route.request().method()==='POST'?route.request().postDataJSON():{action:'read'};
    if(body.action==='read')return route.fulfill({json:started?current:{state:'not_started',offers:[{courseId:id(1),title:'합성 학습 상품'}]}});
    if(body.action==='ensure'){started=true;return route.fulfill({json:current});}
    if(body.action==='save'){
      writes++;
      if(conflict)return route.fulfill({status:409,json:{code:'CONFLICT',error:'다른 화면에서 답변이 변경되었습니다. 최신 답변을 불러와 주세요.'}});
      if(failSave&&writes===1)return route.fulfill({status:503,json:{code:'UNAVAILABLE',error:'연결을 확인한 뒤 저장을 다시 시도해 주세요.'}});
      current={...current,revision:current.revision+1,answers:body.answers};return route.fulfill({json:current});
    }
    if(body.action==='submit'){submissions++;current={...current,state:'submitted',submittedAt:'2026-10-01T00:00:00Z'};return route.fulfill({json:current});}
    return route.fulfill({status:400,json:{error:'합성 오류'}});
  });
  return {get current(){return current;},get writes(){return writes;},get submissions(){return submissions;}};
}
test('MYIN guide, pair choice, story, aspirations and explicit submission work on every viewport',async({page})=>{
  const state=await api(page);await page.goto('/diagnosis-test');await expect(page.getByRole('heading',{name:'나를 움직이는 마음을 알아보는 시간'})).toBeVisible();
  await expect(page.getByText('결과 보고서는 AI(Anthropic)가 작성합니다', {exact:true})).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('n6-ai-disclosure.png'),fullPage:true});
  await page.getByRole('button',{name:'검사 시작하기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'평소의 나와 더 가까운 문장을 골라주세요'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'선택할 때는 이것만 기억해 주세요'})).toBeVisible();
  await expect(page.getByText('응답 자동 저장',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('diagnosis-choice-reminder.png'),fullPage:true});
  await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  await expect(page.locator('.timer')).toContainText('18초');await expect(page.locator('.timer')).not.toContainText('18초');await page.getByRole('radio',{name:'1 A에 더 가까워요'}).click();
  await expect(page.getByRole('heading',{name:'이번엔, 직접 들려주세요'})).toBeVisible();
  await page.getByRole('textbox').fill('합성 사업자의 실제 경험');await page.getByRole('button',{name:'다음 단계로',exact:true}).click();
  await page.getByRole('checkbox',{name:'합성 모습 하나'}).click();await page.getByRole('checkbox',{name:'합성 모습 둘'}).click();await expect(page.getByRole('checkbox',{name:'합성 모습 셋'})).toBeDisabled();
  await page.getByRole('button',{name:'문진 완료하기',exact:true}).click();await expect(page.getByRole('heading',{name:'답변을 제출할까요?'})).toBeVisible();expect(state.submissions).toBe(0);
  await page.getByRole('button',{name:'답변 제출하기',exact:true}).click();await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();expect(state.submissions).toBe(1);
  await page.reload();await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();expect(state.submissions).toBe(1);
  expect(state.current.answers.find(a=>a.questionId===id(10))?.ms).toEqual(expect.any(Number));
  expect(state.current.answers.find(a=>a.questionId===id(20))?.value).toBe('합성 사업자의 실제 경험');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('failed boundary save keeps the answer and allows an explicit retry without losing story input',async({page})=>{
  const state=await api(page,{started:true,failSave:true});await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  await expect(page.locator('.timer')).not.toContainText('18초');await page.getByRole('radio',{name:'1 A에 더 가까워요'}).click();await expect(page.getByRole('alert')).toContainText('이 창을 닫지 마세요');
  await expect(page.getByRole('radio',{name:'1 A에 더 가까워요'})).toBeChecked();await page.getByRole('button',{name:'저장 다시 시도'}).click();await expect.poll(()=>state.current.answers.length).toBeGreaterThan(0);await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();await expect(page.getByRole('heading',{name:'이번엔, 직접 들려주세요'})).toBeVisible();
  const input=page.getByRole('textbox');await input.fill('저장하고 이어갈 합성 답변');await expect.poll(()=>state.current.answers.find(a=>a.questionId===id(20))?.value).toContain('합성 답변');
});
test('conflicting edits stop further writes and reloading requires a deliberate choice',async({page})=>{
  const state=await api(page,{started:true,conflict:true});await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();await expect(page.locator('.timer')).not.toContainText('18초');await page.getByRole('radio',{name:'2 B에 더 가까워요'}).click();
  await expect(page.getByRole('alert')).toContainText('다른 화면');await expect(page.getByRole('radio',{name:'2 B에 더 가까워요'})).toBeChecked();await expect(page.getByRole('radio').first()).toBeDisabled();
  await page.getByRole('button',{name:'서버 응답 다시 불러오기'}).click();await page.getByRole('button',{name:'취소',exact:true}).click();expect(state.writes).toBe(1);await expect(page.getByRole('radio',{name:'2 B에 더 가까워요'})).toBeChecked();
});
test('18-second expiry never answers or advances automatically and still accepts a response',async({page})=>{
  await api(page,{started:true});await page.clock.install();await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  await page.clock.fastForward(19000);await expect(page.locator('.timer')).toContainText('0초');await expect(page.getByText('괜찮아요 — 먼저 떠오른 쪽으로 골라 주세요')).toBeVisible();await expect(page.getByRole('radio').first()).not.toBeChecked();
  await page.getByRole('radio').first().click();await page.clock.fastForward(300);await expect(page.getByRole('heading',{name:'이번엔, 직접 들려주세요'})).toBeVisible();
});
test('pair sentences remain side by side and five choices fit at 320 pixels',async({page})=>{
  await page.setViewportSize({width:320,height:740});const data=fixture();data.survey.questions[0].options=['왼쪽이 훨씬 나','왼쪽이 조금 더 나','비슷하다','오른쪽이 조금 더 나','오른쪽이 훨씬 나'].map((label,i)=>({id:id(11+i),label}));
  await page.route('**/api/platform/diagnosis/session',route=>route.fulfill({json:data}));await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  const left=await page.locator('.pair-card').nth(0).boundingBox(),right=await page.locator('.pair-card').nth(1).boundingBox();expect(left?.y).toBe(right?.y);expect((left?.x??0)+(left?.width??0)).toBeLessThan(right?.x??0);
  const options=await page.getByRole('radio').all();expect(options).toHaveLength(5);for(const option of options){const box=await option.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);expect((box?.x??0)+(box?.width??0)).toBeLessThanOrEqual(320);}
  const sizes=await page.getByRole('radio').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {top:r.top,height:r.height,bottom:r.bottom};}));
  expect(new Set(sizes.map(size=>size.top)).size).toBe(1);expect(new Set(sizes.map(size=>size.height)).size).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('n6-pair-320.png'),fullPage:true});
  await page.setViewportSize({width:834,height:1112});
  const tablet=await page.getByRole('radio').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));expect(new Set(tablet).size).toBe(1);
  await page.screenshot({path:test.info().outputPath('n6-pair-equal-cards.png'),fullPage:true});
});
test('instructed checks reject mouse and keyboard mistakes before saving, then accept the instructed answer',async({page})=>{
  const data=fixture();data.survey.questions[0].requiredOptionId=id(12);
  let saved:Record<string,unknown>[]=[];let writes=0;
  await page.route('**/api/platform/diagnosis/session',route=>{
    const body=route.request().method()==='POST'?route.request().postDataJSON():{};
    if(body.action==='save'){writes++;saved=body.answers;}
    return route.fulfill({json:{...data,revision:writes,answers:saved}});
  });
  await page.clock.install();await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('alert')).toHaveText('안내와 다른 답을 골랐어요. 문항을 다시 읽고 안내된 답을 골라 주세요.');
  await page.clock.fastForward(1000);expect(writes).toBe(0);await expect(page.getByRole('radio').first()).not.toBeChecked();
  await page.keyboard.press('1');await page.clock.fastForward(1000);expect(writes).toBe(0);
  await expect(page.locator('.q-no')).toHaveText('Q 001');
  await page.keyboard.press('2');await page.clock.fastForward(600);
  await expect(page.getByRole('heading',{name:'이번엔, 직접 들려주세요'})).toBeVisible();
  await expect(page.locator('.check-miss')).toHaveCount(0);expect(writes).toBe(1);expect(saved[0].optionId).toBe(id(12));
  await page.getByRole('button',{name:'이전 문항'}).click();
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  await page.getByRole('radio').first().click();await page.clock.fastForward(1000);
  expect(writes).toBe(1);await expect(page.getByRole('radio').nth(1)).toBeChecked();expect(saved[0].optionId).toBe(id(12));
});

test('instruction band is not clickable, choice numbers align, and question transitions respect reduced motion',async({page})=>{
  const data=fixture();data.survey.questions[0].text='두 문장 중 지금의 나에 더 가까운 쪽은?';
  data.survey.questions[0].options=['왼쪽이 훨씬 나','왼쪽이 조금 더 나','비슷하다','오른쪽이 조금 더 나','오른쪽이 훨씬 나'].map((label,i)=>({id:id(11+i),label}));
  data.survey.questions.splice(1,0,{...data.survey.questions[0],id:id(40),code:'pair-two'});data.survey.coreQuestionCount=2;
  await page.route('**/api/platform/diagnosis/session',route=>route.fulfill({json:data}));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  await expect(page.locator('.q-no')).toHaveCSS('font-size','20px');
  await expect(page.locator('.qwrap')).toHaveCSS('animation-duration','0.32s');
  await expect(page.locator('.pair-vs')).toHaveText('VS');await expect(page.locator('.pair-card').first()).toHaveCSS('border-top-width','0px');
  await page.locator('.pair-card').first().click();await expect(page.locator('.q-no')).toHaveText('Q 001');await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);
  const positions=await page.locator('.opt .num').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));expect(new Set(positions).size).toBe(1);
  const previous=await page.locator('.qwrap').elementHandle();await expect(page.locator('.timer')).not.toContainText('18초');await page.keyboard.press('1');await expect(page.locator('.q-no')).toHaveText('Q 002');
  expect(await previous!.evaluate(node=>node.isConnected)).toBe(false);
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'이전 문항'}).click();
  await expect(page.locator('.qwrap')).toHaveCSS('animation-name','none');
  await page.screenshot({path:test.info().outputPath('n6-myin-parity.png'),fullPage:true});
});
test('keyboard selection advances once and instruction checks require acknowledgment',async({page})=>{
  const data=fixture();data.survey.questions[0].confirmationOptionId=id(12);data.survey.questions[0].reconfirmInstructions=true;
  await page.route('**/api/platform/diagnosis/session',async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():{};await route.fulfill({json:body.action==='save'?{...data,revision:1,answers:body.answers}:data});});
  await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();await expect(page.locator('.timer')).not.toContainText('18초');await page.keyboard.press('1');await expect(page.getByRole('button',{name:'안내를 읽었습니다'})).toBeVisible();await expect(page.getByRole('heading',{name:'이번엔, 직접 들려주세요'})).toHaveCount(0);
  await page.getByRole('button',{name:'안내를 읽었습니다'}).click();await expect(page.getByRole('heading',{name:'이번엔, 직접 들려주세요'})).toBeVisible();
});
test('entry uses only eligible courses and an existing account test always resumes',async({page})=>{
  await page.route('**/api/platform/diagnosis/session?view=catalog',route=>route.fulfill({json:{offers:[{courseId:id(1),title:'합성 대상 상품'}],current:{state:'in_progress'}}}));
  await page.goto('/diagnosis-test?entry');await expect(page.getByRole('link',{name:'검사 이어하기'})).toHaveAttribute('href',`/my/diagnosis?course=${id(1)}`);
  await page.goto(`/diagnosis-test?entry&course=${id(99)}`);await expect(page.getByRole('region',{name:'N6 검사'})).toHaveCount(0);
  await page.goto(`/diagnosis-test?entry&course=${id(1)}`);await expect(page.getByRole('link',{name:'검사 이어하기'})).toBeVisible();
  await page.unroute('**/api/platform/diagnosis/session?view=catalog');
  await page.route('**/api/platform/diagnosis/session?view=catalog',route=>route.fulfill({status:403,json:{error:'권한 없음'}}));
  await page.goto('/diagnosis-test?entry');await expect(page.getByRole('region',{name:'N6 검사'})).toHaveCount(0);
});
test('a submitted questionnaire under review preserves completion and does not ask for payment or resubmission',async({page})=>{
  await page.route('**/api/platform/diagnosis/session',route=>route.fulfill({json:{...fixture(),state:'submitted',submittedAt:'2026-10-01T00:00:00Z',needsReview:true}}));
  await page.goto('/diagnosis-test');await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();
  await expect(page.getByText('답변은 안전하게 접수됐어요.',{exact:false})).toContainText('보고서 발급 전 운영팀의 확인이 필요합니다.');
  await expect(page.getByRole('button',{name:'답변 제출하기'})).toHaveCount(0);
});

 test('rapid choices cannot skip a question and revisiting preserves answers with a fresh timer',async({page})=>{
  const data=fixture();const second={...data.survey.questions[0],id:id(40),code:'pair-two',text:'두 번째 합성 비교 문항',options:[{id:id(41),label:'두 번째 왼쪽'},{id:id(42),label:'두 번째 오른쪽'}]};data.survey.questions.splice(1,0,second);data.survey.coreQuestionCount=2;
  let latest:Record<string,unknown>[]=[];
  await page.route('**/api/platform/diagnosis/session',async route=>{const body=route.request().method()==='POST'?route.request().postDataJSON():{};if(body.action==='save')latest=body.answers;await route.fulfill({json:{...data,revision:body.action==='save'?body.revision+1:0,answers:latest}});});
  await page.clock.install();await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();await page.clock.fastForward(17000);
  await page.keyboard.press('1');await page.keyboard.press('2');await page.clock.fastForward(300);await expect(page.getByRole('heading',{name:'두 번째 합성 비교 문항'})).toBeVisible();await expect(page.locator('.timer')).toContainText('18초');
  await page.getByRole('button',{name:'이전 문항'}).click();await expect(page.getByRole('radio',{name:'1 A에 더 가까워요'})).toBeChecked();await page.clock.fastForward(600);
  // The virtual clock advances debounce timers, not the HTTP request to the fixture.
  await expect.poll(()=>latest.find(a=>a.questionId===id(10))?.optionId).toBe(id(11));expect(latest.find(a=>a.questionId===id(10))?.ms).toBeGreaterThanOrEqual(17000);expect(latest.find(a=>a.questionId===id(40))).toBeUndefined();
 });


test('admin pilot introduction is explicit and exit returns to administration', async ({page}) => {
  await api(page);
  await page.goto('/diagnosis-test?admin');
  await expect(page.getByText('관리자 전용 · 수강생에게 공개되지 않습니다', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'검사 시작하기',exact:true})).toBeEnabled();
  await page.getByRole('button', {name:'관리자 화면',exact:true}).click();
  await expect(page).toHaveURL(/\/admin$/);
});
