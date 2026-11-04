import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const compiled = await build({entryPoints:[fileURLToPath(new URL('../features/campus/focus-client.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {createFocusTransport}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const realFetch=globalThis.fetch;
const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
afterEach(()=>{
 globalThis.fetch=realFetch;
 if(storageDescriptor)Object.defineProperty(globalThis,'localStorage',storageDescriptor);
 else delete globalThis.localStorage;
});
const snapshot=(patch={})=>({schemaVersion:1,fetchedAt:'2026-11-02T10:00:00Z',viewer:{id:uid(1),displayName:'QA'},scopes:[],selectedEnrollmentId:uid(2),lessons:[{id:uid(3),title:'1일차',day:1,version:'v1',completed:false,href:'/lessons/1',missions:[]}],links:{classes:'/my/classes',questions:'/my/questions'},launchEligibility:null,...patch});
const start=(patch={})=>({kind:'start',requestId:uid(4),enrollmentId:uid(2),lessonId:uid(3),lessonVersion:'v1',actionText:'고객 문제 한 줄 적기',...patch});
const record=(patch={})=>({id:uid(4),user_id:uid(1),enrollment_id:uid(2),lesson_id:uid(3),lesson_version:'v1',action_text:'고객 문제 한 줄 적기',result_note:'',next_step:'',status:'running',elapsed_seconds:0,running_since:'2026-11-02T10:00:00.000Z',revision:1,created_at:'2026-11-02T10:00:00.000Z',updated_at:'2026-11-02T10:00:00.000Z',...patch});
const response=(session=record())=>({session,serverNow:'2026-11-02T10:00:00.000Z',currentLessonVersion:'v1'});
function storage(){
 const data=new Map();
 const impl={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),clear:()=>data.clear()};
 Object.defineProperty(globalThis,'localStorage',{value:impl,configurable:true});
 return {data,impl};
}
const storageKey=(user=uid(1),enrollment=uid(2))=>`moonshot-focus-demo-v1:${user}:${enrollment}`;
const finish=(session,patch={})=>({kind:'finish',sessionId:session.id,expectedRevision:session.revision,resultNote:'고객 문제를 구체화함',nextStep:'인터뷰 질문 정리',...patch});

test('server transport uses an uncached same-origin request and forwards abort signals',async()=>{
 const {data}=storage();const calls=[];const signal=new AbortController().signal;
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>response()};};
 const client=createFocusTransport(snapshot(),false);
 await client.read(signal);await client.write(start(),signal);
 assert.equal(calls[0].url,`/api/campus/focus?enrollmentId=${uid(2)}`);
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[1].url,'/api/campus/focus');
 assert.equal(calls[1].options.method,'POST');assert.deepEqual(JSON.parse(calls[1].options.body),start());
 assert.equal(calls[1].options.headers['Content-Type'],'application/json');
 for(const {options} of calls){assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.signal,signal);}
 assert.equal(data.size,0,'real member notes must never enter browser storage');
});

test('server responses reject another member or enrollment before exposing notes',async()=>{
 for(const patch of [{user_id:uid(9)},{enrollment_id:uid(9)}]){
  globalThis.fetch=async()=>({ok:true,json:async()=>response(record({...patch,result_note:'private'}))});
  await assert.rejects(createFocusTransport(snapshot(),false).read(),{status:403});
 }
});

test('server responses reject malformed sessions and clocks and strip unknown session fields',async()=>{
 for(const payload of [null,{...response(),serverNow:'broken'},response(record({revision:0})),response(record({elapsed_seconds:901}))]){
  globalThis.fetch=async()=>({ok:true,json:async()=>payload});
  await assert.rejects(createFocusTransport(snapshot(),false).read());
 }
 globalThis.fetch=async()=>({ok:true,json:async()=>response(record({private_extra:'discard'}))});
 const result=await createFocusTransport(snapshot(),false).read();assert.equal(result.session.private_extra,undefined);
});

test('revocation, conflicts and server failures preserve error status without trusting response text',async()=>{
 const {data}=storage();
 for(const status of [401,403,404,409,500,503]){
  globalThis.fetch=async()=>({ok:false,status,json:async()=>{throw new Error('error bodies must not be used');}});
  const client=createFocusTransport(snapshot(),false);
  await assert.rejects(client.read(),error=>error.status===status&&!error.message.includes('error bodies'));
  await assert.rejects(client.write(start()),error=>error.status===status);
 }
 assert.equal(data.size,0);
});

test('network and aborted server requests are not reported as saved',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('network unavailable');};
 await assert.rejects(createFocusTransport(snapshot(),false).write(start()),TypeError);
 const aborted=new AbortController();aborted.abort();
 globalThis.fetch=async(_url,options)=>{options.signal.throwIfAborted();throw new Error('not reached');};
 await assert.rejects(createFocusTransport(snapshot(),false).write(start(),aborted.signal),{name:'AbortError'});
});

test('demo state persists across transport recreation and start retry is idempotent',async()=>{
 const {data}=storage();const client=createFocusTransport(snapshot(),true);
 assert.equal((await client.read()).session,null);
 const initial=await client.write(start());const raw=data.get(storageKey());
 const retried=await createFocusTransport(snapshot(),true).write(start({actionText:'  고객 문제 한 줄 적기  '}));
 assert.deepEqual(retried.session,initial.session);assert.equal(data.get(storageKey()),raw);
 assert.deepEqual((await createFocusTransport(snapshot(),true).read()).session,initial.session);
});

