import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/purchase-onboarding-progress-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const schedule='2026-11-06T20:00:00+09:00';
function fixture({completed=false,hidden=false,wrongCourse=false,revoked=false,locked=false,rows=[]}={}) {
 const saved=[];
 const datasets={edu_onboarding_steps:rows,enrollments:revoked?null:{id:'enrollment',course_id:'course',access_starts_at:'2020-01-01',access_ends_at:null},curriculum_lessons:{id:'lesson',title:'규정',week_id:'week',curriculum_weeks:{course_id:wrongCourse?'other':'course',is_published:true,archived_at:null}},edu_cohort_lesson_visibility:{is_published:!hidden},edu_cohort_week_visibility:{is_published:true},lesson_progress:{completed_at:completed?'2026-10-10':null}};
 const filters=[];
 const db={from:table=>{const q={select(){return q;},eq(k,v){filters.push([table,k,v]);return q;},is(){return q;},maybeSingle(){return Promise.resolve({data:datasets[table]});},upsert(row){saved.push(row);return Promise.resolve({error:null});},then(resolve,reject){return Promise.resolve({data:datasets[table]}).then(resolve,reject);}};return q;},rpc:async()=>({data:{isUnlocked:!locked}})};
 const lib={};new Function('exports','require',code)(lib,name=>name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:{});
 const purchase={orderId:'order',cohortId:'cohort',settings:{orientationAt:schedule,firstLessonId:'lesson'}};
 return {read:()=>lib.readOnboardingProgress('buyer',purchase),confirm:body=>lib.confirmOnboardingStep('buyer',purchase,body),saved,filters};
}
const prior=[{step:'telegram'},{step:'app'},{step:'orientation',confirmation_value:schedule}];
test('progress requires real completion and selected guide; changed schedule requires acknowledgement again',async()=>{
 const rows=[...prior,{step:'learning',confirmation_value:'lesson',comment:'확인했습니다'}];
 let h=fixture({completed:true,rows});assert.equal((await h.read()).learning,true);assert.equal((await h.read()).lesson.url,'/learn/enrollment/lesson');
 assert.ok(h.filters.some(([t,k,v])=>t==='edu_onboarding_steps'&&k==='user_id'&&v==='buyer'));
 assert.equal((await fixture({rows}).read()).learning,false);
 for(const condition of [{hidden:true},{wrongCourse:true},{revoked:true},{locked:true}]) assert.equal((await fixture({...condition,completed:true,rows}).read()).lesson,null);
 assert.equal((await fixture({rows:[{step:'orientation',confirmation_value:'old'}]}).read()).orientation,false);
});
test('forged and out-of-order completion, stale OT, blank comment are rejected without a write',async()=>{
 for(const [options,body] of [[{}, {step:'app'}],[{rows:prior},{step:'orientation',orientationAt:'old'}],[{rows:prior},{step:'learning',lessonId:'lesson',comment:'read'}],[{completed:true,rows:prior},{step:'learning',lessonId:'other',comment:'read'}],[{completed:true,rows:prior},{step:'learning',lessonId:'lesson',comment:'  '}]] ) {const h=fixture(options);await assert.rejects(h.confirm(body));assert.equal(h.saved.length,0);}
 const h=fixture({completed:true,rows:prior});await h.confirm({step:'learning',lessonId:'lesson',comment:' 규정을 확인했습니다 '});assert.deepEqual(h.saved[0],{order_id:'order',user_id:'buyer',step:'learning',confirmation_value:'lesson',comment:'규정을 확인했습니다',confirmed_at:h.saved[0].confirmed_at});
});
