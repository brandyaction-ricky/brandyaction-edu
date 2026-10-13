import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const logic={};
new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/learning-care.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(logic);
const hour=3600000, start='2026-10-01T00:00:00Z', end=n=>new Date(Date.parse(start)+n*hour).toISOString();
const cell=(state='completed',elapsed=18,extra={})=>({lessonId:'current',title:'실제 학습',week:2,day:8,track:'learning',published:true,state,completedAt:end(elapsed),timing:{state:'known',previousLessonId:'required-before',previousCompletedAt:start},...extra});
const row=cells=>({memberId:'member',cells,lastVisitAt:end(100),lastContactAt:null});
test('bottleneck completion uses only existing completed + incomplete counts; overall progress stays intact',()=>{
 const states=['completed','not_submitted','locked','scheduled','submitted','changes_requested'];
 const rows=states.map(state=>row([cell(state,18,{published:state!=='scheduled'})]));
 const day=logic.careDaySummaries(rows,end(100))[0];
 assert.equal(day.percent,20);assert.equal(day.completionRate,50);assert.equal(day.eligible,2);
 assert.deepEqual([day.done,day.missing,day.locked,day.pending,day.returned],[1,1,1,1,1]);
 assert.equal(logic.careAggregate(rows,end(100)).percent,20);
 assert.equal(logic.careDaySummaries([row([cell('locked')])])[0].completionRate,null);
});
test('median uses predecessor timestamps, excludes unfinished/first/missing/reversed/future records and handles even/odd samples',()=>{
 const durations=[1,18,24,100];
 const rows=durations.map(n=>row([cell('completed',n)]));
 const skipped=[cell('not_submitted',3),cell('completed',3,{timing:undefined}),cell('completed',3,{timing:{state:'first'}}),cell('completed',-1),cell('completed',201),cell('completed',3,{completedAt:'bad'}),cell('completed',3,{timing:{state:'unavailable',previousLessonId:'required-before',previousCompletedAt:start}})];
 const day=logic.careDaySummaries([...rows,...skipped.map(c=>row([c]))],end(200))[0];
 assert.equal(day.medianMilliseconds,21*hour);assert.equal(day.timingSamples,4);assert.equal(day.timingMissing,5);
 assert.equal(logic.careDaySummaries(rows.slice(0,3),end(200))[0].medianMilliseconds,18*hour);
 assert.equal(logic.careDaySummaries([row([cell('completed',3,{timing:{state:'first'}})])])[0].firstDay,true);
 const duplicate=logic.careDaySummaries([row([cell(),cell()])])[0];assert.equal(duplicate.invalid,true);assert.equal(duplicate.medianMilliseconds,null);
});
test('72 hour boundary uses currently actionable published learning and never invents a clock or counts review waiting',()=>{
 const base=row([cell('not_submitted')]);
 assert.equal(logic.careAttention(base,end(72)).stalled,true);
 assert.equal(logic.careAttention(base,end(72-1/3600000)).stalled,false);
 assert.equal(logic.careAttention(base,end(72)).stalledMilliseconds,72*hour);
 for(const extra of [{timing:undefined},{timing:{state:'first'}},{timing:{state:'unavailable'}},{published:false},{track:'daily'}])assert.equal(logic.careAttention(row([cell('not_submitted',18,extra)]),end(100)).stalled,false);
 for(const state of ['submitted','locked','scheduled','completed','error','changes_requested'])assert.equal(logic.careAttention(row([cell(state)]),end(100)).stalled,false);
 assert.equal(logic.careAttention(base,end(-1)).stalled,false);
 assert.equal(logic.careAttention({...base,lastVisitAt:end(28)},end(100)).followUp,true);
 assert.equal(logic.careAttention({...base,lastVisitAt:null},end(100)).followUp,false);
 assert.equal(logic.careAttention({...base,lastVisitAt:end(100)},end(100)).needsAttention,true);
});
test('sorts exact completion fractions and medians; missing values last; never mutates curriculum ordering',()=>{
 const days=[{lessonId:'a',week:1,day:1,completionRate:33,done:1,eligible:3,medianMilliseconds:null},{lessonId:'b',week:1,day:2,completionRate:33,done:33,eligible:100,medianMilliseconds:50*hour},{lessonId:'c',week:1,day:3,completionRate:null,done:0,eligible:0,medianMilliseconds:2*hour}];
 assert.deepEqual(logic.careSortDays(days,'completion').map(d=>d.lessonId),['b','a','c']);
 assert.deepEqual(logic.careSortDays(days,'duration').map(d=>d.lessonId),['b','c','a']);
 assert.deepEqual(days.map(d=>d.lessonId),['a','b','c']);
 assert.equal(logic.careDuration(18*hour),'18시간');assert.equal(logic.careDuration(null),'기록 확인 필요');
});
