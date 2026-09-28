import {expect,test,type Page} from '@playwright/test';
import {publicLessonBlocks,type LessonBlockDocument,type LessonBlockAnswers} from '../../lib/lesson-blocks';
const revision='44444444-4444-4444-8444-444444444444',period='2026-09-28T15:00:00.000Z',end='2026-09-29T15:00:00.000Z',past='2026-09-27T15:00:00.000Z';
const document:LessonBlockDocument={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'오늘의 실행',kind:'text',required:true}},{id:'generator',type:'prompt-generator',content:'주제: {주제}',fields:[{id:'topic',label:'주제',variable:'주제',required:true,sensitive:false,placeholder:''}]},{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'a',prompt:'확인 질문',options:['예','아니오'],correctIndex:0}]}}],checklist:[{id:'c',label:'실행 확인',required:true}],completion:{mode:'self',requireAnswers:true,requireQuizPass:true}};
async function backend(page:Page,options:{lost?:boolean;expired?:boolean;saveFailure?:boolean;settings?:boolean}={}){
 let draft:{values:LessonBlockAnswers;writeId:string;updatedAt:string}|null=null,completion:Record<string,unknown>|null=null,settings:Record<string,unknown>|null=null;
 const writes:Record<string,unknown>[]=[],completions:Record<string,unknown>[]=[],configures:Record<string,unknown>[]=[];
 const earlier={values:{blocks:{q:'어제의 답변',generator:{topic:'이전 주제'},quiz:{a:0}},checklist:['c']},writeId:revision,updatedAt:past};
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  expect(route.request().method()).toBe('GET');const q=new URL(route.request().url()).searchParams;
  if(q.get('action')==='progression'){await route.fulfill({json:{lessons:[{lessonId:'aaaaaaab-1111-4111-8111-000000000004',track:null,ongoing:true,dayNumber:null,isUnlocked:true,automaticApproval:false,reason:''}]}});return;}
  await route.fulfill({json:{ongoing:options.settings?null:'daily',document:options.settings?document:publicLessonBlocks(document),revision,currentRevision:revision,editable:true,draft:null,previousDrafts:[]}});
 });
 await page.route('**/api/platform/ongoing-lessons**',async route=>{
  const q=new URL(route.request().url()).searchParams;
  if(route.request().method()==='GET'){
   if(q.get('action')==='settings'){await route.fulfill({json:{settings}});return;}
   const old=q.get('period')===past;
   await route.fulfill({json:{cadence:'daily',periodStart:old?past:period,periodEnd:old?period:end,currentPeriodStart:period,document:publicLessonBlocks(document),revision,draft:old?earlier:draft,completion:old?null:completion,stats:{completed:completion?1:0,opportunities:1,rate:completion?100:0},history:[{periodStart:past,periodEnd:period,updatedAt:past,completed:false}]}});return;
  }
  const body=route.request().postDataJSON();
  if(body.action==='configure'){configures.push(body);settings={lesson_id:body.lessonId,cadence:body.cadence};if(options.lost){options.lost=false;await route.fulfill({status:503,json:{error:'설정 응답 확인 실패'}});return;}await route.fulfill({json:settings});return;}
  expect(body.periodStart).toBe(period);
  if(body.action==='draft'){
   writes.push(body);if(options.expired){await route.fulfill({status:409,json:{error:'새 챌린지 기간이 시작되었습니다.'}});return;}
   if(options.saveFailure){options.saveFailure=false;await route.fulfill({status:503,json:{error:'답변 저장 실패'}});return;}
   draft={values:body.values,writeId:body.requestId,updatedAt:new Date().toISOString()};await route.fulfill({json:{writeId:draft.writeId,updatedAt:draft.updatedAt}});return;
  }
  expect(body.action).toBe('complete');completions.push(body);expect(body.values).toBeUndefined();expect(body.writeId).toBe(draft?.writeId);
  completion||={id:body.requestId,revision,writeId:body.writeId,createdAt:new Date().toISOString(),values:structuredClone(draft!.values),assessment:{quizzes:[]}};
  if(options.lost){options.lost=false;await route.fulfill({status:503,json:{error:'완료 응답 확인 실패'}});return;}
  await route.fulfill({json:completion});
 });
 return{writes,completions,configures,draft:()=>draft,completion:()=>completion};
}
async function fill(page:Page){await page.getByRole('textbox',{name:'오늘의 실행'}).fill('오늘 고객을 만났습니다.');await page.getByRole('textbox',{name:'주제'}).fill('고객 인터뷰');await page.getByRole('radio',{name:'예',exact:true}).check();await page.getByRole('checkbox',{name:'실행 확인'}).check();}
test('live generator, autosave and completion survive reopening; later edits preserve the completed snapshot',async({page},info)=>{
 const server=await backend(page);await page.goto('/lesson-blocks-test');await fill(page);await expect(page.locator('.lb-prompt pre')).toHaveText('주제: 고객 인터뷰');await expect(page.getByRole('button',{name:'프롬프트 만들기'})).toHaveCount(0);
 await page.getByRole('button',{name:'이번 기간 챌린지 완료'}).click();await expect(page.getByRole('status').filter({hasText:'이번 기간 완료'})).toBeVisible();expect(server.completions).toHaveLength(1);
 await page.getByRole('textbox',{name:'오늘의 실행'}).fill('완료 후 추가 메모');await expect(page.getByRole('status').filter({hasText:'답변 저장됨'})).toBeVisible();
 await page.getByText('완료 당시 답변 보기',{exact:true}).click();const fields=page.getByRole('textbox',{name:'오늘의 실행'});await expect(fields.nth(0)).toHaveValue('완료 후 추가 메모');await expect(fields.nth(1)).toHaveValue('오늘 고객을 만났습니다.');await expect(fields.nth(1)).toHaveAttribute('readonly','');
 // Read-only duplicate quizzes must not uncheck the editable current answer.
 await expect(page.getByRole('radio',{name:'예',exact:true}).nth(0)).toBeChecked();
 await page.reload();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('완료 후 추가 메모');await expect(page.getByRole('button',{name:'이번 기간 챌린지 완료'})).toHaveCount(0);
 expect(await page.evaluate(()=>window.document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('ongoing.png'),fullPage:true});
});
test('failed draft and lost completion retry the exact request without changing answers',async({page})=>{
 const server=await backend(page,{saveFailure:true,lost:true});await page.goto('/lesson-blocks-test');await fill(page);await page.getByRole('button',{name:'이번 기간 챌린지 완료'}).click();await expect(page.getByRole('alert')).toContainText('저장 실패');expect(server.completions).toHaveLength(0);
 await page.getByRole('button',{name:'이번 기간 챌린지 완료'}).click();await expect(page.getByRole('alert')).toContainText('완료 응답 확인 실패');await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveAttribute('readonly','');
 await page.getByRole('button',{name:'같은 답변으로 완료 결과 확인'}).click();await expect(page.getByRole('status').filter({hasText:'이번 기간 완료'})).toBeVisible();expect(server.writes[1]).toEqual(server.writes[0]);expect(server.completions[1]).toEqual(server.completions[0]);
});
test('expired period keeps unsaved input downloadable and never shows a completion',async({page})=>{
 const server=await backend(page,{expired:true});await page.goto('/lesson-blocks-test');await fill(page);await page.getByRole('button',{name:'이번 기간 챌린지 완료'}).click();await expect(page.getByRole('alert')).toContainText('새 챌린지 기간');await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('오늘 고객을 만났습니다.');expect(server.completions).toHaveLength(0);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'현재 답변 내려받기'}).click();expect((await downloaded).suggestedFilename()).toBe('내-지속-챌린지-답변.json');await expect(page.getByRole('button',{name:'이번 기간 챌린지 완료'})).toBeDisabled();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'이번 기간 다시 확인'}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('오늘 고객을 만났습니다.');
});
test('history is read-only and returning to this period restores its independent draft',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-blocks-test');await fill(page);await expect(page.getByRole('status').filter({hasText:'답변 저장됨'})).toBeVisible();
 await page.getByText('기간별 내 기록',{exact:true}).click();await page.getByRole('button',{name:/2026. 9. 28.*작성 중/}).click();await expect(page.getByText('이전 기간의 기록입니다.',{exact:false})).toBeVisible();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('어제의 답변');await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveAttribute('readonly','');await expect(page.getByRole('button',{name:'이번 기간 챌린지 완료'})).toHaveCount(0);
 const count=server.writes.length;await page.getByRole('button',{name:'이번 기간으로',exact:true}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('오늘 고객을 만났습니다.');expect(server.writes).toHaveLength(count);
});
test('actual classroom routes ongoing lessons separately and has no single-completion fallback',async({page},info)=>{
 await backend(page);await page.goto('/lesson-block-author-test');await page.getByRole('button',{name:'학생 화면 보기'}).click();await expect(page.getByRole('region',{name:'지속 챌린지'})).toBeVisible();await expect(page.getByRole('button',{name:'학습 완료하기',exact:true})).toHaveCount(0);await expect(page.locator('.lesson-header')).toContainText('지속 챌린지');
 if(info.project.name!=='desktop')await page.getByRole('button',{name:'학습 목록',exact:true}).click();await expect(page.getByRole('navigation',{name:'학습 종류'}).getByRole('link',{name:'지속 챌린지',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'기타 학습',exact:true})).toHaveCount(0);
});
test('author settings recover a lost acknowledgment with the same cadence and request',async({page})=>{
 const server=await backend(page,{settings:true,lost:true});await page.goto('/lesson-block-author-test');await page.getByText('지속 챌린지 반복 설정',{exact:true}).click();await page.getByRole('combobox',{name:'반복 주기'}).selectOption('weekly');await page.getByRole('button',{name:'지속 챌린지로 설정',exact:true}).click();await expect(page.getByRole('alert')).toContainText('응답 확인 실패');await expect(page.getByRole('combobox',{name:'반복 주기'})).toBeDisabled();
 await page.getByRole('button',{name:'같은 설정으로 저장 결과 확인'}).click();await expect(page.getByRole('status').filter({hasText:'주간 지속 챌린지'})).toBeVisible();expect(server.configures[1]).toEqual(server.configures[0]);await page.getByRole('button',{name:'편집 다시 열기'}).click();await page.getByText('지속 챌린지 반복 설정',{exact:true}).click();await expect(page.getByRole('combobox',{name:'반복 주기'})).toHaveValue('weekly');await expect(page.getByRole('combobox',{name:'반복 주기'})).toBeDisabled();
});
