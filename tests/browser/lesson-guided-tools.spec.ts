import { expect, test, type Page } from '@playwright/test';
import { newGuidedBlock, PERSONA_QUESTIONS, Q4_OPTIONS, Q4_1_MAP, LANDING_QUESTIONS } from '../../lib/lesson-guided-tools';
import { validateBlockAnswers, type LessonBlockAnswers } from '../../lib/lesson-blocks';

type Kind = 'persona-generator' | 'landing-planner';
async function backend(page: Page, kind: Kind, saved?: LessonBlockAnswers, historical = false) {
  const document={schemaVersion:1 as const,blocks:[newGuidedBlock(kind,'tool')],checklist:[]};
  let values=saved, writeId:string|null=null;
  const writes:LessonBlockAnswers[]=[];
  await page.route('**/api/platform/lesson-blocks**',async route=>{
    if(route.request().method()==='GET'){
      await route.fulfill({json:{document,revision:'11111111-1111-4111-8111-111111111111',currentRevision:historical?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111',draft:values?{values,writeId,updatedAt:'2026-09-29T00:00:00Z'}:null,previousDrafts:[]}});return;
    }
    const body=route.request().postDataJSON();
    expect(body.action).toBe('draft');
    values=validateBlockAnswers(body.values,document);writeId=body.requestId;writes.push(values);
    await route.fulfill({json:{writeId,updatedAt:'2026-09-29T00:00:00Z'}});
  });
  return {getValues:()=>values,writes};
}
async function saved(page:Page){await expect(page.getByRole('status').filter({hasText:'답변 저장됨'})).toBeVisible();}

test('persona resumes a partial draft, completes all 15 answers, copies output and preserves cancelled reset',async({page,context},testInfo)=>{
  const server=await backend(page,'persona-generator');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/lesson-blocks-test');
  const panel=page.getByRole('region',{name:'핵심 고객 페르소나 생성기'});
  for(const q of PERSONA_QUESTIONS.slice(0,3)) {await expect(panel.getByRole('heading',{name:q.text})).toBeVisible();await panel.getByRole('button',{name:q.opts![0],exact:true}).click();}
  await saved(page);await page.reload();
  await expect(panel.getByRole('heading',{name:PERSONA_QUESTIONS[3].text})).toBeVisible();
  for(const q of PERSONA_QUESTIONS.slice(3,14)) await panel.getByRole('button',{name:q.opts![0],exact:true}).click();
  await expect(panel.getByRole('button',{name:'페르소나 생성하기'})).toBeDisabled();
  await panel.getByRole('textbox',{name:PERSONA_QUESTIONS[14].text}).fill('전문가가 직접 운영 $& {고객}\n원문 그대로');
  await panel.getByRole('button',{name:'페르소나 생성하기'}).click();
  await expect(panel.getByRole('textbox',{name:'완성된 프롬프트'})).toHaveValue(/전문가가 직접 운영 \$& \{고객\}\n원문 그대로/);
  await saved(page);expect(Object.keys(server.getValues()!.blocks.tool)).toHaveLength(15);
  await page.reload();await expect(panel.getByRole('heading',{name:'핵심 고객 페르소나',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'전체 프롬프트 복사'}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('전문가가 직접 운영 $& {고객}');
  page.once('dialog',d=>d.dismiss());await panel.getByRole('button',{name:'처음부터 다시하기'}).click();
  await expect(panel.getByRole('textbox',{name:'완성된 프롬프트'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('persona-result.png')});
  page.once('dialog',d=>d.accept());await panel.getByRole('button',{name:'처음부터 다시하기'}).click();
  await saved(page);expect(server.getValues()!.blocks.tool).toEqual({});
  await page.reload();await expect(panel.getByRole('heading',{name:PERSONA_QUESTIONS[0].text})).toBeVisible();
});

for(const choice of Q4_OPTIONS)test(`landing ${choice.value} resumes, follows its branch and produces the matching event`,async({page},testInfo)=>{
  const server=await backend(page,'landing-planner');
  await page.goto('/lesson-blocks-test');
  const panel=page.getByRole('region',{name:'랜딩페이지 기획 문답'});
  await panel.getByRole('button',{name:'시작하기'}).click();
  for(const q of LANDING_QUESTIONS.slice(0,3)){
    await expect(panel.getByRole('button',{name:'다음',exact:true})).toBeDisabled();
    await panel.getByRole('textbox',{name:q.label}).fill(q.id+' 예시 답변');await panel.getByRole('button',{name:'다음',exact:true}).click();
  }
  await panel.getByRole('button',{name:choice.label,exact:true}).click();await saved(page);await page.reload();
  const branch=Q4_1_MAP[choice.value];
  await expect(panel.getByRole('heading',{name:branch.question})).toBeVisible();
  await panel.getByRole('textbox',{name:branch.question}).fill('목적별 상세 답변');await panel.getByRole('button',{name:'다음',exact:true}).click();
  for(const q of LANDING_QUESTIONS.slice(5)){
    await panel.getByRole('textbox',{name:q.label}).fill(q.id+' 예시 답변');
    await panel.getByRole('button',{name:q.id==='q10'?'기획안 프롬프트 만들기':'다음',exact:true}).click();
  }
  const output=panel.getByRole('textbox',{name:'완성된 프롬프트'});
  await expect(output).toHaveValue(new RegExp('전환 이벤트 이름은 '+choice.event));
  await saved(page);expect(Object.keys(server.getValues()!.blocks.tool)).toHaveLength(11);
  await page.reload();await expect(output).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('synthetic permission denial');}}});});
  await panel.getByRole('button',{name:'전체 프롬프트 복사'}).click();
  await expect(panel.getByRole('status')).toContainText('직접 복사');
  await expect(output).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(choice.value==='리드형')await page.screenshot({path:testInfo.outputPath('landing-result.png')});
});

test('changing landing purpose clears only its dependent answer in one saved snapshot; historical answers remain read only',async({page})=>{
  const all=Object.fromEntries(LANDING_QUESTIONS.map(q=>[q.id,q.id==='q4'?'리드형':q.id+' 기존 답변']));
  const server=await backend(page,'landing-planner',{blocks:{tool:all},checklist:[]});
  await page.goto('/lesson-blocks-test');
  const panel=page.getByRole('region',{name:'랜딩페이지 기획 문답'});
  await panel.getByRole('button',{name:'답변 수정하기'}).click();
  for(let i=0;i<3;i++)await panel.getByRole('button',{name:'다음',exact:true}).click();
  await panel.getByRole('button',{name:'카톡 채널로 상담 시작',exact:true}).click();
  await saved(page);expect(server.getValues()!.blocks.tool).toEqual({...all,q4:'채팅형',q4_1:''});
  await panel.getByRole('button',{name:'다음',exact:true}).click();
  await expect(panel.getByRole('textbox',{name:Q4_1_MAP.채팅형.question})).toHaveValue('');
  await expect(panel.getByRole('button',{name:'다음',exact:true})).toBeDisabled();
  await page.unroute('**/api/platform/lesson-blocks**');
  const old=await backend(page,'landing-planner',{blocks:{tool:all},checklist:[]},true);await page.reload();
  await expect(page.getByText('이전 수업에서 작성한 답변입니다.',{exact:false})).toBeVisible();
  await expect(panel.getByRole('button',{name:'답변 수정하기'})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'처음부터 다시하기'})).toHaveCount(0);
  await expect(panel.getByRole('textbox',{name:'완성된 프롬프트'})).toHaveJSProperty('readOnly',true);
  expect(old.writes).toHaveLength(0);
});
