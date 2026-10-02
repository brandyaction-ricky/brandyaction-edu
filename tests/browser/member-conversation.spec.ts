import {test,expect,type Page} from '@playwright/test';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const at='2026-09-29T01:00:00.123456+00:00';
async function backend(page:Page){
 const reads:string[]=[],writes:string[]=[];let failure=false,delay=0;
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());if(request.method()!=='GET')writes.push(request.method());
  if(!url.pathname.endsWith('/member-conversation')){await route.fulfill({json:{rows:[],total:0}});return;}
  reads.push(url.search);if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  if(failure){await route.fulfill({status:503,json:{error:'대화 기록 조회 장애'}});return;}
  const other=url.searchParams.get('member')===id(3),older=url.searchParams.has('before');
  const row={id:id(9),kind:'message',at,title:'',author:'대화 시험 회원',content:'첫째 줄\n둘째 줄 <script>unsafe()</script>',direction:'incoming',readAt:null,question:null,archived:false};
  await route.fulfill({json:{rows:other?[]:older?[{...row,kind:'answer',title:'질문 제목',content:'운영자 답변',author:'운영자',question:id(10),archived:true}]:[row,{...row,id:id(10),kind:'question',title:'질문 제목',content:'회원 질문 원문',question:id(10)}],nextCursor:other||older?null:{at,id:id(10),kind:'question'}}});
 });return{reads,writes,fail:(value:boolean)=>{failure=value;},delay:(value:number)=>{delay=value;}};
}
test('customer conversation tab loads lazily, preserves text and read status, and pages without writes',async({page},info)=>{
 const server=await backend(page);await page.goto('/member-conversation-test');await expect(page.getByText('회원 정보',{exact:true})).toBeVisible();expect(server.reads).toHaveLength(0);
 await page.getByRole('tab',{name:'대화 기록'}).click();const panel=page.getByRole('region',{name:'회원 대화 기록'});await expect(panel).toContainText('회원에게 받은 메시지');await expect(panel).toContainText('아직 읽지 않음');
 await expect(panel.locator('.conversation-content').first()).toHaveText('첫째 줄\n둘째 줄 <script>unsafe()</script>');await expect(panel.locator('script')).toHaveCount(0);
 await expect(panel.getByRole('link',{name:'질문·전체 답변 보기'})).toHaveAttribute('href','/admin/questions?question='+id(10));await expect(panel.getByRole('link',{name:'질문·답변 관리'})).toHaveAttribute('href','/admin/questions');await expect(panel.getByRole('link',{name:'내 메시지함 열기'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));await page.screenshot({path:info.outputPath('member-conversation.png'),fullPage:false});
 await panel.getByRole('button',{name:'이전 대화 더 보기'}).click();await expect(panel).toContainText('운영자 답변');await expect(panel).toContainText('보관된 질문');await expect(panel).toContainText('2페이지');expect(decodeURIComponent(server.reads.at(-1)!)).toContain('.123456');
 await expect(panel.getByRole('button',{name:'이전 대화 더 보기'})).toBeDisabled();await panel.getByRole('button',{name:'이전 기록 페이지'}).click();await expect(panel).toContainText('회원에게 받은 메시지');
 expect(server.writes).toHaveLength(0);
});
test('errors are retryable and switching members resets history without stale data',async({page})=>{
 const server=await backend(page);server.fail(true);await page.goto('/member-conversation-test');await page.getByRole('tab',{name:'대화 기록'}).click();const panel=page.getByRole('region',{name:'회원 대화 기록'});
 await expect(panel.getByRole('alert')).toContainText('조회 장애');server.fail(false);await panel.getByRole('button',{name:'다시 시도'}).click();await expect(panel).toContainText('회원에게 받은 메시지');
 server.delay(200);await panel.getByRole('button',{name:'이전 대화 더 보기'}).click();await page.getByRole('button',{name:'다른 회원 선택'}).click();await expect(panel).toContainText('확인할 대화 기록이 없습니다.');await expect(panel).not.toContainText('운영자 답변');await expect(panel).toContainText('1페이지');
 server.delay(0);await page.getByRole('button',{name:'다른 회원 선택'}).click();await expect(panel).toContainText('회원에게 받은 메시지');expect(server.writes).toHaveLength(0);
});
test('feature-off keeps existing customer tabs and never requests conversation history',async({page})=>{
 const server=await backend(page);await page.goto('/member-conversation-test?off');await expect(page.getByRole('tab',{name:'프로필'})).toBeVisible();await expect(page.getByRole('tab',{name:'대화 기록'})).toHaveCount(0);expect(server.reads).toHaveLength(0);
});
