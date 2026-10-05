import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/web-push-client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',binding='33333333-3333-4333-8333-333333333333',publicKey=Buffer.alloc(65,1).toString('base64url');
function harness({storage=false,physical=false,server=false,delayed=false}={}){
 const commands=[],requests=[];let subscription=true,unsubscribeCalls=0,updateCalls=0,release;
 const waiting=new Promise(resolve=>release=resolve);
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',options:{},toJSON:()=>({keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{unsubscribeCalls++;if(physical)throw Error('Browser unavailable');subscription=false;return true;}};
 const item={update:async()=>{updateCalls++;},active:{scriptURL:'https://edu.test/edu-push-sw.js',postMessage:(data,ports)=>{commands.push(data);queueMicrotask(()=>ports[0].postMessage({ok:!storage}));}},pushManager:{getSubscription:async()=>subscription?sub:null,subscribe:async()=>{subscription=true;return sub;}}};
 class Channel{constructor(){this.port1={close(){},onmessage:null};this.port2={postMessage:data=>this.port1.onmessage({data})};}}
 const api={};const fetch=async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);if(server)throw Error('Server unavailable');if(delayed&&body.action==='subscribe')await waiting;return{ok:true,json:async()=>({enabled:body.action!=='unsubscribe',binding})};};
 const window={isSecureContext:true,Notification:{},PushManager:{}},Notification={permission:'granted',requestPermission:async()=>{throw Error('Unexpected prompt');}},navigator={serviceWorker:{getRegistration:async()=>item,register:async()=>item,ready:Promise.resolve(item)}};
 new Function('exports','window','navigator','Notification','MessageChannel','fetch',code)(api,window,navigator,Notification,Channel,fetch);
 return{api,commands,requests,release,get updateCalls(){return updateCalls;},get unsubscribeCalls(){return unsubscribeCalls;}};
}
test('device cleanup still tries browser and server revocation if local device storage fails',async()=>{
 const h=harness({storage:true});await h.api.disableDevicePush();assert.equal(h.unsubscribeCalls,1);assert.equal(h.requests[0].action,'unsubscribe');
 const browser=harness({storage:true,server:true});await browser.api.disableDevicePush();assert.equal(browser.unsubscribeCalls,1);
 const server=harness({storage:true,physical:true});await server.api.disableDevicePush();assert.equal(server.requests[0].action,'unsubscribe');
 const failed=harness({storage:true,server:true,physical:true});await assert.rejects(()=>failed.api.disableDevicePush(),/다시 확인/);
});
test('a subscribe response arriving after account switch cannot bind the old account again',async()=>{
 const h=harness({delayed:true}),pending=h.api.enableDevicePush(owner,publicKey);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(h.requests[0].action,'subscribe');
 await h.api.synchronizePushAccount(other);h.release();await assert.rejects(()=>pending,/계정이 바뀌었습니다/);assert.ok(!h.commands.some(c=>c.action==='BIND'));
});
test('a successful registration binds the chosen account; status can heal a lost local acknowledgement',async()=>{
 const h=harness();await h.api.enableDevicePush(owner,publicKey);assert.deepEqual(h.commands.at(-1),{action:'BIND',owner,binding});assert.equal(await h.api.pushDeviceStatus(owner),true);assert.equal(h.updateCalls,1);
 await h.api.disableDevicePush();assert.equal(h.commands.at(-1).action,'CLEAR');
});
