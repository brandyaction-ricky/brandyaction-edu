import { test, expect } from '@playwright/test';
const uid='11111111-1111-4111-8111-111111111111',noticeId='22222222-2222-4222-8222-222222222222';
test('automatic notice preserves literal answer text, has a safe destination, and updates the global unread count only after opening',async({page},info)=>{
 let read=false;const requests:Record<string,unknown>[]=[];
 await page.route('**/api/member/messages**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='POST'){const b=route.request().postDataJSON();requests.push(b);read=true;await route.fulfill({json:{id:noticeId,readAt:'2026-09-29T00:00:00Z'}});return;}
  if(url.searchParams.get('action')==='unread'){await route.fulfill({json:{count:read?0:1}});return;}
  await route.fulfill({json:{rows:[{id:noticeId,senderId:null,recipientId:uid,senderName:'브랜디에듀 알림',recipientName:'회원',isNotice:true,targetPath:'/my/questions',content:'[질문함 답변]\n\nQ. 질문 원문\n\nA. <script>개인 답변</script>',readAt:null,createdAt:'2026-09-29T00:00:00Z'}],unreadCount:1,nextCursor:null,canSendToMembers:false}});
 });
 await page.goto('/notification-inbox-test');await expect(page.getByRole('link',{name:'메시지 · 안 읽음 1개',exact:true})).toBeVisible();expect(requests).toHaveLength(0);
 await page.getByRole('button',{name:'내용 보기',exact:true}).click();await expect(page.getByRole('link',{name:'메시지',exact:true})).toBeVisible();await expect(page.locator('.edu-message-body')).toContainText('<script>개인 답변</script>');
 await expect(page.getByRole('link',{name:'해당 내용 확인'})).toHaveAttribute('href','/my/questions');await expect(page.getByRole('button',{name:'답장 작성'})).toHaveCount(0);
 expect(requests).toEqual([{action:'read',messageId:noticeId}]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('notification-inbox.png'),fullPage:true});
});
test('invalid notification destinations cannot render links and count failures do not expose an incorrect zero',async({page})=>{
 let countFailure=false;
 await page.route('**/api/member/messages**',async route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('action')==='unread'){await route.fulfill({status:countFailure?503:200,json:countFailure?{error:'통신 실패'}:{count:123}});return;}
  if(route.request().method()==='POST'){await route.fulfill({json:{id:noticeId,readAt:'2026-09-29T00:00:00Z'}});return;}
  await route.fulfill({json:{rows:[{id:noticeId,senderName:'알림',isNotice:true,targetPath:'https://evil.test',content:'알림 원문',readAt:null,createdAt:'2026-09-29T00:00:00Z'}],unreadCount:123,nextCursor:null,canSendToMembers:false}});
 });
 await page.goto('/notification-inbox-test');await expect(page.locator('.unread-message-count')).toHaveText('99+');await expect(page.getByRole('link',{name:'메시지 · 안 읽음 123개'})).toBeVisible();
 countFailure=true;await page.getByRole('button',{name:'내용 보기',exact:true}).click();await expect(page.getByRole('link',{name:'해당 내용 확인'})).toHaveCount(0);await expect(page.locator('.unread-message-count')).toHaveText('99+');
});
