import { test, expect, type Page } from '@playwright/test';
import type { DiagnosisQuestion, DiagnosisSession } from '../../lib/diagnosis-session';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture({count=20,neutral=0,answered=count,adminTest=false,check=false}:{count?:number;neutral?:number;answered?:number;adminTest?:boolean;check?:boolean}={}) : DiagnosisSession {
  const base={section:'합성 검사',required:true,core:true,pickExactly:null,exclusiveOptionIds:[],reconfirmInstructions:false,confirmationOptionId:null,placeholder:''};
  const pairs:DiagnosisQuestion[]=Array.from({length:count},(_,i)=>({...base,id:id(100+i),code:`P${i}`,type:'pair_choice',text:'두 문장 중 지금의 나에 더 가까운 쪽은?',pair:{left:'계획을 먼저 세우는 편이에요.',right:'직접 해 보면서 방법을 찾는 편이에요.'},options:['왼쪽이 훨씬 나','왼쪽이 조금 더 나','비슷하다','오른쪽이 조금 더 나','오른쪽이 훨씬 나'].map((label,j)=>({id:id(1000+i*5+j),label}))}));
  if(check)pairs[0].requiredOptionId=pairs[0].options[0].id;
  const aspire:DiagnosisQuestion={...base,id:id(999),code:'aspire',required:false,core:false,pickExactly:1,type:'multi_choice',text:'앞으로 챙기고 싶은 모습',pair:null,options:[{id:id(998),label:'꾸준히 실행하는 나'}]};
  return {state:'in_progress',revision:0,adminTest,canRestart:adminTest,answers:[...pairs.slice(0,answered).map((q,i)=>({questionId:q.id,optionId:q.options[i<neutral?2:0].id,ms:2000})),...(answered===count?[{questionId:aspire.id,values:[id(998)]}]:[])],submittedAt:null,needsReview:false,survey:{code:'needs6_n30',version:'synthetic',title:'합성 진단',coreQuestionCount:count,questions:[...pairs,aspire]}};
}
async function api(page:Page,initial:DiagnosisSession){
  let current=structuredClone(initial),writes=0,submits=0;
  await page.route('**/api/platform/diagnosis/session',route=>{
    const body=route.request().method()==='POST'?route.request().postDataJSON():{};
    if(body.action==='save'){writes++;current={...current,revision:current.revision+1,answers:body.answers};}
    if(body.action==='submit'){submits++;current={...current,state:'submitted',submittedAt:'2026-10-02T00:00:00Z'};}
    return route.fulfill({json:current});
  });
  return {get current(){return current;},get writes(){return writes;},get submits(){return submits;}};
}
async function frozenClock(page:Page){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
}

test('sub-second mouse and keyboard responses never save or advance; a one-second response does',async({page})=>{
  const state=await api(page,fixture({count:1,answered:0}));await frozenClock(page);
  await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();
  await page.getByRole('radio').first().click();await expect(page.getByRole('alert')).toContainText('두 문장을 모두 읽고');
  await page.clock.fastForward(999);await page.keyboard.press('2');
  expect(state.writes).toBe(0);await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);await expect(page.locator('.q-no')).toHaveText('Q 001');
  await page.clock.fastForward(1);await page.keyboard.press('1');await page.clock.fastForward(600);
  await expect.poll(()=>state.writes).toBe(1);expect(state.current.answers[0].ms).toBe(1000);
  await expect(page.getByRole('heading',{name:'앞으로 챙기고 싶은 모습'})).toBeVisible();
  await page.getByRole('button',{name:'이전 문항'}).click();await page.keyboard.press('2');
  await expect(page.getByRole('radio').first()).toBeChecked();expect(state.writes).toBe(1);
  await expect(page.locator('.timer')).toContainText('18초');
  await page.clock.fastForward(3000);await expect(page.locator('.timer')).toContainText('15초');
  await page.clock.fastForward(15000);await expect(page.locator('.timer')).toContainText('0초');
  await expect(page.locator('.q-no')).toHaveText('Q 001');
  await expect(page.getByRole('radio').first()).toBeChecked();expect(state.writes).toBe(1);
});

