import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
async function moduleFrom(path){const b=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));}
const {tourTasks,roomTasks,taskOpen}=await moduleFrom('features/campus/tour/tasks.ts');
const coverage=JSON.parse(readFileSync('features/campus/tour/coverage.json','utf8'));
test('all 78 original requirements have an explicit destination and completion boundary',()=>{
 assert.deepEqual(coverage.features.map(f=>f.number),Array.from({length:78},(_,i)=>i+1));
 const builtIn=['entry','scene','map','character','camera','checks'];
 for(const f of coverage.features){assert.ok(tourTasks.some(t=>t.id===f.destination)||builtIn.includes(f.destination),String(f.number));assert.ok(['preview','legacy-scene','service-check-required'].includes(f.status));}
 for(const n of [1,26,27,29,72,73,74,78])assert.equal(coverage.features[n-1].status,'service-check-required');
 assert.equal(new Set(tourTasks.map(t=>t.id)).size,tourTasks.length);
});
test('admin functions are absent from student task shelves in every room',()=>{for(const room of ['live','welcome','study','office']){assert.ok(roomTasks(room,'student').every(t=>!t.admin));assert.equal(roomTasks(room,'admin').length,tourTasks.filter(t=>t.room===room).length);}});
const {demoArchiveCall}=await moduleFrom('features/campus/business/archive-demo.ts');
test('preview archive validates updates and stores only locally with revision protection',async()=>{
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const scope=(await demoArchiveCall('scopes')).items[0].id;
 const command={action:'create',id:'00000000-0000-4000-8000-000000000091',requestId:'00000000-0000-4000-8000-000000000092',enrollmentId:scope,kind:'plan',title:'새 계획',body:'작게 실행하기',url:''};
 const saved=await demoArchiveCall('',undefined,command);assert.equal(saved.entry.revision,1);
 assert.equal((await demoArchiveCall('entries',scope)).items[0].title,'새 계획');
 await assert.rejects(()=>demoArchiveCall('',undefined,{...command,action:'update',expectedRevision:9}));
 await assert.rejects(()=>demoArchiveCall('',undefined,{...command,enrollmentId:'00000000-0000-4000-8000-000000000088'}));
 await assert.rejects(()=>demoArchiveCall('',undefined,{...command,url:'javascript:alert(1)'}));
 delete globalThis.localStorage;
});
test('tasks behind a switched-off server module leave the study menu, the rest stay',()=>{
 const off={focus:false,support:false,community:false},study=roomTasks('study','student');
 assert.deepEqual(study.filter(t=>taskOpen(t.id,off)).map(t=>t.id),['learning','growth','focus','ai','lounge','sound']);
 const on={focus:true,support:true,community:true},kept=['learning','growth','focus','journal','ai','feedback','lounge','sound'];
 // The CEO's utility review left eight study tasks; the rest stay out with every switch on and in the demo tour.
 assert.deepEqual(study.filter(t=>taskOpen(t.id,on)).map(t=>t.id),kept);assert.deepEqual(study.filter(t=>taskOpen(t.id)).map(t=>t.id),kept);
 assert.equal(taskOpen('admin:support',on),false);assert.equal(taskOpen('admin:moderation',on),true);
 assert.equal(taskOpen('admin:moderation',off),false);assert.equal(taskOpen('admin:support',off),false);assert.equal(taskOpen('admin:dashboard',off),true);
 for(const room of ['live','welcome','office'])assert.ok(roomTasks(room,'student').every(t=>taskOpen(t.id,off)));
});
