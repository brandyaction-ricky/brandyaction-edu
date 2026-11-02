import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const compiled = await build({entryPoints:[fileURLToPath(new URL('../features/campus/focus-domain.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {FOCUS_SECONDS,createFocusSession,transitionFocusSession,remainingSeconds,resumeDisposition,validateFocusSession}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now = Date.parse('2026-11-02T10:00:00Z');
const input = () => ({id:uid(1),user_id:uid(2),enrollment_id:uid(3),lesson_id:uid(4),lesson_version:'v1',action_text:'  고객 문제 한 줄 적기  '});
const session = () => createFocusSession(input(),now);
const change = (s,kind,time,extra={}) => transitionFocusSession(s,{kind,expectedRevision:s.revision,...extra},time);

test('new session starts one bounded user-chosen action with no earned achievements',()=>{
 const result=createFocusSession({...input(),xp:999,extra:'PRIVATE'},now);
 assert.equal(FOCUS_SECONDS,900);assert.equal(result.action_text,'고객 문제 한 줄 적기');
 assert.equal(result.status,'running');assert.equal(result.revision,1);assert.equal(result.elapsed_seconds,0);
 assert.equal(result.running_since,new Date(now).toISOString());assert.equal(result.result_note,'');assert.equal(result.next_step,'');
 assert.equal(result.xp,undefined);assert.equal(result.extra,undefined);assert.equal(result.completed,undefined);
});

test('timer uses server timestamps and only accumulates active intervals',()=>{
 const initial=session();assert.equal(remainingSeconds(initial,now+10000),890);
 const paused=change(initial,'pause',now+65000);assert.equal(paused.elapsed_seconds,65);assert.equal(paused.running_since,null);
 assert.equal(remainingSeconds(paused,now+900000),835);
 const resumed=change(paused,'resume',now+900000);assert.equal(resumed.running_since,new Date(now+900000).toISOString());
 assert.equal(remainingSeconds(resumed,now+915000),820);
 const done=change(resumed,'finish',now+920000,{resultNote:'고객 문제를 좁힘',nextStep:'근거 인터뷰 정리'});
 assert.equal(done.elapsed_seconds,85);assert.equal(done.status,'finished');assert.equal(done.running_since,null);
 assert.equal(remainingSeconds(done,now+9000000),815);
});

test('late return clamps at 15 minutes without auto-finishing or awarding completion',()=>{
 const initial=session();assert.equal(remainingSeconds(initial,now+10*86400000),0);assert.equal(initial.status,'running');
 const paused=change(initial,'pause',now+10*86400000);assert.equal(paused.elapsed_seconds,900);
 assert.throws(()=>change(paused,'resume',now+10*86400000+1000),{status:409});
 const done=change(paused,'finish',now+10*86400000+2000,{resultNote:'초안 작성',nextStep:'문장 다듬기'});
 assert.equal(done.elapsed_seconds,900);assert.equal(done.status,'finished');assert.equal(done.lessonCompleted,undefined);
});

test('fractional seconds do not exceed active elapsed wall time',()=>{
 const paused=change(session(),'pause',now+1599);assert.equal(paused.elapsed_seconds,1);
 const running=change(paused,'resume',now+5000);assert.equal(remainingSeconds(running,now+6999),898);
});

test('concurrent or out-of-order edits fail with conflict',()=>{
 const initial=session(),paused=change(initial,'pause',now+1000);
 assert.throws(()=>transitionFocusSession(paused,{kind:'resume',expectedRevision:1},now+2000),{status:409});
 assert.throws(()=>change(paused,'resume',now+500),{status:409});
 assert.throws(()=>change(paused,'pause',now+2000),{status:409});
 assert.throws(()=>change(initial,'resume',now+2000),{status:409});
});

test('finished result is immutable even with the current revision',()=>{
 const done=change(session(),'finish',now+5000,{resultNote:'완성한 초안',nextStep:'동료 피드백 요청'});
 for(const kind of ['pause','resume','finish'])assert.throws(()=>change(done,kind,now+10000,{resultNote:'덮어쓰기',nextStep:'변경'}),{status:409});
});

test('finish requires both outcome and next action, trims valid text, and accepts exact limits',()=>{
 for(const patch of [{resultNote:'',nextStep:'next'},{resultNote:'  ',nextStep:'next'},{resultNote:'done',nextStep:''},{resultNote:'done'},{nextStep:'next'},{resultNote:'a'.repeat(1001),nextStep:'next'},{resultNote:'done',nextStep:'a'.repeat(501)}]){
  assert.throws(()=>change(session(),'finish',now+1000,patch),{status:400});
 }
 const valid=change(session(),'finish',now+1000,{resultNote:' a ',nextStep:' b '});assert.equal(valid.result_note,'a');assert.equal(valid.next_step,'b');
 const max=change(session(),'finish',now+1000,{resultNote:'a'.repeat(1000),nextStep:'b'.repeat(500)});assert.equal(max.result_note.length,1000);
});

test('invalid clocks, IDs and oversized input cannot enter the model',()=>{
 for(const time of [NaN,Infinity,-Infinity,9e15])assert.throws(()=>createFocusSession(input(),time),{status:400});
 for(const field of ['id','user_id','lesson_id','enrollment_id'])assert.throws(()=>createFocusSession({...input(),[field]:'../../bad'},now),{status:400});
 for(const action_text of ['', '  ', 'a'.repeat(301),null])assert.throws(()=>createFocusSession({...input(),action_text},now),{status:400});
 assert.throws(()=>createFocusSession({...input(),lesson_version:''},now),{status:400});
 assert.equal(createFocusSession({...input(),action_text:'a'.repeat(300)},now).action_text.length,300);
 assert.throws(()=>remainingSeconds(session(),NaN),{status:400});
});

test('invalid commands and malformed stored state fail closed',()=>{
 const initial=session();
 for(const command of [null,{}, {kind:'award',expectedRevision:1},{kind:'pause',expectedRevision:0},{kind:'pause',expectedRevision:1.5}])assert.throws(()=>transitionFocusSession(initial,command,now+1000),{status:400});
 for(const patch of [{status:'weird'},{revision:0},{elapsed_seconds:-1},{elapsed_seconds:901},{elapsed_seconds:0.5},{running_since:null},{running_since:'not-a-date'},{updated_at:'not-a-date'},{updated_at:new Date(now-1).toISOString()},{result_note:null}])assert.throws(()=>remainingSeconds({...initial,...patch},now),{status:400});
 const paused=change(initial,'pause',now+1000);assert.throws(()=>remainingSeconds({...paused,running_since:initial.running_since},now),{status:400});
});

test('client clock behind server cannot create negative elapsed seconds',()=>{
 const initial=session();assert.equal(remainingSeconds(initial,now-10000),900);
});

test('resume warns on curriculum edits and completed sessions remain completed',()=>{
 const initial=session();assert.equal(resumeDisposition(initial,'v1'),'ready');assert.equal(resumeDisposition(initial,'v2'),'version_changed');
 const done=change(initial,'finish',now+5000,{resultNote:'결과',nextStep:'다음'});assert.equal(resumeDisposition(done,'v2'),'finished');
 assert.throws(()=>resumeDisposition(initial,''),{status:400});
});

test('transitions and display helpers do not mutate their input or change identity',()=>{
 const original=session();const copy=structuredClone(original);Object.freeze(original);
 remainingSeconds(original,now+1000);resumeDisposition(original,'v2');
 const paused=change(original,'pause',now+3000);
 assert.deepEqual(original,copy);for(const key of ['id','user_id','enrollment_id','lesson_id','lesson_version','action_text','created_at'])assert.equal(paused[key],copy[key]);
 assert.equal(paused.revision,2);
});

test('untrusted stored JSON parser removes unknown fields and rejects corrupt records',()=>{
 for(const value of [null,undefined,[],42,'text',{}, {...session(),elapsed_seconds:9999}])assert.throws(()=>validateFocusSession(value),{status:400});
 const source={...session(),secret:'PRIVATE'};
 const result=validateFocusSession(source);assert.equal(result.secret,undefined);assert.notEqual(result,source);assert.deepEqual(result,session());
});
