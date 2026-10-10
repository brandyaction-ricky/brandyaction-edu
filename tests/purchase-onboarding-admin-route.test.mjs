import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function compile(path,deps={}){const mod={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,n=>deps[n]);return mod;}
const config=compile('../lib/purchase-onboarding.ts');
const cohort='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222';
const settings={roomName:'합성 기수',inviteUrl:'https://t.me/+ExampleCode123',enabled:true,checklistEnabled:true,orientationAt:'2026-11-06T20:00:00+09:00',firstLessonId:lesson};
function handler({authorized=true,other=false}={}){
 const writes=[];
 const db={from:table=>{const q={select(){return q},eq(){return q},is(){return q},maybeSingle:async()=>({data:table==='cohorts'?{id:cohort,course_id:'course',courses:{category:'paid_class',list_price:100}}:{id:lesson,curriculum_weeks:{course_id:other?'other':'course'}}}),upsert:async row=>{writes.push(row);return{}},insert:async()=>({})};return q;}};
 const route=compile('../app/api/admin/purchase-onboarding/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/operator-permissions':{getOperatorUser:async()=>authorized?{id:'operator',permissions:{orders:true}}:null},'@/lib/purchase-onboarding':config});
 return {writes,post:(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/admin/purchase-onboarding',{method:'POST',headers:{origin},body:JSON.stringify({cohort,settings,...body})}))};
}
test('operator persists actual cohort OT and guide settings; another course cannot be selected',async()=>{
 const h=handler();assert.equal((await h.post({})).status,200);assert.equal(h.writes[0].value.orientationAt,settings.orientationAt);assert.equal(h.writes[0].is_public,false);
 const other=handler({other:true});assert.equal((await other.post({})).status,400);assert.equal(other.writes.length,0);
});
test('unprivileged, cross-origin and incomplete checklist writes are rejected',async()=>{
 assert.equal((await handler({authorized:false}).post({})).status,403);
 assert.equal((await handler().post({},'https://other.test')).status,403);
 const h=handler();assert.equal((await h.post({settings:{...settings,orientationAt:''}})).status,400);assert.equal(h.writes.length,0);
});
