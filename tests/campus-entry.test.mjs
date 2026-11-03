import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({entryPoints:['features/campus/entry.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {campusEntry,campusEntryPath}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now=Date.parse('2026-11-03T00:00:00Z');
const enrollment={id:id(1),user_id:id(2),cohort_id:id(3),status:'active',access_starts_at:'2026-11-02',access_ends_at:'2026-12-01'};
test('entry distinguishes pre-start welcome from current learning without admitting revoked or foreign students',()=>{
 assert.equal(campusEntry(enrollment,id(2),id(3),now).ready,true);
 assert.equal(campusEntry({...enrollment,access_starts_at:'2026-11-04'},id(2),id(3),now).ready,false);
 for(const patch of [{status:'revoked'},{status:'refunded'},{revoked_at:'2026-11-03'},{user_id:id(4)},{cohort_id:id(4)},{access_ends_at:'2026-11-03'},{access_starts_at:'bad'},{access_ends_at:'bad'},{id:'bad'}])assert.equal(campusEntry({...enrollment,...patch},id(2),id(3),now),null);
});
test('share links contain cohort only and never an individual enrollment or identity',()=>{
 assert.equal(campusEntryPath(id(3),true),'/campus/enter?cohort='+id(3)+'&welcome=1');
 assert.equal(campusEntryPath(id(3)),'/campus/enter?cohort='+id(3));
 assert.equal(campusEntryPath(),'/campus/enter');
 assert.ok(!campusEntryPath(id(3)).includes(enrollment.id));
});
