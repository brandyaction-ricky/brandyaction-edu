import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]);return exports;}
const logic=load('lib/learning-care.ts'),asOf='2026-10-08T08:00:00Z';
const cell=(state,track='learning',published=true)=>({lessonId:'lesson',state,track,published,completedAt:state==='completed'?'2026-10-07T08:00:00Z':null});
test('progress excludes unreleased work, separates tracks and fails visibly on configuration errors',()=>{
 const cells=[cell('completed','daily'),cell('submitted','daily'),cell('scheduled','daily',false),cell('completed','learning')];
 assert.deepEqual(logic.careProgress(cells,'daily'),{total:2,done:1,percent:50});assert.equal(logic.careProgress(cells,'learning').percent,100);
 assert.equal(logic.careProgress([cell('error')]).percent,null);assert.equal(logic.careProgress([]).percent,null);
});
test('contact safety excludes pending, completed, locked, recent contact; next step prioritizes returned work',()=>{
 for(const state of ['completed','submitted','locked','scheduled','error'])assert.equal(logic.canCareContact({cells:[cell(state)]},'lesson',asOf),false);
 const row={cells:[cell('not_submitted')],lastContactAt:'2026-10-08T07:00:00Z'};
 assert.equal(logic.canCareContact(row,'lesson',asOf),false);row.lastContactAt='2026-10-06T07:00:00Z';assert.equal(logic.canCareContact(row,'lesson',asOf),true);
 assert.equal(logic.canCareContact({...row,contactEligible:false},'lesson',asOf),false);
 assert.equal(logic.nextCareCell([cell('not_submitted'),cell('submitted'),cell('changes_requested')]).state,'changes_requested');
});
test('share projection contains aggregates only and deduplicates student counts across enrollments',()=>{
 const a=logic.careAggregate([{memberId:'private-id',name:'private-name',email:'private-email',cells:[cell('completed')]},{memberId:'private-id',cells:[cell('submitted')]}],asOf);
 assert.equal(a.members,1);assert.equal(a.enrollments,2);assert.equal(a.pending,1);assert.equal(a.recent,1);assert.doesNotMatch(JSON.stringify(a),/private/);
});
const thirty=(done=0)=>Array.from({length:30},(_,i)=>({...cell(i<done?'completed':'not_submitted'),lessonId:'day-'+(i+1),day:i+1}));
test('learning progress ignores every mission state and uses published learning thresholds',()=>{
 for(const [done,band] of [[0,'starting'],[2,'starting'],[3,'progressing'],[23,'progressing'],[24,'finishing'],[30,'finishing']]){
  const result=logic.careLearningProgress([...thirty(done),cell('error','daily'),cell('completed','daily')]);assert.equal(result.band,band);assert.equal(result.done,done);assert.equal(result.total,30);
 }
 const opening=thirty(1).map((c,i)=>i?{...c,state:'scheduled',published:false}:c);
 assert.equal(logic.careLearningProgress(opening).percent,100);
 assert.equal(logic.careLearningProgress([cell('completed','daily')]).band,'unknown');
 assert.equal(logic.careLearningProgress([cell('error')]).percent,null);
 assert.equal(logic.careAttention({cells:[cell('changes_requested','daily')],lastVisitAt:asOf},asOf).needsAttention,false);
 assert.equal(logic.canCareContact({cells:[cell('not_submitted','daily')]},'lesson',asOf),false);
 const combined={rows:[{memberId:'a',cells:[cell('completed'),cell('error','daily')]}],asOf};
 const clean=logic.careLearningSnapshot(combined);assert.equal(clean.rows[0].cells.length,1);assert.equal(combined.rows[0].cells.length,2);
 assert.equal(logic.careAggregate(combined.rows,asOf).percent,100);
});
test('attention flags never infer delay from overall color, future/locked missions or review waiting alone',()=>{
 const old='2026-10-01T00:00:00Z';
 for(const state of ['completed','submitted','locked','scheduled'])assert.equal(logic.careAttention({cells:[cell(state)],lastVisitAt:old},asOf).needsAttention,false);
 assert.equal(logic.careAttention({cells:[cell('not_submitted')],lastVisitAt:asOf},asOf).needsAttention,false);
 assert.equal(logic.careAttention({cells:[cell('not_submitted')],lastVisitAt:null},asOf).needsAttention,false);
 assert.equal(logic.careAttention({cells:[cell('not_submitted')],lastVisitAt:old},asOf).followUp,true);
 assert.equal(logic.careAttention({cells:[cell('changes_requested')],lastVisitAt:asOf},asOf).returned,1);
});
test('DAY drill-down uses actual lessons including week zero and distinct lessons sharing a day',()=>{
 const rows=['completed','submitted','changes_requested','not_submitted','locked','scheduled'].map(state=>({cells:[{...cell(state,'learning',state!=='scheduled'),week:0,day:1}]}));
 const [day]=logic.careDaySummaries(rows);assert.equal(day.available,5);assert.equal(day.percent,20);
 assert.deepEqual([day.done,day.pending,day.returned,day.missing,day.locked],[1,1,1,1,1]);assert.equal(logic.careDaySummaries(rows).length,1);
 rows[0].cells.push({...rows[0].cells[0],lessonId:'different',week:1});
 rows[0].cells.push({...rows[0].cells[0],lessonId:'mission',track:'daily'});
 const days=logic.careDaySummaries(rows);assert.equal(days.length,2);assert.deepEqual(days.map(d=>d.week),[0,1]);assert.ok(days.every(d=>!d.invalid));
 rows[0].cells.push({...rows[0].cells[0]});assert.equal(logic.careDaySummaries(rows)[0].invalid,true);
 assert.deepEqual(logic.careDaySummaries([{cells:[cell('completed','daily')]}]),[]);
});
const uuid='11111111-1111-4111-8111-111111111111';
function harness({user={id:uuid},allowed=true,error=null,member=false,track='learning'}={}){
 const calls=[],mocks={
 '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
 '@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{assert.equal(scope,'members');assert.equal(actor,user);return allowed?actor:null;}},
 '@/lib/learning-care':logic,
 '@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)},
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:(name,args)=>({abortSignal:async()=>{calls.push({name,args});return{data:{rows:[{cells:[{...cell('not_submitted',track),lessonId:uuid},{...cell('completed','daily'),lessonId:'mission'}]}]},error:name==='edu_send_learning_care'||name==='edu_member_learning_care'?error:null};}})})}};
 const route=load('app/api/'+(member?'member':'admin')+'/learning-care/route.ts',mocks);
 const payload={requestId:uuid,cohortId:uuid,lessonId:uuid,recipients:[uuid],content:'함께 학습해요'};
 return{calls,get:q=>route.GET(new Request('https://edu.test/api/admin/learning-care'+(q||''))),post:(body=payload,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/admin/learning-care',{method:'POST',headers:{origin},body:JSON.stringify(body)})),payload};
}
test('care API rejects unauthorized or invalid scope before database access and uses authenticated actor',async()=>{
 for(const options of [{user:null},{allowed:false}]){const h=harness(options);assert.equal((await h.get()).status,403);assert.equal(h.calls.length,0);}
 const h=harness();assert.equal((await h.get('?cohort=bad')).status,400);const response=await h.get('?cohort='+uuid+'&actor=forged');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(h.calls[0].args.p_actor,uuid);
 const student=harness({member:true});await student.get('?actor=forged');assert.deepEqual(student.calls[0].args,{p_actor:uuid});
});
test('care send uses origin, bounded body, explicit messages flag and current recipient RPC',async()=>{
 const prior=process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED='true';
 try{const h=harness();assert.equal((await h.post(h.payload,'https://evil.test')).status,403);assert.equal(h.calls.length,0);
 for(const invalid of [null,{}, {...h.payload,recipients:[]},{...h.payload,content:' '},{...h.payload,recipients:['bad']},{...h.payload,content:'a'.repeat(41000)}])assert.ok((await h.post(invalid)).status>=400);
 assert.equal((await h.post()).status,200);assert.equal(h.calls.length,2);assert.equal(h.calls[1].name,'edu_send_learning_care');assert.equal(h.calls[1].args.p_actor,uuid);
 const changed=harness({error:{message:'CARE_RECIPIENT_CHANGED'}});assert.equal((await changed.post()).status,409);
 const raw=harness({error:{message:'secret query'}});assert.doesNotMatch(await(await raw.get()).text(),/secret query/);
 process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED='false';assert.equal((await h.post()).status,404);
 }finally{if(prior===undefined)delete process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;else process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED=prior;}
});

test('admin snapshot removes mission cells and stale mission requests never call the sender',async()=>{
 const h=harness();assert.equal((await(await h.get()).json()).rows[0].cells.length,1);
 const prior=process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED='true';
 try{const mission=harness({track:'daily'});assert.equal((await mission.post()).status,409);assert.equal(mission.calls.length,1);assert.equal(mission.calls[0].name,'edu_admin_learning_care');}
 finally{if(prior===undefined)delete process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;else process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED=prior;}
});
