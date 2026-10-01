import { test, expect, type Page } from '@playwright/test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture() {
  const base={section:'합성 검사',required:true,core:true,pickExactly:null,exclusiveOptionIds:[],reconfirmInstructions:false,confirmationOptionId:null,placeholder:'',pair:null};
  const questions=[{...base,id:id(10),code:'pair',type:'pair_choice',text:'평소의 나와 가까운 문장을 골라 주세요.',pair:{left:'계획을 먼저 세우는 편이에요.',right:'직접 해 보면서 방법을 찾는 편이에요.'},options:[{id:id(11),label:'A에 더 가까워요'},{id:id(12),label:'B에 더 가까워요'}]},
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
test('intro, answer autosave, resume, optional story and final confirmation work on every viewport',async({page})=>{
  const state=await api(page);await page.goto('/diagnosis-test');await expect(page.getByRole('heading',{name:'나는 어떤 순간에 나답게 움직일까요?'})).toBeVisible();
  await page.getByRole('button',{name:'검사 시작하기'}).click();await page.getByRole('radio',{name:'A에 더 가까워요'}).check();
  await expect(page.getByText('답변이 저장됐어요')).toBeVisible();await page.reload();
  await expect(page.getByRole('heading',{name:'내가 바라는 모습을 골라 주세요.'})).toBeVisible();
  await page.getByRole('checkbox',{name:'합성 모습 하나'}).check();await page.getByRole('checkbox',{name:'합성 모습 둘'}).check();await expect(page.getByRole('checkbox',{name:'합성 모습 셋'})).toBeDisabled();
  await page.getByRole('button',{name:'제출 전 확인'}).click();await expect(page.getByText('모두 답했어요')).toBeVisible();expect(state.submissions).toBe(0);
  await page.getByRole('button',{name:'답변 제출하기'}).click();await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();expect(state.submissions).toBe(1);
  await page.reload();await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();expect(state.submissions).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('unsaved story remains visible after a network failure and can be retried',async({page})=>{
  const state=await api(page,{started:true,failSave:true});await page.goto('/diagnosis-test');await page.getByText('다른 문항으로 이동').click();await page.getByRole('button',{name:'2번 문항',exact:true}).click();
  const input=page.getByRole('textbox',{name:'최근 몰입했던 경험이 있나요?'});await input.fill('저장 실패 중에도 남아 있어야 하는 합성 답변');
  await expect(page.getByRole('alert')).toContainText('저장을 다시 시도');await expect(input).toHaveValue('저장 실패 중에도 남아 있어야 하는 합성 답변');
  await page.getByRole('button',{name:'저장 다시 시도'}).click();await expect(page.getByText('답변이 저장됐어요')).toBeVisible();expect(state.current.answers[0].value).toContain('합성 답변');
});
test('conflicting edits stop saving and require an explicit reload choice',async({page})=>{
  const state=await api(page,{started:true,conflict:true});await page.goto('/diagnosis-test');await page.getByRole('radio',{name:'B에 더 가까워요'}).check();
  await expect(page.getByRole('alert')).toContainText('다른 화면');await expect(page.getByRole('radio',{name:'B에 더 가까워요'})).toBeChecked();await expect(page.getByRole('button',{name:'다음',exact:true})).toBeDisabled();
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'최신 답변 불러오기'}).click();expect(state.writes).toBe(1);await expect(page.getByRole('radio',{name:'B에 더 가까워요'})).toBeChecked();
  await page.getByText('다른 문항으로 이동').click();await page.getByRole('button',{name:'2번 문항',exact:true}).click();await expect(page.getByRole('button',{name:'최신 답변 불러오기'})).toBeVisible();
});
test('required answers prevent advancing and the mobile options have a usable touch area',async({page})=>{
  await api(page,{started:true});await page.goto('/diagnosis-test');await page.getByRole('button',{name:'다음',exact:true}).click();await expect(page.getByRole('alert')).toContainText('답을 선택');
  const box=await page.locator('.diagnosis-option').first().boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:test.info().outputPath('diagnosis.png'),fullPage:true});
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
  await expect(page.getByText('답변은 안전하게 접수됐어요.',{exact:false})).toContainText('추가 결제나 재검사 없이');
  await expect(page.getByRole('button',{name:'답변 제출하기'})).toHaveCount(0);
});
