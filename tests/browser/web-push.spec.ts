import { test, expect, type Page } from '@playwright/test';
const owner='11111111-1111-4111-8111-111111111111',binding='22222222-2222-4222-8222-222222222222';
async function fixture(page:Page,options:{denied?:boolean;failOnce?:boolean;paused?:boolean;unsupported?:boolean}={}){
 const writes:Record<string,unknown>[]=[];let failed=false;
 await page.addInitScript(({denied,unsupported})=>{
  const state={permission:denied?'denied':'default',asks:0,subscribed:false,commands:[] as object[]};
  Object.assign(window,{pushFixture:state});
  if(unsupported){Object.defineProperty(window,'PushManager',{value:undefined,configurable:true});Reflect.deleteProperty(window,'PushManager');return;}
  Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return state.permission;},requestPermission:async()=>{state.asks++;state.permission=denied?'denied':'granted';return state.permission;}}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',options:{},toJSON:()=>({keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{state.subscribed=false;return true;}};
  const registration={active:{scriptURL:location.origin+'/edu-push-sw.js',postMessage:(data:object,ports:MessagePort[])=>{state.commands.push(data);ports[0].postMessage({ok:true});}},pushManager:{getSubscription:async()=>state.subscribed?sub:null,subscribe:async()=>{state.subscribed=true;return sub;}}};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>registration,register:async()=>registration,ready:Promise.resolve(registration)}});
 },options);
 await page.route('**/api/member/push',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:{enabled:!options.paused,publicKey:btoa('a'.repeat(65)).replaceAll('=','')}});return;}
  const body=route.request().postDataJSON();writes.push(body);
  if(options.failOnce&&!failed&&body.action==='subscribe'){failed=true;await route.fulfill({status:503,json:{error:'알림 서버 연결을 다시 확인해 주세요.'}});return;}
  await route.fulfill({json:{enabled:body.action!=='unsubscribe',binding}});
 });return{writes};
}
test('permission is requested only by a click, then the device can be enabled and revoked',async({page},info)=>{
 const h=await fixture(page);await page.goto('/push-settings-test');await expect(page.getByRole('status')).toHaveText('이 기기 알림 꺼짐');
 expect(await page.evaluate(()=>Reflect.get(window,'pushFixture').asks)).toBe(0);expect(h.writes).toHaveLength(0);
 await page.getByRole('button',{name:'이 기기 알림 켜기'}).click();await expect(page.getByRole('status')).toHaveText('이 기기 알림 켜짐');expect(h.writes.map(x=>x.action)).toEqual(['subscribe']);
 expect(await page.evaluate(()=>Reflect.get(window,'pushFixture').commands)).toContainEqual({action:'BIND',owner,binding});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('push-settings.png'),fullPage:true});
 await page.getByRole('button',{name:'이 기기 알림 끄기'}).click();await expect(page.getByRole('status')).toHaveText('이 기기 알림 꺼짐');expect(h.writes.at(-1)?.action).toBe('unsubscribe');expect(await page.evaluate(()=>Reflect.get(window,'pushFixture').subscribed)).toBe(false);
});
test('registration failure remains off and can be retried without requesting permission twice',async({page})=>{
 const h=await fixture(page,{failOnce:true});await page.goto('/push-settings-test');await page.getByRole('button',{name:'이 기기 알림 켜기'}).click();await expect(page.getByRole('alert')).toContainText('다시 확인');await expect(page.getByRole('status')).toHaveText('이 기기 알림 꺼짐');
 await page.getByRole('button',{name:'이 기기 알림 켜기'}).click();await expect(page.getByRole('status')).toHaveText('이 기기 알림 켜짐');expect(h.writes.filter(x=>x.action==='subscribe')).toHaveLength(2);expect(await page.evaluate(()=>Reflect.get(window,'pushFixture').asks)).toBe(1);
});
test('permission refusal does not subscribe and explains where to change the setting',async({page})=>{
 const h=await fixture(page,{denied:true});await page.goto('/push-settings-test');await page.getByRole('button',{name:'이 기기 알림 켜기'}).click();await expect(page.getByRole('alert')).toContainText('브라우저 설정');expect(h.writes).toHaveLength(0);
});
test('paused service has no enable action and unsupported browsers retain site access guidance',async({page})=>{
 await fixture(page,{paused:true});await page.goto('/push-settings-test');await expect(page.getByRole('status')).toHaveText('앱 알림을 준비 중입니다.');await expect(page.getByRole('button',{name:'이 기기 알림 켜기'})).toBeDisabled();
 await page.addInitScript(()=>{Reflect.deleteProperty(window,'PushManager');});await page.reload();await expect(page.getByText(/이 브라우저에서는 앱 알림을 지원하지 않습니다/)).toBeVisible();
});
test('real service worker persists binding in IndexedDB and clears it on a changed account without caching pages',async({page})=>{
 await page.goto('/messages-test');const data=await page.evaluate(async({owner,binding})=>{
  await navigator.serviceWorker.register('/edu-push-sw.js',{scope:'/'});const reg=await navigator.serviceWorker.ready;
  const command=(data:object)=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>{channel.port1.close();resolve(e.data);};reg.active!.postMessage(data,[channel.port2]);});
  const account=await command({action:'ACCOUNT',owner}),bind=await command({action:'BIND',owner,binding});
  const read=()=>new Promise<unknown>(resolve=>{const req=indexedDB.open('edu-push-device',1);req.onsuccess=()=>{const db=req.result,r=db.transaction('settings').objectStore('settings').get('binding');r.onsuccess=()=>{db.close();resolve(r.result);};};});
  const before=await read();await command({action:'ACCOUNT',owner:null});return{account,bind,before,after:await read(),caches:await caches.keys()};
 },{owner,binding});expect(data).toEqual({account:{ok:true},bind:{ok:true},before:{owner,binding},after:null,caches:[]});
});

test('a configuration outage still lets the member turn off this device locally',async({page})=>{
 await fixture(page);await page.route('**/api/member/push',route=>route.fulfill({status:503,json:{error:'알림 설정 연결 실패'}}));await page.goto('/push-settings-test');
 await expect(page.getByRole('alert')).toHaveText('알림 설정 연결 실패');await page.getByRole('button',{name:'이 기기 알림 끄기'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
 expect(await page.evaluate(()=>Reflect.get(window,'pushFixture').commands)).toContainEqual({action:'CLEAR'});
});
