import {test,expect} from '@playwright/test';
const actor='11111111-1111-4111-8111-111111111111',message='22222222-2222-4222-8222-222222222222',q='22222222-2222-4222-8222-222222222222',answer='33333333-3333-4333-8333-333333333333';
test('sent message removal has explicit cancel/confirm, retries lost receipt and disappears on reload',async({page},info)=>{
 let deleted=false,lost=true;const writes:unknown[]=[];
 await page.route('**/api/member/messages**',async route=>{
  const request=route.request(),query=new URL(request.url()).searchParams;
  if(request.method()==='POST'){const body=request.postDataJSON();writes.push(body);deleted=true;if(lost){lost=false;await route.abort();return;}await route.fulfill({json:{id:message,deletedAt:'2026-10-03T00:00:00Z'}});return;}
  await route.fulfill({json:query.get('action')==='recipients'?{rows:[],nextCursor:null}:{rows:query.get('box')==='sent'&&!deleted?[{id:message,senderId:actor,recipientId:q,recipientName:'검수 수강생',content:'잘못 보낸 안내',createdAt:'2026-10-03T00:00:00Z',readAt:null,canDelete:true}]:[],nextCursor:null,unreadCount:0,canSendToMembers:true}});
 });
 await page.goto('/messages-test');await page.getByRole('button',{name:'보낸 메시지',exact:true}).click();await page.getByRole('button',{name:'메시지 삭제',exact:true}).click();
 await expect(page.getByRole('group',{name:'메시지 삭제 확인'})).toContainText('이 수강생에게 보낸 메시지');await page.getByRole('button',{name:'취소',exact:true}).click();expect(writes).toHaveLength(0);
 await page.getByRole('button',{name:'메시지 삭제',exact:true}).click();await page.screenshot({path:info.outputPath('message-delete-confirm.png'),fullPage:true});
 await page.getByRole('button',{name:'삭제하기',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('group',{name:'메시지 삭제 확인'})).toBeVisible();
 await page.getByRole('button',{name:'삭제하기',exact:true}).click();await expect(page.getByRole('status')).toContainText('메시지를 삭제했습니다');expect(writes).toEqual([{action:'delete',messageId:message},{action:'delete',messageId:message}]);
 await expect(page.getByRole('button',{name:'메시지 삭제',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'메시지 새로고침'}).click();await expect(page.getByText('메시지가 없습니다.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('operator answer removal hides content for learner and keeps the answer form usable; learner has no delete control',async({page,context},info)=>{
 let deleted=false,lost=true;const writes:unknown[]=[];
 await context.route('**/api/platform/question-thread**',async route=>{
  const request=route.request(),student=(request.headers().referer||'').includes('student=1');
  if(request.method()==='POST'){const body=request.postDataJSON();writes.push(body);deleted=true;if(lost){lost=false;await route.abort();return;}await route.fulfill({json:{id:answer,questionId:q,deletedAt:'2026-10-03T00:00:00Z'}});return;}
  await route.fulfill({json:{question:{id:q,title:'검수 질문',content:'질문 원문',status:deleted?'open':'answered',resolved:false,archived:false,headId:answer},answers:deleted?[]:[{id:answer,source:'operator',authorName:'운영자',content:'삭제 대상 답변',createdAt:'2026-10-03T00:00:00Z',canDelete:!student}],nextCursor:null,canAnswer:!student,canFollowUp:student}});
 });
 await page.goto('/question-thread-test');await expect(page.getByText('삭제 대상 답변',{exact:true})).toBeVisible();
 const learner=await context.newPage();await learner.goto('/question-thread-test?student=1');await learner.getByRole('button',{name:'답변 전체 보기'}).click();await expect(learner.getByRole('button',{name:'답변 삭제'})).toHaveCount(0);await expect(learner.getByText('삭제 대상 답변',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'답변 삭제',exact:true}).click();await page.screenshot({path:info.outputPath('answer-delete-confirm.png'),fullPage:true});
 await page.getByRole('button',{name:'삭제하기',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'삭제하기',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'답변을 삭제했습니다'})).toBeVisible();await expect(page.getByText('삭제 대상 답변',{exact:true})).toHaveCount(0);
 expect(writes).toHaveLength(2);expect(writes[0]).toEqual({action:'delete',questionId:q,answerId:answer,expectedHeadId:answer});expect(writes[1]).toEqual(writes[0]);
 await learner.getByRole('button',{name:'최신 답변 확인'}).click();await expect(learner.getByText('삭제 대상 답변',{exact:true})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'새 답변'})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('actual administrator member conversation tab exposes delete only for own outgoing message',async({page},info)=>{
 let deleted=false;const writes:unknown[]=[];
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='POST'&&url.pathname==='/api/member/messages'){writes.push(request.postDataJSON());deleted=true;await route.fulfill({json:{id:message,deletedAt:'2026-10-03T00:00:00Z'}});return;}
  if(url.pathname!=='/api/admin/member-conversation'){await route.fulfill({json:{rows:[],total:0}});return;}
  const row={kind:'message',at:'2026-10-03T00:00:00Z',title:'',author:'운영자',direction:'outgoing',readAt:null,question:null,archived:false};
  await route.fulfill({json:{rows:[{...row,id:actor,author:'수강생',direction:'incoming',content:'수강생 메시지',canDelete:false},...(!deleted?[{...row,id:message,content:'내가 보낸 안내',canDelete:true}]:[])],nextCursor:null}});
 });
 await page.goto('/member-conversation-test');await page.getByRole('tab',{name:'대화 기록'}).click();const panel=page.getByRole('region',{name:'회원 대화 기록'});
 await expect(panel.getByRole('button',{name:'메시지 삭제'})).toHaveCount(1);await panel.getByRole('button',{name:'메시지 삭제'}).click();await page.screenshot({path:info.outputPath('member-conversation-delete.png'),fullPage:true});
 await panel.getByRole('button',{name:'삭제하기'}).click();await expect(panel.getByRole('status')).toContainText('메시지를 삭제했습니다');await expect(panel).not.toContainText('내가 보낸 안내');await expect(panel).toContainText('수강생 메시지');
 expect(writes).toEqual([{action:'delete',messageId:message}]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
