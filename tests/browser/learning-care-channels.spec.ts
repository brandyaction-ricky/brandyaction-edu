import {expect,test,type Page} from '@playwright/test';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const cohort=id(1),lesson=id(2),asOf='2026-10-08T08:00:00Z';
const rows=Array.from({length:4},(_,n)=>({memberId:id(n+10),enrollmentId:id(n+20),name:['푸시 수강생','이메일·알림톡 수강생','이메일 수강생','연락처 없는 수강생'][n],email:n===3?null:`qa${n}@example.test`,lastVisitAt:null,lastContactAt:null,openQuestions:0,cells:[{lessonId:lesson,title:'첫 학습 시작하기',week:0,day:1,track:'learning',state:'not_submitted',published:true}]}));
const snapshot={cohorts:[{id:cohort,name:'4기',courseTitle:'검수 클래스'}],cohortId:cohort,rows,asOf};
const reach=rows.map((r,n)=>({memberId:r.memberId,push:n===0,email:n!==3,alimtalk:n<2,sms:n<2,emailMasked:n===3?null:`q***@example.test`,phoneMasked:n<2?'010****5678':null}));
async function backend(page:Page,{enabled=true,alimtalk=true,fail=false,uncertain=false,changed=false}={}){
 const sent:Record<string,unknown>[]=[],reads:string[]=[];let receipt:unknown=null;let reachReads=0;
 await page.route('**/api/admin/learning-care**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/channels')){
   reads.push(url.search);
   if(url.searchParams.has('request'))return route.fulfill(receipt?{json:receipt}:{status:404,json:{error:'없음'}});
   reachReads++;
   if(changed&&reachReads>1)await new Promise(resolve=>setTimeout(resolve,250));
   return route.fulfill(fail?{status:503,json:{error:'연락 수단을 확인하지 못했습니다.'}}:{json:{config:{enabled,push:enabled,email:enabled,alimtalk:enabled&&alimtalk,sms:enabled},reach:!enabled?[]:changed&&reachReads>1?reach.map(r=>({...r,push:false})):reach}});
  }
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();sent.push(body);
   if(!body.delivery)return route.fulfill({json:{count:4}});
   if(changed&&sent.length===1)return route.fulfill({status:409,json:{error:'알림 수신 설정이 바뀌어 발송하지 않았습니다. 채널을 새로 확인해 주세요.'}});
   receipt={requestId:body.requestId,count:4,deliveries:body.delivery.routes.flatMap((r:{memberId:string;channels:string[]})=>r.channels.map(channel=>({memberId:r.memberId,channel,status:'pending'})))};
   return route.fulfill(uncertain?{status:503,json:{error:'발송 결과를 확인하지 못했습니다.'}}:{json:receipt});
  }
  return route.fulfill({json:snapshot});
 });
 return {sent,reads};
}
async function compose(page:Page){await page.goto('/learning-care-test');await page.getByRole('tab',{name:'일차별',exact:true}).click();await page.getByRole('button',{name:'안내할 수강생 선택 · 최대 100명'}).click();await page.getByRole('button',{name:'선택한 4명 안내 내용 작성'}).click();}
test('disabled external delivery shows all four channels and explicitly saves only to inbox',async({page},testInfo)=>{
 const api=await backend(page,{enabled:false});await compose(page);
 const status=page.getByRole('region',{name:'학습 안내 발송 상태'});
 await expect(status).toContainText('지금은 사이트 메시지함에만 저장돼요');
 for(const label of ['앱 푸시','이메일','알림톡','문자'])await expect(status.getByText(label,{exact:true})).toBeVisible();
 await expect(status.getByText('발송 꺼짐',{exact:true})).toHaveCount(4);
 await expect(page.getByRole('combobox',{name:'발송 방식'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'확인한 대상에게 보내기'})).toHaveCount(0);
 const save=page.getByRole('button',{name:'메시지함에만 저장',exact:true});await expect(save).toBeEnabled();
 await save.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('care-inbox-only.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(api.sent).toHaveLength(0);await save.click();
 await expect(page.getByRole('status',{name:'안내 발송 결과'})).toContainText('4명의 사이트 메시지함');
 expect(api.sent).toHaveLength(1);expect(api.sent[0]).not.toHaveProperty('delivery');
});
test('push-first previews disjoint recipients and a visible inbox-only warning before any send',async({page},testInfo)=>{
 const api=await backend(page);await compose(page);
 await expect(page.getByRole('combobox',{name:'발송 방식'})).toHaveValue('push_first');
 await expect(page.getByText('1명은 외부 알림을 받을 수 없어 메시지함에만 저장됩니다.')).toBeVisible();
 await expect(page.getByLabel('앱 푸시')).toBeChecked();await expect(page.getByLabel('이메일', {exact:false}).first()).toBeChecked();
 await page.screenshot({path:testInfo.outputPath('care-channels.png'),fullPage:true});
 expect(api.sent).toHaveLength(0);await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();
 await expect(page.getByRole('region',{name:'채널별 발송 결과'})).toContainText('발송 대기');
 expect(api.sent).toHaveLength(1);expect(api.sent[0].delivery).toEqual({mode:'push_first',channels:['push','email','alimtalk','sms'],routes:[{memberId:id(10),channels:['push']},{memberId:id(11),channels:['alimtalk','email']},{memberId:id(12),channels:['email']},{memberId:id(13),channels:[]}]});
 await page.getByRole('button',{name:'발송 결과 새로고침'}).click();await expect.poll(()=>api.reads.some(q=>q.includes('request='))).toBe(true);expect(api.sent).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('unconfigured alimtalk is not selectable and cancel never sends',async({page})=>{
 const api=await backend(page,{alimtalk:false});await compose(page);await expect(page.getByRole('checkbox',{name:/알림톡.*설정 필요/})).toBeDisabled();await expect(page.getByRole('combobox',{name:'발송 방식'})).toBeVisible();await page.getByRole('button',{name:'취소',exact:true}).click();expect(api.sent).toHaveLength(0);
});
test('failed readiness blocks sends; uncertain POST reads the existing receipt instead of sending again',async({page})=>{
 const failed=await backend(page,{fail:true});await compose(page);await expect(page.getByRole('alert')).toContainText('연락 수단');await expect(page.getByRole('button',{name:'확인한 대상에게 보내기'})).toBeDisabled();expect(failed.sent).toHaveLength(0);
 await page.unrouteAll();const api=await backend(page,{uncertain:true});await compose(page);await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();await expect(page.getByLabel('안내 내용',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'발송 결과 다시 확인'}).click();await expect(page.getByRole('region',{name:'채널별 발송 결과'})).toBeVisible();expect(api.sent).toHaveLength(1);
});
test('choosing all channels changes the explicit preview and does not imply installation from email',async({page})=>{
 const api=await backend(page);await compose(page);await page.getByRole('combobox',{name:'발송 방식'}).selectOption('all');await page.getByText('수강생별 발송 채널 확인',{exact:true}).click();await expect(page.locator('.care-channel-members').first()).toContainText('메시지함만');
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();expect(api.sent[0].delivery).toMatchObject({mode:'all',routes:[{memberId:id(10),channels:['alimtalk','email','push','sms']},{memberId:id(11),channels:['alimtalk','email','sms']},{memberId:id(12),channels:['email']},{memberId:id(13),channels:[]}]});
});
test('missing Alimtalk template routes phone recipients to the explicitly selected SMS channel',async({page})=>{
 const api=await backend(page,{alimtalk:false});await compose(page);
 await expect(page.getByRole('checkbox',{name:/문자/})).toBeChecked();await expect(page.getByRole('checkbox',{name:/문자/})).toHaveAccessibleName(/1명/);
 await page.getByText('수강생별 발송 채널 확인',{exact:true}).click();await expect(page.locator('.care-sms-preview')).toContainText('https://brandyaction-edu.com/my/messages');
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();expect(api.sent[0].delivery).toEqual({mode:'push_first',channels:['push','email','sms'],routes:[{memberId:id(10),channels:['push']},{memberId:id(11),channels:['email','sms']},{memberId:id(12),channels:['email']},{memberId:id(13),channels:[]}]});
});

test('changed contact routes can be refreshed without losing the draft or selected channels',async({page})=>{
 const api=await backend(page,{changed:true});await compose(page);
 await page.getByLabel('안내 내용',{exact:true}).fill('작성한 안내를 그대로 보관합니다.');
 await page.getByRole('checkbox',{name:/문자/}).uncheck();
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();
 await expect(page.getByRole('alert')).toContainText('수신 설정이 바뀌어');
 await page.getByRole('button',{name:'연락 수단 다시 확인',exact:true}).click();
 await expect(page.getByRole('button',{name:'확인한 대상에게 보내기'})).toBeDisabled();
 await expect(page.getByRole('checkbox',{name:/앱 푸시/})).toHaveAccessibleName(/0명/);
 await expect(page.getByLabel('안내 내용',{exact:true})).toHaveValue('작성한 안내를 그대로 보관합니다.');
 await expect(page.getByRole('checkbox',{name:/문자/})).not.toBeChecked();
 expect(api.sent).toHaveLength(1);
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();
 await expect(page.getByRole('region',{name:'채널별 발송 결과'})).toBeVisible();
 expect(api.sent).toHaveLength(2);
 expect(api.sent[1].delivery).toMatchObject({channels:['push','email','alimtalk'],routes:[{memberId:id(10),channels:['alimtalk','email']},{memberId:id(11),channels:['alimtalk','email']},{memberId:id(12),channels:['email']},{memberId:id(13),channels:[]}]});
});

for (const channel of ['sms','alimtalk'] as const) test(`template management round trip preserves the composer (${channel})`, async({page},testInfo)=>{
 const api=await backend(page,{alimtalk:false});await compose(page);
 await page.getByLabel('안내 내용',{exact:true}).fill('수강생에게 이어서 보낼 안내 초안');
 await page.getByRole('combobox',{name:'발송 방식'}).selectOption('all');
 await page.getByRole('checkbox',{name:/문자/}).uncheck();
 const name=channel==='sms'?'문자 템플릿 관리':'알림톡 템플릿 관리';
 const link=page.getByRole('link',{name,exact:true});
 await expect(link).toHaveAttribute('rel','noopener noreferrer');
 const popupPromise=page.waitForEvent('popup');await link.click();const manager=await popupPromise;
 await expect(manager).toHaveURL(new RegExp(`/admin/templates\\?from=learning-care&channel=${channel}$`));
 await expect(manager.getByRole('region',{name:'학습 안내에서 연 템플릿 관리'})).toBeVisible();
 await expect(manager.getByRole('combobox',{name:/^발송 채널/})).toHaveValue(channel);
 await expect(manager.getByLabel('템플릿 목록 채널')).toHaveValue(channel);
 await expect(manager.getByLabel('발송용 템플릿으로 사용')).toHaveCount(channel==='sms'?1:0);
 await manager.getByText(`현재 학습 안내에 사용하는 ${channel==='sms'?'문자':'알림톡'} 문구`,{exact:true}).click();
 await expect(manager.getByText(/저장.*(바뀌지는|켜지지는)/)).toBeVisible();
 await manager.screenshot({path:testInfo.outputPath(`template-manager-${channel}.png`),fullPage:true});
 expect(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await manager.getByRole('button',{name:'관리 창 닫고 돌아가기',exact:true}).click();
 await expect.poll(()=>manager.isClosed()).toBe(true);
 await expect(page.getByRole('dialog',{name:'학습 안내 확인'})).toContainText('4명에게 학습 안내');
 await expect(page.getByLabel('안내 내용',{exact:true})).toHaveValue('수강생에게 이어서 보낼 안내 초안');
 await expect(page.getByRole('combobox',{name:'발송 방식'})).toHaveValue('all');
 await expect(page.getByRole('checkbox',{name:/문자/})).not.toBeChecked();
 await expect(page.getByRole('button',{name:'확인한 대상에게 보내기'})).toBeDisabled();
 await page.getByRole('button',{name:'설정 확인하고 이어서 작성'}).click();
 await expect(page.getByRole('button',{name:'확인한 대상에게 보내기'})).toBeEnabled();
 await expect(page.getByLabel('안내 내용',{exact:true})).toHaveValue('수강생에게 이어서 보낼 안내 초안');
 await expect(page.getByRole('checkbox',{name:/문자/})).not.toBeChecked();
 expect(api.sent).toHaveLength(0);
 await page.screenshot({path:testInfo.outputPath(`composer-return-${channel}.png`),fullPage:true});
});

test('template links work when delivery is off; dirty template must be saved before returning', async({page})=>{
 const api=await backend(page,{enabled:false});await compose(page);
 const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'문자 템플릿 관리',exact:true}).click();const manager=await popupPromise;
 await manager.getByLabel('템플릿 이름',{exact:true}).fill('시험 안내 문구');
 await expect(manager.getByRole('button',{name:'관리 창 닫고 돌아가기'})).toBeDisabled();
 await expect(manager.getByText('수정한 템플릿을 먼저 저장해 주세요.',{exact:false})).toBeVisible();
 await manager.close();
 await expect(page.getByRole('button',{name:'메시지함에만 저장',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'설정 확인하고 이어서 작성'}).click();
 await expect(page.getByRole('button',{name:'메시지함에만 저장',exact:true})).toBeEnabled();
 expect(api.sent).toHaveLength(0);
});
