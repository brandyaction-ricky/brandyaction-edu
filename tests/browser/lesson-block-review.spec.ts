import {test,expect,type BrowserContext} from '@playwright/test';
import type {LessonBlockAnswers,LessonBlockDocument} from '../../lib/lesson-blocks';
import type {BlockSubmission,BlockSubmissionDetail} from '../../lib/lesson-block-review';
const revision='44444444-4444-4444-8444-444444444444';
const initialId='55555555-5555-4555-8555-555555555555';
const doc:LessonBlockDocument={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'실행한 일',kind:'text',required:true}}],checklist:[],completion:{mode:'mentor',requireAnswers:true,requireQuizPass:false}};
async function backend(context:BrowserContext,options:{lostReview?:boolean;staleReview?:boolean;lostReopen?:boolean;approved?:boolean;failList?:boolean}={}){
 let draft={values:{blocks:{q:'처음 제출한 답변'},checklist:[]} as LessonBlockAnswers,writeId:'66666666-6666-4666-8666-666666666666',updatedAt:new Date().toISOString()};
 let receipt:BlockSubmission={id:initialId,stateId:initialId,revision,writeId:draft.writeId,outcome:'submitted',state:options.approved?'approved':'submitted',createdAt:new Date().toISOString()};
 const records:Record<string,BlockSubmissionDetail>={[receipt.id]:{document:doc,values:structuredClone(draft.values),submission:receipt,history:[]}};
 const decisions:Record<string,unknown>[]=[],reopens:Record<string,unknown>[]=[];
 function change(decision:BlockSubmission['state'],requestId:string,feedback=''){
  receipt={...receipt,state:decision,stateId:requestId,...(feedback?{feedback,feedbackId:requestId}:{})};records[receipt.id].submission=receipt;
  records[receipt.id].history.push({id:requestId,decision:decision!,feedback,createdAt:new Date().toISOString()});
  if(decision!=='approved')draft={...draft,writeId:requestId};
 }
 await context.route('**/api/admin/lesson-block-reviews**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='GET'){
   if(url.searchParams.has('submission')){const record=records[url.searchParams.get('submission')!];await route.fulfill({json:{...record,memberName:'시험 학생',courseTitle:'시험 과정',lessonTitle:'1일차',isLatest:record.submission.id===receipt.id,previousSubmissions:Object.values(records).filter(r=>r.submission.id!==record.submission.id).map(r=>r.submission)}});return;}
   // StrictMode may abort its first load after it reaches this mock. Keep the
   // outage active until the test explicitly recovers the backend.
   if(options.failList){await route.fulfill({status:503,json:{error:'검토 목록 조회 실패'}});return;}
   const state=url.searchParams.get('state'),rows=state&&state!==receipt.state?[]:[{id:receipt.id,memberName:'시험 학생',courseTitle:'시험 과정',lessonTitle:'1일차',submission:receipt}];
   await route.fulfill({json:{rows,total:rows.length,page:1,pageSize:20}});return;
  }
  const body=route.request().postDataJSON();decisions.push(body);
  if(options.staleReview){change('reopened','77777777-7777-4777-8777-777777777777');options.staleReview=false;await route.fulfill({status:409,json:{error:'검토 상태가 바뀌었습니다.'}});return;}
  if(body.decision==='feedback'){
   if(receipt.feedbackId!==body.requestId){
    receipt={...receipt,feedback:body.feedback,feedbackId:body.requestId};records[receipt.id].submission=receipt;
    records[receipt.id].history.push({id:body.requestId,decision:'feedback',feedback:body.feedback,createdAt:new Date().toISOString()});
   }
  }else if(receipt.stateId!==body.requestId)change(body.decision,body.requestId,body.feedback);
  if(options.lostReview){options.lostReview=false;await route.fulfill({status:503,json:{error:'결과 응답을 확인하지 못했습니다.'}});return;}
  await route.fulfill({json:receipt});
 });
 await context.route('**/api/platform/lesson-blocks**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='GET'){
   if(url.searchParams.has('submission')){const record=records[url.searchParams.get('submission')!];await route.fulfill({json:{...record,memberName:'시험 학생',courseTitle:'시험 과정',lessonTitle:'1일차',isLatest:record.submission.id===receipt.id,previousSubmissions:Object.values(records).filter(r=>r.submission.id!==record.submission.id).map(r=>r.submission)}});return;}
   await route.fulfill({json:{document:doc,revision,currentRevision:revision,draft,submission:receipt,submissions:Object.values(records).map(r=>r.submission).reverse(),previousDrafts:[]}});return;
  }
  const body=route.request().postDataJSON();
  if(body.action==='reopen'){
   reopens.push(body);if(receipt.stateId!==body.requestId)change('reopened',body.requestId);
   if(options.lostReopen){options.lostReopen=false;await route.fulfill({status:503,json:{error:'응답을 확인하지 못했습니다.'}});return;}
   await route.fulfill({json:receipt});return;
  }
  if(body.action==='draft'){
   if(body.expectedWriteId!==draft.writeId){await route.fulfill({status:409,json:{error:'다른 화면에서 답변을 저장했습니다.'}});return;}
   draft={values:body.values,writeId:body.requestId,updatedAt:new Date().toISOString()};await route.fulfill({json:{writeId:draft.writeId,updatedAt:draft.updatedAt}});return;
  }
  expect(body.action).toBe('submit');expect(body.writeId).toBe(draft.writeId);
  receipt={id:body.requestId,stateId:body.requestId,revision,writeId:draft.writeId,outcome:'submitted',state:'submitted',createdAt:new Date().toISOString()};
  records[receipt.id]={document:doc,values:structuredClone(draft.values),submission:receipt,history:[]};await route.fulfill({json:receipt});
 });
 return{decisions,reopens,records,receipt:()=>receipt,draft:()=>draft};
}
test('mentor requests revision, learner resumes preserved answers, resubmits, and mentor approves the new attempt',async({page,context},info)=>{
 const server=await backend(context);await page.goto('/lesson-block-review-test');await page.getByRole('button',{name:/시험 학생/}).click();
 await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveValue('처음 제출한 답변');await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveAttribute('readonly','');
 await page.getByRole('button',{name:'수정 요청하기'}).click();await expect(page.getByRole('status')).toContainText('피드백에 적어');
 await page.getByRole('textbox',{name:'멘토 피드백'}).fill('구체적인 고객 사례를 추가해 주세요.');await page.getByRole('button',{name:'수정 요청하기'}).click();await expect(page.getByText('검토 결과를 저장했습니다.',{exact:true})).toBeVisible();
 const student=await context.newPage();await student.goto('/lesson-blocks-test');await expect(student.getByText('구체적인 고객 사례를 추가해 주세요.',{exact:true})).toBeVisible();
 await expect(student.getByRole('textbox',{name:'실행한 일'})).toHaveValue('처음 제출한 답변');await student.getByRole('textbox',{name:'실행한 일'}).fill('고객 인터뷰 사례를 추가했습니다.');await student.getByRole('button',{name:'미션 제출하기'}).click();
 await expect(student.getByText('미션을 제출했습니다. 멘토의 확인을 기다려 주세요.',{exact:true})).toBeVisible();expect(Object.keys(server.records)).toHaveLength(2);
 await page.getByRole('button',{name:'목록 새로고침'}).click();await page.getByRole('button',{name:/시험 학생/}).click();await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveValue('고객 인터뷰 사례를 추가했습니다.');
 await page.getByRole('textbox',{name:'멘토 피드백'}).fill('이제 충분히 구체적입니다.');await page.getByRole('button',{name:'승인하기'}).click();await expect(page.getByText('검토 결과를 저장했습니다.',{exact:true})).toBeVisible();
 await student.getByRole('button',{name:'검토 결과 새로고침'}).click();await expect(student.getByText('멘토가 승인했습니다. 학습을 완료했습니다.',{exact:true})).toBeVisible();
 await student.getByText('내 제출 기록 (2건)',{exact:true}).click();await student.getByRole('button',{name:/1차 제출/}).click();const old=student.getByRole('region',{name:'이전 제출 답변'});
 await expect(old.getByRole('textbox',{name:'실행한 일'})).toHaveValue('처음 제출한 답변');await expect(old).toContainText('구체적인 고객 사례를 추가해 주세요.');
 await page.getByText('같은 학습의 다른 제출 기록',{exact:true}).click();await page.getByRole('button',{name:/· 수정 요청$/}).click();
 await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveValue('처음 제출한 답변');await expect(page.getByText('이후에 다시 제출한 답변이 있습니다. 현재 기록은 읽기만 가능합니다.')).toBeVisible();await expect(page.getByRole('button',{name:'승인하기'})).toHaveCount(0);
 await page.getByText('같은 학습의 다른 제출 기록',{exact:true}).click();await page.getByRole('button',{name:/· 승인 완료$/}).click();await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveValue('고객 인터뷰 사례를 추가했습니다.');
 await student.screenshot({path:info.outputPath('submission-history.png'),fullPage:true});await page.screenshot({path:info.outputPath('mentor-approved.png'),fullPage:true});
 expect(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('lost review response freezes feedback and repeats the identical request instead of a second decision',async({page,context})=>{
 const server=await backend(context,{lostReview:true});await page.goto('/lesson-block-review-test');await page.getByRole('button',{name:/시험 학생/}).click();await page.getByRole('textbox',{name:'멘토 피드백'}).fill('확인했습니다.');await page.getByRole('button',{name:'승인하기'}).click();
 await expect(page.getByRole('textbox',{name:'멘토 피드백'})).toBeDisabled();await expect(page.getByRole('button',{name:'수정 요청하기'})).toBeDisabled();await page.getByRole('button',{name:'같은 검토 요청 다시 확인'}).click();
 await expect(page.getByText('검토 결과를 저장했습니다.',{exact:true})).toBeVisible();expect(server.decisions).toHaveLength(2);expect(server.decisions[1]).toEqual(server.decisions[0]);
});
test('a learner reopening approved answers can retry a lost response and resumes without resetting values',async({page,context})=>{
 const server=await backend(context,{approved:true,lostReopen:true});await page.goto('/lesson-blocks-test');page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'답변 수정하기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('응답을 확인하지 못했습니다.');await page.getByRole('button',{name:'답변 수정하기',exact:true}).click();
 await expect(page.getByRole('button',{name:'미션 제출하기'})).toBeVisible();await expect(page.getByRole('textbox',{name:'실행한 일'})).toHaveValue('처음 제출한 답변');await page.getByRole('textbox',{name:'실행한 일'}).fill('더 나은 답변');
 expect(server.reopens).toHaveLength(2);expect(server.reopens[1]).toEqual(server.reopens[0]);expect(server.records[initialId].values.blocks.q).toBe('처음 제출한 답변');
});
test('stale decisions require a refresh and never display successful approval',async({page,context})=>{
 await backend(context,{staleReview:true});await page.goto('/lesson-block-review-test');await page.getByRole('button',{name:/시험 학생/}).click();await page.getByRole('button',{name:'승인하기'}).click();
 await expect(page.getByRole('status')).toContainText('상태가 바뀌었습니다');await expect(page.getByRole('button',{name:'승인하기'})).toBeDisabled();await expect(page.getByText('검토 결과를 저장했습니다.',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'제출 상태 다시 확인'}).click();await expect(page.getByRole('region',{name:'선택한 학습 제출물'}).locator('p').filter({hasText:'시험 과정 · 답변 수정 중'})).toBeVisible();await expect(page.getByRole('button',{name:'승인하기'})).toHaveCount(0);
});
test('list errors remain visible and can be retried without showing an empty success state',async({page,context})=>{
 const options={failList:true};await backend(context,options);await page.goto('/lesson-block-review-test');await expect(page.getByRole('alert')).toContainText('검토 목록 조회 실패',{timeout:15000});await expect(page.getByText('이 상태의 제출물이 없습니다.')).toHaveCount(0);
 options.failList=false;
 await page.getByRole('button',{name:'목록 새로고침'}).click();await expect(page.getByRole('button',{name:/시험 학생/})).toBeVisible();
});
test('feedback-only remains pending, survives empty approval, and approved work accepts more advice visible to its learner',async({page,context},info)=>{
 const server=await backend(context);await page.goto('/lesson-block-review-test');await page.getByRole('button',{name:/시험 학생/}).click();
 await expect(page.getByRole('button',{name:'피드백만 저장',exact:true})).toBeDisabled();await page.getByRole('textbox',{name:'멘토 피드백'}).fill('실행 과정에 대한 조언');await page.getByRole('button',{name:'피드백만 저장',exact:true}).click();
 await expect(page.getByText('피드백을 저장했습니다. 승인 상태는 그대로입니다.',{exact:true})).toBeVisible();expect(server.receipt().state).toBe('submitted');expect(server.receipt().stateId).toBe(initialId);expect(server.decisions[0].expectedFeedbackId).toBeNull();
 await page.getByRole('button',{name:'승인하기',exact:true}).click();await expect(page.getByText('검토 결과를 저장했습니다.',{exact:true})).toBeVisible();const approvedState=server.receipt().stateId;
 await page.getByRole('textbox',{name:'멘토 피드백'}).fill('승인 후 <script>추가 조언</script>');await page.getByRole('button',{name:'피드백만 저장',exact:true}).click();await expect(page.getByText('피드백을 저장했습니다. 승인 상태는 그대로입니다.',{exact:true})).toBeVisible();
 expect(server.receipt().stateId).toBe(approvedState);expect(server.receipt().state).toBe('approved');expect(server.records[initialId].values.blocks.q).toBe('처음 제출한 답변');expect(server.records[initialId].history.map(e=>e.decision)).toEqual(['feedback','approved','feedback']);
 const student=await context.newPage();await student.goto('/lesson-blocks-test');await expect(student.getByText('승인 후 <script>추가 조언</script>',{exact:true})).toBeVisible();await expect(student.getByText('멘토가 승인했습니다. 학습을 완료했습니다.',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('feedback-only.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('lost feedback response keeps the draft frozen and retries the same request without duplicate history',async({page,context})=>{
 const server=await backend(context,{lostReview:true});await page.goto('/lesson-block-review-test');await page.getByRole('button',{name:/시험 학생/}).click();await page.getByRole('textbox',{name:'멘토 피드백'}).fill('다시 확인할 조언');await page.getByRole('button',{name:'피드백만 저장',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'멘토 피드백'})).toBeDisabled();await expect(page.getByRole('button',{name:'승인하기',exact:true})).toBeDisabled();await page.getByRole('button',{name:'같은 검토 요청 다시 확인'}).click();
 await expect(page.getByText('피드백을 저장했습니다. 승인 상태는 그대로입니다.',{exact:true})).toBeVisible();expect(server.decisions).toHaveLength(2);expect(server.decisions[1]).toEqual(server.decisions[0]);expect(server.records[initialId].history).toHaveLength(1);expect(server.receipt().state).toBe('submitted');
});
test('stale feedback keeps typed content and requires a current-state refresh before resaving',async({page,context})=>{
 await backend(context,{staleReview:true});await page.goto('/lesson-block-review-test');await page.getByRole('button',{name:/시험 학생/}).click();await page.getByRole('textbox',{name:'멘토 피드백'}).fill('유지해야 할 조언');await page.getByRole('button',{name:'피드백만 저장',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('상태가 바뀌었습니다');await expect(page.getByRole('textbox',{name:'멘토 피드백'})).toHaveValue('유지해야 할 조언');await expect(page.getByRole('button',{name:'피드백만 저장',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'제출 상태 다시 확인'}).click();await expect(page.getByRole('button',{name:'피드백만 저장',exact:true})).toBeEnabled();await page.getByRole('button',{name:'피드백만 저장',exact:true}).click();await expect(page.getByText('피드백을 저장했습니다. 승인 상태는 그대로입니다.',{exact:true})).toBeVisible();
});
