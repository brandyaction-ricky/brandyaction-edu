import {test,expect,type Page} from '@playwright/test';
const uid=(n:number)=>`aaaaaaaa-1111-4111-8111-${String(n).padStart(12,'0')}`;
const row=(n:number)=>({id:uid(n),senderId:uid(10),recipientId:uid(20),senderName:'담당 멘토',recipientName:'학습 회원',content:`메시지 ${n}\n<script>alert("실행 금지")</script>\nhttps://example.test/`+'아주긴내용'.repeat(60),createdAt:'2026-09-29T00:00:00Z',readAt:null});
async function backend(page:Page,options:{operator?:boolean;loseReceipt?:boolean;failRead?:boolean;failList?:boolean;rejectSend?:boolean;invalidReceipt?:boolean;delay?:Promise<void>}={}){
 const writes:Record<string,unknown>[]=[],queries:URLSearchParams[]=[];let sent=false;
 await page.route('**/api/member/messages**',async route=>{
  const request=route.request(),q=new URL(request.url()).searchParams;queries.push(q);
  if(request.method()==='POST'){
   const b=request.postDataJSON();writes.push(b);
   if(b.action==='read'){
    if(options.failRead){options.failRead=false;await route.fulfill({status:503,json:{error:'읽음 연결 실패'}});return;}
    await route.fulfill({json:{id:b.messageId,readAt:'2026-09-29T01:00:00Z'}});return;
   }
   if(options.rejectSend){options.rejectSend=false;await route.fulfill({status:409,json:{error:'받는 사람을 다시 확인해 주세요.'}});return;}
   sent=true;
   if(options.loseReceipt){options.loseReceipt=false;await route.abort();return;}
   if(options.invalidReceipt){options.invalidReceipt=false;await route.fulfill({json:{ok:true}});return;}
   await route.fulfill({json:{requestId:b.requestId,count:b.recipients.length||1,messageIds:b.recipients.length?b.recipients:[uid(3)],createdAt:'2026-09-29T01:00:00Z'}});return;
  }
  if(q.get('action')==='progress-cohorts'){await route.fulfill({json:{rows:[{id:uid(80),name:'4기',courseTitle:'문샷 챌린지'},{id:uid(81),name:'5기',courseTitle:'다른 기수'}]}});return;}
  if(q.get('action')==='recipients'){
   const isNext=q.has('after'),n=isNext?22:21;
   await route.fulfill({json:{rows:[{id:uid(n),name:`수강생 ${n}`,email:`student${n}@example.test`}],nextCursor:isNext?null:uid(n)}});return;
  }
  if(options.failList){options.failList=false;await route.fulfill({status:503,json:{error:'메시지 목록 연결 실패'}});return;}
  if(q.get('box')==='inbox'&&options.delay)await options.delay;
  await route.fulfill({json:{rows:q.get('box')==='sent'?(sent?[row(3)]:[]):q.has('before')?[row(2)]:[row(1)],nextCursor:q.get('box')==='inbox'&&!q.has('before')?'1':null,unreadCount:1,canSendToMembers:!!options.operator}});
 });return{writes,queries};
}
test('inbox is private plain text, read is explicit and reply preserves the original message',async({page},info)=>{
 const h=await backend(page);await page.goto('/messages-test');await expect(page.getByRole('button',{name:'내용 보기'})).toBeVisible();expect(h.writes).toHaveLength(0);
 await page.getByRole('button',{name:'내용 보기'}).click();await expect(page.locator('.edu-message-body')).toContainText('<script>');await expect(page.getByRole('button',{name:'받은 메시지 · 안 읽음 0'})).toBeVisible();
 expect(h.writes.filter(x=>x.action==='read')).toEqual([{action:'read',messageId:uid(1)}]);
 await page.getByRole('button',{name:'답장 작성'}).click();await expect(page.getByRole('heading',{name:'담당 멘토에게 답장'})).toBeVisible();
 await page.getByRole('textbox',{name:'메시지 내용'}).fill('확인했습니다');await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.getByText('1명에게 메시지를 보냈습니다.')).toBeVisible();
 expect(h.writes.find(x=>x.action==='send')).toMatchObject({replyTo:uid(1),recipients:[],content:'확인했습니다'});
 await page.getByRole('button',{name:'내용 보기'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
 await page.screenshot({path:info.outputPath('messages.png'),fullPage:true});
});
test('lost send receipt freezes recipient and body and retries the exact same request without a second message',async({page})=>{
 const h=await backend(page,{loseReceipt:true});await page.goto('/messages-test');await page.getByRole('textbox',{name:'메시지 내용'}).fill('중복 없이 문의');await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
 await expect(page.getByRole('button',{name:'전송 결과 다시 확인'})).toBeVisible();await expect(page.getByRole('textbox',{name:'메시지 내용'})).toBeDisabled();
 await page.getByRole('button',{name:'전송 결과 다시 확인'}).click();await expect(page.getByText('1명에게 메시지를 보냈습니다.')).toBeVisible();
 const sends=h.writes.filter(x=>x.action==='send');expect(sends).toHaveLength(2);expect(sends[1]).toEqual(sends[0]);await expect(page.getByRole('textbox',{name:'메시지 내용'})).toHaveValue('');
});
test('operator selects exact recipients across pages and applies the historical ongoing completion filter',async({page})=>{
 const h=await backend(page,{operator:true});await page.goto('/messages-test?ongoing='+uid(80));await page.getByRole('button',{name:'이 페이지 회원 모두 선택'}).click();await page.getByRole('button',{name:'다음 회원 목록'}).click();await page.getByRole('checkbox',{name:/수강생 22/}).check();
 await expect(page.getByText('선택한 회원 2명 · 한 번에 최대 100명')).toBeVisible();await expect(page.getByRole('listitem')).toHaveCount(2);
 await page.getByRole('textbox',{name:'메시지 내용'}).fill('계속 실천해 보세요');await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.getByText('2명에게 메시지를 보냈습니다.')).toBeVisible();
 expect(h.writes.find(x=>x.action==='send')).toMatchObject({recipients:[uid(21),uid(22)],ongoingLesson:uid(80)});expect(h.queries.filter(q=>q.get('action')==='recipients').every(q=>q.get('ongoing')===uid(80))).toBe(true);
});
test('list and read failures remain retryable without claiming a successful read',async({page})=>{
 await backend(page,{failList:true,failRead:true});await page.goto('/messages-test');await expect(page.getByRole('alert')).toHaveText('메시지 목록 연결 실패');await expect(page.getByRole('button',{name:'메시지 보내기',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'메시지 새로고침'}).click();await page.getByRole('button',{name:'내용 보기'}).click();await expect(page.getByRole('alert')).toHaveText('읽음 연결 실패');await expect(page.getByRole('button',{name:'받은 메시지 · 안 읽음 1'})).toBeVisible();
 await page.getByRole('button',{name:'읽음 표시 다시 확인'}).click();await expect(page.getByRole('button',{name:'받은 메시지 · 안 읽음 0'})).toBeVisible();
});
test('definitive validation error allows correction; malformed success remains uncertain',async({page})=>{
 const h=await backend(page,{rejectSend:true,invalidReceipt:true});await page.goto('/messages-test');await page.getByRole('textbox',{name:'메시지 내용'}).fill('첫 문의');await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('받는 사람을 다시 확인해 주세요.');
 await page.getByRole('textbox',{name:'메시지 내용'}).fill('수정한 문의');await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.getByRole('button',{name:'전송 결과 다시 확인'})).toBeVisible();
 await page.getByRole('button',{name:'전송 결과 다시 확인'}).click();await expect(page.getByText('1명에게 메시지를 보냈습니다.')).toBeVisible();const sends=h.writes.filter(x=>x.action==='send');expect(sends[0].requestId).not.toBe(sends[1].requestId);expect(sends[1]).toEqual(sends[2]);
});
test('late inbox response cannot replace sent view and pagination keeps old messages separate',async({page})=>{
 let release!:()=>void;const delay=new Promise<void>(resolve=>{release=resolve;});await backend(page,{delay});await page.goto('/messages-test');await page.getByRole('button',{name:'보낸 메시지',exact:true}).click();await expect(page.getByText('메시지가 없습니다.')).toBeVisible();release();
 await expect(page.getByRole('button',{name:'내용 보기'})).toHaveCount(0);await page.getByRole('button',{name:/받은 메시지/}).click();await page.getByRole('button',{name:'이전 메시지',exact:true}).click();await page.getByRole('button',{name:'내용 보기'}).click();await expect(page.locator('.edu-message-body')).toContainText('메시지 2');
 await page.getByRole('button',{name:'최신 메시지',exact:true}).click();await page.getByRole('button',{name:'내용 보기'}).click();await expect(page.locator('.edu-message-body')).toContainText('메시지 1');
});