test('demo rejects reused start IDs with changed action or scope and preserves the existing session',async()=>{
 const {data}=storage();const client=createFocusTransport(snapshot(),true);await client.write(start());const raw=data.get(storageKey());
 for(const patch of [{actionText:'다른 작업'},{enrollmentId:uid(9)},{lessonId:uid(9)},{lessonVersion:'v2'}]){
  await assert.rejects(client.write(start(patch)),error=>error.status===409||error.status===403);
  assert.equal(data.get(storageKey()),raw);
 }
});

test('demo uses separate keys for each member and enrollment',async()=>{
 const {data}=storage();await createFocusTransport(snapshot(),true).write(start());
 const otherMember=createFocusTransport(snapshot({viewer:{id:uid(9),displayName:'Other'}}),true);
 const otherEnrollment=createFocusTransport(snapshot({selectedEnrollmentId:uid(8)}),true);
 assert.equal((await otherMember.read()).session,null);assert.equal((await otherEnrollment.read()).session,null);
 await otherMember.write(start({requestId:uid(6)}));
 await otherEnrollment.write(start({requestId:uid(7),enrollmentId:uid(8)}));
 assert.equal(data.size,3);assert.equal((await otherMember.read()).session.user_id,uid(9));
 assert.equal((await otherEnrollment.read()).session.enrollment_id,uid(8));
});

test('corrupt or foreign demo records fail closed without overwriting stored evidence',async()=>{
 const {data}=storage();const client=createFocusTransport(snapshot(),true);
 for(const raw of ['not json',JSON.stringify(response(record({user_id:uid(9)}))),JSON.stringify(response(record({elapsed_seconds:901})))]){
  data.set(storageKey(),raw);await assert.rejects(client.read());await assert.rejects(client.write(start()));
  assert.equal(data.get(storageKey()),raw);
 }
});

test('demo pause/resume uses revisions and old commands cannot overwrite new notes',async()=>{
 storage();const client=createFocusTransport(snapshot(),true);let result=await client.write(start());
 result=await client.write({kind:'pause',sessionId:result.session.id,expectedRevision:1});assert.equal(result.session.status,'paused');
 await assert.rejects(client.write({kind:'resume',sessionId:result.session.id,expectedRevision:1}),{status:409});
 result=await client.write({kind:'resume',sessionId:result.session.id,expectedRevision:2});assert.equal(result.session.status,'running');
 result=await client.write(finish(result.session));assert.equal(result.session.status,'finished');assert.equal(result.session.revision,4);
 await assert.rejects(client.write(finish({...result.session,revision:3},{resultNote:'덮어쓰기'})),{status:409});
 assert.equal((await client.read()).session.result_note,'고객 문제를 구체화함');
});

test('invalid or oversized end notes leave demo state unchanged and exact limits succeed',async()=>{
 const {data}=storage();const client=createFocusTransport(snapshot(),true);const initial=await client.write(start());const raw=data.get(storageKey());
 for(const patch of [{resultNote:''},{nextStep:' '},{resultNote:'x'.repeat(1001)},{nextStep:'x'.repeat(501)}]){
  await assert.rejects(client.write(finish(initial.session,patch)),{status:400});assert.equal(data.get(storageKey()),raw);
 }
 const done=await client.write(finish(initial.session,{resultNote:'x'.repeat(1000),nextStep:'y'.repeat(500)}));
 assert.equal(done.session.result_note.length,1000);assert.equal(done.session.next_step.length,500);
 assert.equal(done.session.completed,undefined);assert.equal(done.session.xp,undefined);
});

test('existing demo work remains finishable if its lesson changes or becomes hidden',async()=>{
 storage();const original=createFocusTransport(snapshot(),true);let current=await original.write(start());
 const edited=createFocusTransport(snapshot({lessons:[{...snapshot().lessons[0],version:'v2'}]}),true);
 assert.equal((await edited.read()).currentLessonVersion,'v2');
 current=await edited.write({kind:'pause',sessionId:current.session.id,expectedRevision:1});
 const hidden=createFocusTransport(snapshot({lessons:[]}),true);assert.equal((await hidden.read()).currentLessonVersion,null);
 current=await hidden.write({kind:'resume',sessionId:current.session.id,expectedRevision:2});
 current=await hidden.write(finish(current.session));assert.equal(current.session.lesson_version,'v1');
 await assert.rejects(hidden.write(start({requestId:uid(8)})),{status:409});
});

test('aborted demo requests cannot create or change browser state',async()=>{
 const {data}=storage();const client=createFocusTransport(snapshot(),true);const aborted=new AbortController();aborted.abort();
 await assert.rejects(client.read(aborted.signal),{name:'AbortError'});
 await assert.rejects(client.write(start(),aborted.signal),{name:'AbortError'});assert.equal(data.size,0);
 const initial=await client.write(start());const raw=data.get(storageKey());
 await assert.rejects(client.write(finish(initial.session),aborted.signal),{name:'AbortError'});assert.equal(data.get(storageKey()),raw);
});

test('storage quota failure rejects the save and retains the prior session',async()=>{
 const {data,impl}=storage();const client=createFocusTransport(snapshot(),true);const initial=await client.write(start());const raw=data.get(storageKey());
 impl.setItem=()=>{throw new DOMException('No room','QuotaExceededError');};
 await assert.rejects(client.write(finish(initial.session)),{name:'QuotaExceededError'});
 assert.equal(data.get(storageKey()),raw);assert.equal((await client.read()).session.status,'running');
});
