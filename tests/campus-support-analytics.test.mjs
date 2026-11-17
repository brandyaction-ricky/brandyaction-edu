import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['features/campus/support/analytics.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {analyzeSupport,retrospectiveMarkdown}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-11-03T03:00:00Z'),day=86400000,t=n=>new Date(now-n*day).toISOString();
const request=(id,n,extra={})=>({id,user_id:id,enrollment_id:id,lesson_id:'lesson',category:'tool',title:id,status:'open',created_at:t(n),updated_at:t(n),...extra});
const base={requests:[],actions:[],submissions:[],focus:[],missions:[{id:'m',lesson_id:'lesson',title:'고객 문제'}],lessons:[{id:'lesson',title:'타겟',day_number:1}],sessions:[],bookings:[],now};
test('support analytics counts latest attempts and excludes unrelated/out-of-window effects',()=>{
 const v=analyzeSupport({...base,requests:[request('a',5)],actions:[{id:'reply',request_id:'a',kind:'reply',created_at:t(3)}],submissions:[{id:'old',enrollment_id:'a',mission_id:'m',attempt_number:1,status:'changes_requested',submitted_at:t(4),reviewed_at:t(4)},{id:'new',enrollment_id:'a',mission_id:'m',attempt_number:2,status:'submitted',submitted_at:t(2),reviewed_at:null},{id:'other',enrollment_id:'b',mission_id:'m',attempt_number:1,status:'approved',submitted_at:t(2),reviewed_at:t(1)}],focus:[{id:'f',enrollment_id:'a',lesson_id:'lesson',status:'finished',updated_at:t(1)},{id:'wrong',enrollment_id:'a',lesson_id:'different',status:'finished',updated_at:t(1)}]});
 assert.equal(v.submissionQueue.length,1);assert.equal(v.submissionQueue[0].id,'new');assert.equal(v.effects[0].submitted,1);assert.equal(v.effects[0].resubmitted,1);assert.equal(v.effects[0].approved,0);assert.equal(v.effects[0].executed,1);assert.equal(v.effects[0].windowComplete,false);assert.equal(v.forecast,null);
});
test('support projections require four weeks; handover is not student help and old outcomes do not count',()=>{
 const v=analyzeSupport({...base,requests:[request('history',35),request('new',3),request('prev',9),request('past',15)],actions:[{id:'note',request_id:'new',kind:'handover',created_at:t(2)}]});
 assert.equal(v.forecast.weeklyAverage,.75);assert.equal(v.currentRequests,1);assert.equal(v.previousRequests,1);assert.equal(v.effects.length,0);assert.equal(v.obstacles[0].learners,1);assert.match(retrospectiveMarkdown(v),/인과 효과를 뜻하지/);
});
test('support reply observation closes at seven days even when a later action succeeds',()=>{
 const v=analyzeSupport({...base,requests:[request('a',20)],actions:[{id:'r',request_id:'a',kind:'reply',created_at:t(14)}],submissions:[{id:'late',enrollment_id:'a',mission_id:'m',attempt_number:2,status:'approved',submitted_at:t(6),reviewed_at:t(1)}]});
 assert.equal(v.effects[0].windowComplete,true);assert.equal(v.effects[0].submitted,0);assert.equal(v.effects[0].approved,0);
});