test('progress group selection scopes every page, clears on changes and sends the frozen scope',async({page},info)=>{
 const h=await backend(page,{operator:true,loseReceipt:true});await page.goto('/messages-test?progress');
 await page.getByRole('combobox',{name:'진도별 대상 기수'}).selectOption(uid(80));
 await page.getByRole('combobox',{name:'현재 진행 일차'}).selectOption('5');
 await page.getByRole('button',{name:'이 조건의 회원 모두 선택'}).click();
 await expect(page.getByText('선택한 회원 2명 · 한 번에 최대 100명')).toBeVisible();
 await page.getByRole('combobox',{name:'진도 과정'}).selectOption('learning');
 await expect(page.getByText('선택한 회원 0명 · 한 번에 최대 100명')).toBeVisible();
 await page.getByRole('button',{name:'이 조건의 회원 모두 선택'}).click();await expect(page.getByText('선택한 회원 2명 · 한 번에 최대 100명')).toBeVisible();
 await page.getByRole('textbox',{name:'메시지 내용'}).fill('학습 5일차 안내');
 await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
 await expect(page.getByRole('button',{name:'전송 결과 다시 확인'})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'진도별 대상 기수'})).toBeDisabled();
 await expect(page.getByRole('combobox',{name:'현재 진행 일차'})).toBeDisabled();
 await page.getByRole('button',{name:'전송 결과 다시 확인'}).click();await expect(page.getByText('2명에게 메시지를 보냈습니다.')).toBeVisible();
 const sends=h.writes.filter(x=>x.action==='send');expect(sends[1]).toEqual(sends[0]);expect(sends[0]).toMatchObject({progress:{cohortId:uid(80),track:'learning',day:5},recipients:[uid(21),uid(22)],ongoingLesson:null});
 expect(h.queries.some(q=>q.get('after')===uid(21)&&q.get('cohort')===uid(80)&&q.get('track')==='learning'&&q.get('day')==='5')).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
 await page.screenshot({path:info.outputPath('progress-message-group.png'),fullPage:true});
});