test('server-designated admin tests retain fast responses; the admin URL alone does not bypass the guard',async({page})=>{
  await frozenClock(page);const state=await api(page,fixture({count:1,answered:0,adminTest:true}));
  await page.goto('/diagnosis-test?admin');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();await page.keyboard.press('1');await page.clock.fastForward(600);
  await expect.poll(()=>state.writes).toBe(1);expect(state.current.answers[0].ms).toBe(0);
  await page.unroute('**/api/platform/diagnosis/session');const ordinary=await api(page,fixture({count:1,answered:0}));
  await page.goto('/diagnosis-test?admin');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();await page.keyboard.press('1');
  await expect(page.getByRole('alert')).toContainText('두 문장을 모두 읽고');expect(ordinary.writes).toBe(0);
});

test('instructed check answers are still validated without the one-second restriction',async({page})=>{
  const state=await api(page,fixture({count:1,answered:0,check:true}));await frozenClock(page);
  await page.goto('/diagnosis-test');await page.getByRole('button',{name:'두 문장 비교 시작하기',exact:true}).click();await page.keyboard.press('2');
  await expect(page.getByRole('alert')).toContainText('안내와 다른 답');expect(state.writes).toBe(0);
  await page.keyboard.press('1');await page.clock.fastForward(600);await expect.poll(()=>state.writes).toBe(1);
});

test('neutral nudge starts strictly above half after 20 answers and fits a narrow screen',async({page})=>{
  for(const [answered,neutral,visible] of [[19,19,false],[20,10,false],[20,11,true]] as const){
    await page.unroute('**/api/platform/diagnosis/session');await api(page,fixture({count:21,answered,neutral}));await page.goto('/diagnosis-test');
    await expect(page.locator('.q-no')).toBeVisible();await expect(page.locator('.neutral-nudge')).toHaveCount(visible?1:0);
  }
  await page.setViewportSize({width:320,height:740});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('neutral-nudge-320.png'),fullPage:true,animations:'disabled'});
});

test('over 60 percent cannot submit; review preserves answers and correction unlocks completion after reload',async({page})=>{
  const state=await api(page,fixture({neutral:13}));await frozenClock(page);await page.goto('/diagnosis-test');
  await page.getByRole('button',{name:'문진 완료하기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('65%');await expect(page.getByRole('heading',{name:'‘비슷하다’로 고른 문항을 다시 확인해 주세요'})).toBeFocused();
  await expect(page.getByRole('button',{name:'답변 제출하기',exact:true})).toHaveCount(0);expect(state.submits).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('neutral-review.png'),fullPage:true});
  await page.getByRole('button',{name:'‘비슷하다’ 문항 다시 보기'}).click();
  await expect(page.locator('.q-no')).toHaveText('Q 001');await expect(page.getByRole('radio').nth(2)).toBeChecked();expect(state.current.answers).toHaveLength(21);
  await page.clock.fastForward(1000);await page.keyboard.press('1');await page.clock.fastForward(600);await expect.poll(()=>state.writes).toBe(1);
  expect(state.current.answers.filter(a=>a.optionId)).toHaveLength(20);
  await page.reload();await page.getByRole('button',{name:'문진 완료하기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'답변을 제출할까요?'})).toBeVisible();
  await page.getByRole('button',{name:'답변 제출하기',exact:true}).click();
  await expect.poll(()=>state.submits).toBe(1);await expect(page.getByRole('heading',{name:'답변을 제출했어요.'})).toBeVisible();
});

test('exactly 60 percent permits completion, including an admin test',async({page})=>{
  const state=await api(page,fixture({neutral:12,adminTest:true}));await page.goto('/diagnosis-test?admin');
  await page.getByRole('button',{name:'문진 완료하기',exact:true}).click();await expect(page.getByRole('heading',{name:'답변을 제출할까요?'})).toBeVisible();
  await page.getByRole('button',{name:'답변 제출하기',exact:true}).click();await expect.poll(()=>state.submits).toBe(1);
});

test('admin fast-test exemption does not bypass the neutral completion guard',async({page})=>{
  const state=await api(page,fixture({neutral:13,adminTest:true}));await page.goto('/diagnosis-test?admin');
  await page.getByRole('button',{name:'문진 완료하기',exact:true}).click();
  await expect(page.getByRole('button',{name:'‘비슷하다’ 문항 다시 보기'})).toBeVisible();
  await expect(page.getByRole('button',{name:'답변 제출하기',exact:true})).toHaveCount(0);expect(state.submits).toBe(0);
});
