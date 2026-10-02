import {test,expect,type Page} from '@playwright/test';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const context={enrollmentId:id(1),lessonId:id(4),label:'문샷 4기 · 1주차 · 첫 학습',recent:true};
const shared={id:id(11),title:'이미지를 붙여넣으려면?',answer:'복사한 이미지를 입력란에 붙여넣으세요.',context:context.label,lessonId:id(4),enrollmentId:id(1)};
async function backend(page:Page,{fail=false,searchFail=false}={}){
 const bodies:Record<string,unknown>[]=[];let saved=false;
 await page.route('**/api/platform/question-hub**',async r=>{
  if(r.request().method()==='POST'){bodies.push(r.request().postDataJSON());if(fail&&bodies.length===1)return r.fulfill({status:503,json:{error:'등록 결과 확인 실패'}});saved=true;return r.fulfill({json:{question:{id:id(9)}}});}
  const mode=new URL(r.request().url()).searchParams.get('mode');
  if(mode==='contexts')return r.fulfill({json:{contexts:[context]}});
  if(mode==='shared')return r.fulfill(searchFail?{status:503,json:{error:'추천 연결 실패'}}:{json:{answers:[shared],hasMore:false}});
  return r.fulfill({json:{questions:saved?[{id:id(9),title:'질문 자동 제목',content:'이미지가 안 보여요',status:'open',sharing_requested:false}]:[],hasMore:false}});
 });
 await page.route('**/api/platform/lesson-questions?**',r=>r.fulfill({json:{questions:[],hasMore:false}}));
 return{bodies};
}
test('public-by-default composer suggests recent lesson, preserves draft across tabs and keeps failed submission idempotent',async({page},info)=>{
 const h=await backend(page,{fail:true});await page.goto('/question-hub-test');await page.getByRole('tab',{name:'질문하기',exact:true}).click();
 await expect(page.getByLabel('관련 학습')).toHaveValue(id(1)+':'+id(4));await expect(page.getByRole('radio',{name:'전체 공개',exact:true})).toBeChecked();
 await page.getByRole('textbox',{name:'질문 내용',exact:true}).fill('이미지가 안 보여요');
 await page.locator('summary').filter({hasText:shared.title}).click();await expect(page.getByText(shared.answer,{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('question-composer.png'),fullPage:true});
 await page.getByRole('tab',{name:'전체 질문'}).click();await expect(page.getByLabel('질문 검색')).toBeVisible();await page.getByRole('tab',{name:'질문하기',exact:true}).click();await expect(page.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue('이미지가 안 보여요');
 await page.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(page.getByRole('alert')).toContainText('등록 결과 확인 실패');await expect(page.getByLabel('관련 학습')).toBeDisabled();
 await page.getByRole('button',{name:'등록 결과 다시 확인'}).click();expect(h.bodies).toHaveLength(2);expect(h.bodies[1]).toEqual(h.bodies[0]);expect(h.bodies[0]).toMatchObject({lessonId:id(4),enrollmentId:id(1),title:'',share:false,visibility:'cohort'});
 await expect(page.getByRole('heading',{name:'질문 자동 제목'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('question-hub.png'),fullPage:true});
});
test('payment questions need no lesson; suggestions failing never block writing',async({page})=>{
 const h=await backend(page,{searchFail:true});await page.goto('/question-hub-test');await page.getByRole('tab',{name:'질문하기',exact:true}).click();await page.getByRole('textbox',{name:'질문 내용',exact:true}).fill('현재 문구가 궁금해요');await expect(page.getByText('비슷한 답변을 불러오지 못했습니다. 질문은 그대로 등록할 수 있습니다.')).toBeVisible();
 await page.getByLabel('문의 종류').selectOption('payment');await expect(page.getByLabel('관련 학습')).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);await page.getByRole('button',{name:'질문 등록',exact:true}).click();expect(h.bodies[0]).toMatchObject({category:'payment',lessonId:null,enrollmentId:null,share:false,visibility:'private'});
});
test('lesson entry uses same title-first composer with current lesson already selected',async({page})=>{
 const h=await backend(page);await page.goto('/question-hub-test?lesson=1');await page.getByRole('button',{name:'이 학습에 질문하기',exact:true}).click();await expect(page.getByLabel('관련 학습')).toHaveValue(id(1)+':'+id(4));await page.getByRole('textbox',{name:'질문 내용',exact:true}).fill('첫 학습의 질문입니다');await page.getByRole('radio',{name:'비밀 질문',exact:true}).check();await page.getByRole('button',{name:'질문 등록',exact:true}).click();expect(h.bodies[0]).toMatchObject({lessonId:id(4),share:false,visibility:'private'});await expect(page.getByText('질문을 등록했습니다. 질문·답변에서도 확인할 수 있습니다.')).toBeVisible();
});
test('learner resolves an answered question without adding an answer',async({page})=>{
 await backend(page);let resolved=false;const writes:Record<string,unknown>[]=[];
 await page.route('**/api/platform/question-hub?mode=mine**',r=>r.fulfill({json:{questions:[{id:id(9),title:'내 질문',content:'질문 본문',answer:'운영자 답변',status:'answered',is_resolved:resolved}],hasMore:false}}));
 await page.route('**/api/platform/question-thread?**',r=>{if(r.request().method()==='POST'){writes.push(r.request().postDataJSON());resolved=true;return r.fulfill({json:{id:id(9),resolved:true}});}return r.fulfill({json:{question:{id:id(9),title:'내 질문',content:'질문 본문',headId:id(10),status:'answered',resolved},answers:[{id:id(10),content:'운영자 답변',authorName:'운영자',source:'operator'}],canFollowUp:true,nextCursor:null}});});
 await page.goto('/question-hub-test');await page.getByRole('tab',{name:'내 질문',exact:true}).click();await page.getByRole('button',{name:'답변 전체 보기'}).click();await page.getByRole('button',{name:'해결됐어요',exact:true}).click();await expect(page.getByText('해결 완료',{exact:true}).last()).toBeVisible();expect(writes).toEqual([{action:'finish',questionId:id(9),expectedHeadId:id(10)}]);
});
test('operator shares only separately reviewed text and can prepare/import an Aside draft without sending it',async({page})=>{
 let sharedSaved=false,job:Record<string,unknown>|null=null;const answers:Record<string,unknown>[]=[];
 await page.route('**/api/platform/question-thread?**',r=>r.request().method()==='POST'?(answers.push(r.request().postDataJSON()),r.fulfill({json:{id:answers.at(-1)!.requestId,questionId:id(9)}})):r.fulfill({json:{question:{id:id(9),title:'학생 원문',content:'개인 사업 정보 원문',headId:null,status:'open',resolved:false},answers:[],canAnswer:true,nextCursor:null}}));
 await page.route('**/api/admin/questions/hub**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{question:{sharing_requested:true,category:'learning',lesson_id:id(4)},shared:null,job}});
  const body=r.request().postDataJSON();if(body.action==='publish'){sharedSaved=true;expect(body).toMatchObject({reviewed:true,title:'공유할 일반 질문',answer:'공유할 일반 답변',published:true});return r.fulfill({json:{published:true}});}
  if(body.action==='export'){job={id:body.requestId,status:'waiting',expectedHeadId:null,draft:null};return r.fulfill({json:{job,handoff:{schemaVersion:1,jobId:body.requestId,question:{content:'개인 사업 정보 원문'}}}});}
  job={...job,draft:body.draft,status:'draft'};return r.fulfill({json:{job}});
 });
 await page.goto('/question-hub-test?admin=1');await page.getByText('함께 보는 답변 만들기',{exact:true}).click();await page.getByLabel('공유할 질문 제목').fill('공유할 일반 질문');await page.getByLabel('공유할 답변',{exact:true}).fill('공유할 일반 답변');await page.getByLabel('함께 보는 답변에 게시').check();await expect(page.getByRole('button',{name:'공유 답변 저장'})).toBeDisabled();await page.getByLabel('이름·연락처·개인 사업정보를 지웠고 답변 내용을 확인했습니다.').check();await page.getByRole('button',{name:'공유 답변 저장'}).click();await expect(page.getByText('공유 답변을 게시했습니다.')).toBeVisible();expect(sharedSaved).toBe(true);expect(answers).toHaveLength(0);
 await page.getByText('어사이드 연결 준비',{exact:true}).click();await page.getByRole('button',{name:'연결용 자료 준비'}).click();await expect(page.getByLabel('어사이드에 전달할 자료')).toContainText('schemaVersion');await page.getByLabel('어사이드 답변 초안 가져오기').fill('어사이드가 작성한 초안');await page.getByRole('button',{name:'초안 저장',exact:true}).click();await page.getByRole('button',{name:'검토할 답변에 넣기'}).click();await expect(page.getByRole('textbox',{name:'새 답변',exact:true})).toHaveValue('어사이드가 작성한 초안');expect(answers).toHaveLength(0);await page.getByRole('textbox',{name:'새 답변',exact:true}).fill('운영자가 확인한 답변');await page.getByRole('button',{name:'답변 추가하기'}).click();expect(answers[0]).toMatchObject({content:'운영자가 확인한 답변',assistJobId:job!.id});
});
test('public questions display peer replies without follow-up controls, and title precedes the body on narrow screens',async({page})=>{
 await backend(page);
 await page.route('**/api/platform/question-hub?mode=public**',r=>r.fulfill({json:{questions:[{id:id(9),title:'다른 수강생 질문',content:'공개 질문 내용',answer:'함께 보는 답변',visibility:'cohort',mine:false,status:'answered'}],hasMore:false}}));
 await page.route('**/api/platform/question-thread?**',r=>r.fulfill({json:{question:{id:id(9),status:'answered',visibility:'cohort'},answers:[{id:id(10),content:'함께 보는 답변',authorName:'운영자'}],canFollowUp:false,nextCursor:null}}));
 await page.goto('/question-hub-test');await expect(page.getByRole('heading',{name:'다른 수강생 질문'})).toBeVisible();await page.getByRole('button',{name:'답변 전체 보기'}).click();await expect(page.getByRole('textbox',{name:'후속 질문',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'해결됐어요'})).toHaveCount(0);
 await page.getByRole('tab',{name:'질문하기',exact:true}).click();
 const title=await page.getByRole('textbox',{name:'질문 제목 (선택)',exact:true}).boundingBox(),body=await page.getByRole('textbox',{name:'질문 내용',exact:true}).boundingBox();expect(title!.y).toBeLessThan(body!.y);
 await expect(page.getByRole('radio',{name:'전체 공개',exact:true})).toBeChecked();await page.getByRole('radio',{name:'비밀 질문',exact:true}).check();await expect(page.getByText('나와 담당 운영자만 질문과 답변을 볼 수 있어요.')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('member navigation uses Q&A only and preserves old messages as read-only history',async({page},info)=>{
 await backend(page);
 await page.route('**/api/member/messages**',r=>r.fulfill({json:{rows:[{id:id(12),content:'이전 개인 대화',senderName:'운영자',createdAt:new Date().toISOString(),readAt:null}],canSendToMembers:false,unreadCount:1,nextCursor:null}}));
 await page.route('**/api/member/push**',r=>r.fulfill({json:{enabled:false}}));
 await page.goto('/question-hub-test?member=1');
 const nav=page.getByRole('navigation',{name:'마이페이지',exact:true});
 await expect(nav.getByRole('link',{name:'질문·답변',exact:true})).toBeVisible();await expect(nav.getByRole('link',{name:'메시지',exact:true})).toHaveCount(0);await expect(nav.getByRole('link',{name:'내 자료실',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'이용 문의',exact:true})).toHaveCount(0);
 await page.locator('summary').filter({hasText:'이전 메시지 기록'}).click();await page.getByRole('button',{name:'내용 보기',exact:true}).click();await expect(page.getByText('이전 개인 대화')).toBeVisible();await expect(page.getByRole('button',{name:'답장 작성'})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'메시지 내용'})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('unified-member-questions.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
