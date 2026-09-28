import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
const script=fs.readFileSync(new URL('../public/edu-push-sw.js',import.meta.url),'utf8');
function worker(){
 let binding=null,closed=0,unsubscribed=0;const listeners={},notifications=[],navigations=[];
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx={};tx.objectStore=()=>({get(){const r={};queueMicrotask(()=>{r.result=binding;tx.oncomplete();});return r;},put(value){const r={};queueMicrotask(()=>{binding=value;tx.oncomplete();});return r;}});return tx;}};request.onsuccess();});return request;}};
 const client={url:'https://edu.test/my',navigate:async url=>{navigations.push(url);return{focus:async()=>{}};}};
 const self={location:{origin:'https://edu.test'},addEventListener:(name,fn)=>listeners[name]=fn,registration:{getNotifications:async()=>[{close:()=>closed++}],pushManager:{getSubscription:async()=>({unsubscribe:async()=>{unsubscribed++;return true;}})},showNotification:async(title,options)=>notifications.push({title,options})},clients:{get:async source=>source==='same'?client:{url:'https://evil.test'},matchAll:async()=>[client],openWindow:async url=>navigations.push(url)}};
 vm.runInNewContext(script,{self,indexedDB,URL,Set,Promise});
 async function emit(name,event){const tasks=[];listeners[name]({...event,waitUntil:p=>tasks.push(p)});await Promise.all(tasks);}
 const command=async(data,source='same')=>{let ack=null;await emit('message',{source:{id:source},data,ports:[{postMessage:data=>ack=data}]});return ack;};
 const push=data=>emit('push',{data:{json:()=>data}});
 const click=data=>emit('notificationclick',{notification:{data,close:()=>closed++}});
 return{listeners,command,push,click,notifications,navigations,get binding(){return binding;},get closed(){return closed;},get unsubscribed(){return unsubscribed;}};
}
test('worker requires a same-origin page and matching current account before binding a device',async()=>{
 const h=worker(),owner=randomUUID(),binding=randomUUID();assert.equal(await h.command({action:'ACCOUNT',owner},'evil'),null);assert.equal(h.binding,null);
 assert.equal((await h.command({action:'BIND',owner,binding})).ok,false);
 assert.equal((await h.command({action:'ACCOUNT',owner})).ok,true);assert.equal((await h.command({action:'BIND',owner,binding})).ok,true);assert.equal(h.binding.binding,binding);
 assert.equal((await h.command({action:'BIND',owner:randomUUID(),binding})).ok,false);assert.ok(!h.listeners.fetch);
});
test('valid push shows only generic text; wrong-account payload and external destinations cannot notify or navigate',async()=>{
 const h=worker(),owner=randomUUID(),binding=randomUUID(),eventId=randomUUID();await h.command({action:'ACCOUNT',owner});await h.command({action:'BIND',owner,binding});
 await h.push({version:1,binding,eventId,path:'/my/messages',body:'PRIVATE ANSWER',title:'PRIVATE NAME'});assert.equal(h.notifications.length,1);assert.doesNotMatch(JSON.stringify(h.notifications),/PRIVATE/);assert.equal(h.notifications[0].options.renotify,false);
 for(const data of [{version:1,binding:randomUUID(),eventId,path:'/my/messages'},{version:1,binding,eventId,path:'https://evil.test'},{version:1,binding,eventId:'x',path:'/my/messages'}])await h.push(data);
 assert.equal(h.notifications.length,1);await h.click(h.notifications[0].options.data);assert.deepEqual(h.navigations,['https://edu.test/my/messages']);await h.click({binding,path:'//evil.test'});assert.equal(h.navigations.length,1);
});
test('account change clears displayed notifications, unsubscribes the old device and rejects stale notification clicks',async()=>{
 const h=worker(),owner=randomUUID(),binding=randomUUID();await h.command({action:'ACCOUNT',owner});await h.command({action:'BIND',owner,binding});
 await h.command({action:'ACCOUNT',owner:randomUUID()});assert.equal(h.binding.binding,null);assert.equal(h.unsubscribed,1);assert.ok(h.closed>0);await h.click({binding,path:'/my/messages'});assert.equal(h.navigations.length,0);
 await h.command({action:'ACCOUNT',owner:null});assert.equal(h.binding,null);
});