test('over 100 group recipients are never partially selected and group changes cannot retain an old selection',async({page})=>{
 await backend(page,{operator:true});await page.route('**/api/member/messages**',async route=>{
  const q=new URL(route.request().url()).searchParams;
  if(q.get('action')!=='recipients'||!q.has('cohort')){await route.fallback();return;}
  const after=Number((q.get('after')||'0').split('-').at(-1)),start=after||100;
  await route.fulfill({json:{rows:Array.from({length:25},(_,i)=>({id:uid(start+i+1),name:'수강생 '+(start+i+1),email:'test@example.test'})),nextCursor:uid(start+25)}});
 });
 await page.goto('/messages-test?progress');await page.getByRole('button',{name:'이 페이지 회원 모두 선택'}).click();
 await page.getByRole('combobox',{name:'진도별 대상 기수'}).selectOption(uid(80));await expect(page.getByText('선택한 회원 0명 · 한 번에 최대 100명')).toBeVisible();
 await page.getByRole('button',{name:'이 조건의 회원 모두 선택'}).click();await expect(page.getByRole('alert')).toContainText('100명을 넘습니다');
 await expect(page.getByText('선택한 회원 0명 · 한 번에 최대 100명')).toBeVisible();
 await page.getByRole('button',{name:'이 페이지 회원 모두 선택'}).click();await expect(page.getByText('선택한 회원 25명 · 한 번에 최대 100명')).toBeVisible();
 await page.getByRole('combobox',{name:'진도별 대상 기수'}).selectOption(uid(81));await expect(page.getByText('선택한 회원 0명 · 한 번에 최대 100명')).toBeVisible();
});

test('recipient group metadata failure can recover without allowing an incomplete scope',async({page})=>{
 await backend(page,{operator:true});let failed=true;
 await page.route('**/api/member/messages?action=progress-cohorts',async route=>{if(failed)await route.fulfill({status:503,json:{error:'기수 목록 연결 실패'}});else await route.fallback();});
 await page.goto('/messages-test?progress');await expect(page.getByRole('alert')).toContainText('기수 목록 연결 실패');
 await expect(page.getByRole('combobox',{name:'진도별 대상 기수'})).toBeDisabled();await expect(page.getByRole('combobox',{name:'현재 진행 일차'})).toBeDisabled();
 failed=false;await page.getByRole('button',{name:'기수 목록 다시 확인'}).click();await expect(page.getByRole('combobox',{name:'진도별 대상 기수'})).toBeEnabled();
 await page.getByRole('combobox',{name:'진도별 대상 기수'}).selectOption(uid(80));
 await expect(page.getByRole('combobox',{name:'현재 진행 일차'})).toBeEnabled();
});
