import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({entryPoints:['features/campus/support/review-planning.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {parseReviewPlan}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-11-03T03:00:00Z'),uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('operator review plan validates bounded date and explicit CAS; never derives a student deadline',()=>{
 const body={id:uid(1),missionId:uid(2),plannedAt:new Date(now+86400000).toISOString(),revision:0};
 assert.deepEqual(parseReviewPlan(body,now),{id:uid(1),mission_id:uid(2),planned_at:body.plannedAt,expectedRevision:0});
 for(const edit of [{id:'other'},{missionId:'other'},{revision:-1},{revision:1.2},{plannedAt:'bad'},{plannedAt:new Date(now-120000).toISOString()},{plannedAt:new Date(now+181*86400000).toISOString()}])assert.throws(()=>parseReviewPlan({...body,...edit},now));
});
