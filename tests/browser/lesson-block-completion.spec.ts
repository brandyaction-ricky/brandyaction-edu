import {expect,test,type Page} from '@playwright/test';
import {assessBlockCompletion,publicLessonBlocks,validateBlockAnswers,type LessonBlockDocument,type LessonBlockAnswers} from '../../lib/lesson-blocks';
const revision='44444444-4444-4444-8444-444444444444';
const doc:LessonBlockDocument={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'실행한 일',kind:'text',required:true}},{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'a',prompt:'맞는 답은?',options:['정답','오답'],correctIndex:0}]}}],checklist:[{id:'c',label:'실행 확인',required:true}]};
async function backend(page:Page,document=doc,options:{saveFailure?:boolean;lostSubmit?:boolean;conflict?:boolean;delay?:boolean}={}){
 let draft:{values:LessonBlockAnswers;writeId:string;updatedAt:string}|null=null,submission:Record<string,unknown>|null=null;
 const writes:Record<string,unknown>[]=[],submits:Record<string,unknown>[]=[];let release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  if(route.request().method()==='GET'){
      if (new URL(route.request().url()).searchParams.get('action') === 'progression') { await route.fulfill({json:{lessons:[{lessonId:'aaaaaaab-1111-4111-8111-000000000004',isUnlocked:true,track:null,dayNumber:null,automaticApproval:false,reason:''}]}}); return; }
await route.fulfill({json:{document:publicLessonBlocks(document),revision,currentRevision:revision,draft,submission,previousDrafts:[],editable:true}});return;}
  const body=route.request().postDataJSON();
  if(body.action==='draft'){
   writes.push(body);if(options.delay)await gate;
   if(options.saveFailure){options.saveFailure=false;await route.fulfill({status:503,json:{error:'답변 저장 실패'}});return;}
   draft={values:validateBlockAnswers(body.values,document),writeId:body.requestId,updatedAt:new Date().toISOString()};await route.fulfill({json:{writeId:draft.writeId,updatedAt:draft.updatedAt}});return;
  }
  expect(body.action).toBe('submit');submits.push(body);
  if(options.conflict){await route.fulfill({status:409,json:{error:'다른 화면에서 답변을 저장했습니다.'}});return;}
  expect(body.writeId).toBe(draft?.writeId);expect(body.values).toBeUndefined();
  const assessment=assessBlockCompletion(document,draft!.values);
  if(!assessment.ready){await route.fulfill({status:422,json:{error:'시험 통과 기준을 확인해 주세요.',assessment}});return;}
  submission ||= {id:body.requestId,revision,writeId:body.writeId,outcome:document.completion?.mode==='mentor'?'submitted':'completed',createdAt:new Date().toISOString()};
  if(options.lostSubmit){options.lostSubmit=false;await route.fulfill({status:503,json:{error:'제출 응답을 확인하지 못했습니다.'}});return;}
  await route.fulfill({json:submission});
 });
 return{writes,submits,release,draft:()=>draft,submission:()=>submission};
}
async function fill(page:Page,correct=true){await page.getByRole('textbox',{name:'실행한 일'}).fill('고객 질문을 정리했습니다.');await page.getByRole('radio',{name:correct?'정답':'오답',exact:true}).check();await page.getByRole('checkbox',{name:'실행 확인'}).check();}
test('missing answers and a failed quiz block completion, then corrected saved answers complete and remain read-only on reopen',async({page},info)=>{
 const server=await backend(page);await page.goto('/lesson-blocks-test');const submit=page.getByRole('button',{name:'학습 완료하기',exact:true});
 await submit.click();await expect(page.getByRole('alert')).toContainText('실행한 일');expect(server.submits).toHaveLength(0);
 await fill(page,false);await submit.click();await expect(page.getByRole('alert')).toContainText('시험 통과');expect(server.submission()).toBeNull();
 await page.getByRole('radio',{name:'정답',exact:true}).check();await submit.click();await expect(page.getByRole('status').filter({hasText:'학습을 완료했습니다.'})).toBeVisible();
 expect(server.draft()!.values.blocks.q).toBe('고객 질문을 정리했습니다.');await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveAttribute('readonly','');
 await page.reload();await expect(page.getByRole('status').filter({hasText:'학습을 완료했습니다.'})).toBeVisible();await expect(submit).toHaveCount(0);
 await page.screenshot({path:info.outputPath('completed.png'),fullPage:true});
});
test('a failed save never submits, and retry uses the same draft request before completing',async({page})=>{
 const server=await backend(page,doc,{saveFailure:true});await page.goto('/lesson-blocks-test');await fill(page);const submit=page.getByRole('button',{name:'학습 완료하기',exact:true});
 await submit.click();await expect(page.getByRole('region',{name:'학습 제출'}).getByRole('alert')).toContainText('저장 실패');expect(server.submits).toHaveLength(0);
 await submit.click();await expect(page.getByRole('status').filter({hasText:'학습을 완료했습니다.'})).toBeVisible();expect(server.writes[1]).toEqual(server.writes[0]);expect(server.submits).toHaveLength(1);
});
test('completion waits for an in-flight draft acknowledgment and prevents editing during submission',async({page})=>{
 const server=await backend(page,doc,{delay:true});await page.goto('/lesson-blocks-test');await fill(page);await page.getByRole('button',{name:'학습 완료하기',exact:true}).click();
 await expect(page.getByRole('button',{name:'저장·제출 중…'})).toBeDisabled();expect(server.submits).toHaveLength(0);await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveAttribute('readonly','');
 server.release();await expect(page.getByRole('status').filter({hasText:'학습을 완료했습니다.'})).toBeVisible();expect(server.submits).toHaveLength(1);
});
test('lost submit acknowledgment freezes edits and retries the identical submission id',async({page})=>{
 const server=await backend(page,doc,{lostSubmit:true});await page.goto('/lesson-blocks-test');await fill(page);await page.getByRole('button',{name:'학습 완료하기',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('같은 답변으로 다시 제출');await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveAttribute('readonly','');
 await page.getByRole('button',{name:'학습 완료하기',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'학습을 완료했습니다.'})).toBeVisible();expect(server.submits).toHaveLength(2);expect(server.submits[1]).toEqual(server.submits[0]);
});
test('daily checklist-only mode allows practice answers to remain empty and clearly waits for mentor',async({page},info)=>{
 const daily={...doc,completion:{mode:'mentor' as const,requireAnswers:false,requireQuizPass:false}};
 const server=await backend(page,daily);await page.goto('/lesson-blocks-test');await page.getByRole('checkbox',{name:'실행 확인'}).check();await page.getByRole('button',{name:'미션 제출하기'}).click();
 await expect(page.getByRole('status').filter({hasText:'멘토의 확인을 기다려 주세요.'})).toBeVisible();expect(server.submission()!.outcome).toBe('submitted');await expect(page.getByRole('button',{name:'학습 완료하기'})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('mentor-pending.png'),fullPage:true});
});
test('content-only lessons save an empty draft before completion; stale responses never show success',async({page})=>{
 const server=await backend(page,{schemaVersion:1,blocks:[],checklist:[]},{conflict:true});await page.goto('/lesson-blocks-test');await page.getByRole('button',{name:'학습 완료하기'}).click();
 await expect(page.getByRole('alert')).toContainText('다른 화면');expect(server.writes).toHaveLength(1);expect(server.draft()!.values).toEqual({blocks:{},checklist:[]});await expect(page.getByText('학습을 완료했습니다.',{exact:true})).toHaveCount(0);
});
test('actual classroom has only the gated completion action and updates the lesson badge after success',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await page.getByRole('button',{name:'학생 화면 보기'}).click();
 await expect(page.getByRole('button',{name:'학습 완료하기',exact:true})).toHaveCount(1);await fill(page);await page.getByRole('button',{name:'학습 완료하기',exact:true}).click();
 await expect(page.locator('.lesson-header')).toContainText('학습 완료');await expect(page.getByText('합성 4기 · 1개 학습 완료')).toBeVisible();expect(server.submits).toHaveLength(1);
});
