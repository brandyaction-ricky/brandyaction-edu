import test from 'node:test';
import assert from 'node:assert/strict';
import { configIdentity, discoverTasks, reportsForTask, syncTasks } from '../scripts/campus-aside-auto.mjs';
import { connectionConfig } from '../scripts/campus-aside-connect.mjs';
const config={environment:'development',endpoint:'https://edu.test/api/campus/office/webhook',connectorId:'pilot',keyVersion:'v1',enrollmentId:'00000000-0000-4000-8000-000000000031',account:'u0',connectionId:'telegram-pilot',sessionId:'session-pilot',notBefore:100,secretFile:'/tmp/key'};
const session={id:config.sessionId,trigger:{type:'channel',channel:'telegram',connectionId:config.connectionId},status:'idle'};
function turn(id,time,prompt='캠퍼스 업무: 첫 번째 업무의 실제 결과를 보고해 주세요.') {
 const user={role:'user',timestamp:time,content:prompt};
 return {row:{id:String(id),role:'user',timestamp:time},messages:[
   {role:'system-message',kind:'channel_sender_context',metadata:{platform:'telegram',conversationKind:'direct'},timestamp:time},user,
   {role:'turn-lifecycle',event:'started',turnId:'turn-'+id,timestamp:time+1},
   {role:'assistant',stopReason:'stop',content:`업무 ${id}의 실제 최종 답변입니다.`,timestamp:time+2},
   {role:'turn-lifecycle',event:'finished',turnId:'turn-'+id,timestamp:time+3}]};
}
function snapshot(...turns){return {session,rows:turns.map(t=>t.row),messages:turns.flatMap(t=>t.messages).reverse()};}
function initial(){return {binding:configIdentity(config),tasks:{}};}
test('new marked DM tasks get distinct IDs and correct results; old and ordinary messages are excluded',()=>{
 const one=turn(1,110),two=turn(2,120),ordinary=turn(3,130,'일반 대화는 보고하지 마세요.'),old=turn(4,90);
 const tasks=discoverTasks(snapshot(old,one,two,ordinary),config);
 assert.equal(tasks.length,2);assert.notEqual(tasks[0].jobId,tasks[1].jobId);assert.match(tasks[0].answer,/업무 1/);assert.match(tasks[1].answer,/업무 2/);
 assert.deepEqual(reportsForTask(tasks[0],config).map(r=>JSON.parse(r.raw).event),['registered','accepted','started','draft']);
});
test('overlapping followup, local user input, wrong channel and ambiguous evidence never become a completed task',()=>{
 const one=turn(1,110),two=turn(2,112,'추가 지시를 섞었습니다.');
 assert.equal(discoverTasks(snapshot(one,two),config)[0].phase,'uncertain');
 const local=snapshot(turn(1,110));local.messages=local.messages.filter(m=>m.role!=='system-message');assert.throws(()=>discoverTasks(local,config),/not a verified/);
 assert.throws(()=>discoverTasks({...snapshot(one),session:{...session,trigger:{...session.trigger,connectionId:'other'}}},config),/binding/);
 assert.throws(()=>discoverTasks(snapshot(one,turn(9,110)),config),/Ambiguous/);
 const missing=snapshot(one);missing.messages=missing.messages.filter(m=>m.role!=='assistant');assert.equal(discoverTasks(missing,config)[0].phase,'uncertain');
});
test('lost acknowledgement persists exact report identity; restart and later tasks cannot duplicate execution or results',async()=>{
 const data=snapshot(turn(1,110));let durable=initial(),fail=true;const received=new Map();
 const send=async(c,r)=>{assert.equal(c.jobId,JSON.parse(r.raw).jobId);received.set(r.eventId,r.raw);if(fail){fail=false;throw Error('ack lost');}};
 const persist=async s=>{durable=structuredClone(s);};
 await assert.rejects(syncTasks(config,durable,data,send,persist),/ack lost/);
 assert.equal(received.size,1);assert.equal(Object.values(durable.tasks)[0].events.registered.delivered,false);
 await syncTasks(config,structuredClone(durable),data,send,persist);assert.equal(received.size,4);
 await syncTasks(config,structuredClone(durable),data,send,persist);assert.equal(received.size,4);
 await syncTasks(config,structuredClone(durable),snapshot(turn(1,110),turn(2,120)),send,persist);assert.equal(received.size,8);
 assert.equal(Object.values(durable.tasks).filter(t=>t.done).length,2);
 await assert.rejects(syncTasks({...config,enrollmentId:'different'},durable,data,send,persist),/another connection/);
});
test('missing unprocessed transcript window halts, and provisioning drops old one-job selectors',async()=>{
 const s=snapshot(turn(1,110));s.messages=[];
 await assert.rejects(syncTasks(config,initial(),s,()=>{},()=>{}),/transcript window/);
 const c=connectionConfig({...config,jobId:'old',promptHash:'old'},'/tmp/new-state',999);
 assert.equal(c.notBefore,999);assert.equal(c.jobId,undefined);assert.equal(c.promptHash,undefined);
 assert.throws(()=>connectionConfig({...config,environment:'production'},'/tmp/state'),/Invalid/);
});
