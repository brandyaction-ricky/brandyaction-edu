import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ entryPoints:['lib/staff-curriculum-review-server.ts'], bundle:true, write:false, platform:'node', format:'esm', plugins:[{name:'isolated-admin',setup(b){b.onResolve({filter:/supabase\/admin$/},()=>({path:'admin',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createAdminClient(){throw Error("No external DB in this test")}'}));}}] });
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text + "\n//# sourceURL=staff-review-test-bundle.mjs").toString('base64'));
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const actor=(role='staff',status='active')=>({id:id(1),role,status});
function fixture(){
 const tables={
  courses:[{id:id(2),title:'과정',category:'paid_class',archived_at:null}],
  cohorts:[{id:id(3),course_id:id(2),name:'1기',status:'active',archived_at:null},{id:id(4),course_id:id(2),name:'2기',status:'active',archived_at:null}],
  curriculum_weeks:[{id:id(5),course_id:id(2),week_number:1,title:'첫 주',is_published:true,archived_at:null}],
  curriculum_lessons:[6,7,8,9].map((n,i)=>({id:id(n),week_id:id(5),day_number:i+1,title:`수업${i+1}`,description:'안내',is_published:n!==8,archived_at:n===9?'2026-01-01':null})),
  edu_cohort_week_visibility:[{week_id:id(5),cohort_id:id(3),is_published:true},{week_id:id(5),cohort_id:id(4),is_published:true}],
  edu_cohort_lesson_visibility:[6,7,8,9].map(n=>({lesson_id:id(n),cohort_id:id(3),is_published:true})),
  enrollments:[{id:id(10),course_id:id(2),cohort_id:id(3),user_id:id(1),status:'active',revoked_at:null,created_at:'2026-01-01'}, {id:id(11),course_id:id(2),cohort_id:id(3),user_id:id(99),status:'active',created_at:'2026-02-01'}],
  lesson_progress:[{id:id(12),enrollment_id:id(10),lesson_id:id(6),completed_at:'2026-01-02'}], edu_preserved_lesson_access:[],
  edu_lesson_block_heads:[{lesson_id:id(7),revision:id(15)}],
  edu_lesson_block_versions:[{id:id(15),lesson_id:id(7),document:{schemaVersion:1,blocks:[{id:'q',type:'quiz',content:'퀴즈',quiz:{passPercent:100,questions:[{id:'one',prompt:'질문',options:['가','나'],correctIndex:0}]}},{id:'file',type:'file',assetId:id(16)}],checklist:[]}}],
  lesson_contents:[{lesson_id:id(7),body_text:'공개 본문',resource_name:'자료',resource_storage_path:'course/file'}],
  edu_lesson_media:[{id:id(16),course_id:id(2),kind:'file',path:'media/file',name:'자료.pdf',size:123,ready_at:'2026-01-01'}],
 };
 let gateError=false;const reads=[];
 const db={from(table){assert.ok(table in tables,`unexpected table ${table}`);reads.push(table);let source=tables[table].map(r=>({...r})),cols='*',start=0,end=Infinity;
  const q={select(c){cols=c;return q},eq(k,v){source=source.filter(r=>r[k]===v);return q},not(k,op,v){assert.equal(op,'is');source=source.filter(r=>r[k]!==v&&r[k]!==undefined);return q},order(k,o={}){source.sort((a,b)=>String(a[k]||'').localeCompare(String(b[k]||''))*(o.ascending===false?-1:1));return q},range(a,b){start=a;end=b;return q},then(resolve,reject){return Promise.resolve({data:source.slice(start,end+1).map(r=>cols==='*'?r:Object.fromEntries(cols.split(',').map(c=>{const [alias,key]=c.split(':');return[alias,r[key||alias]]}))),error:null}).then(resolve,reject)}};return q},
  async rpc(name,args){reads.push(name);if(name==='edu_read_lesson_progression'){assert.equal(args.p_actor,id(1));assert.equal(args.p_enrollment,id(10));return gateError?{error:{message:'failure'},data:null}:{error:null,data:[{lessonId:id(6),isUnlocked:true},{lessonId:id(7),isUnlocked:false}]}}
   assert.equal(name,'edu_cohort_lesson_visible');const l=tables.curriculum_lessons.find(l=>l.id===args.p_lesson),w=tables.curriculum_weeks.find(w=>w.id===l?.week_id);return{error:null,data:!!(l?.is_published&&!l.archived_at&&w?.is_published&&!w.archived_at&&tables.edu_cohort_lesson_visibility.some(v=>v.cohort_id===args.p_cohort&&v.lesson_id===l.id&&v.is_published)&&tables.edu_cohort_week_visibility.some(v=>v.cohort_id===args.p_cohort&&v.week_id===w.id&&v.is_published))};},
 };
 return{db,tables,reads,failGate(){gateError=true;}};
}
test('admin and staff receive identical published curriculum without changing any rows',async()=>{
 process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';const f=fixture(),before=JSON.stringify(f.tables);
 const staff=await api.readCurriculumReview(actor(),{},f.db),admin=await api.readCurriculumReview(actor('admin'),{},f.db);
 assert.deepEqual(admin,staff);assert.equal(staff.cohorts.length,2);assert.deepEqual(staff.lessons.map(l=>l.id),[id(6),id(7)]);assert.equal(staff.lessons[0].completed,true);assert.equal(staff.lessons[1].studentUnlocked,false);assert.equal(JSON.stringify(f.tables),before);
});
test('ordinary, suspended and withdrawn users are denied before a privileged query',async()=>{
 for(const a of [actor('student'),actor('member'),actor('staff','suspended'),actor('admin','withdrawn')]){
  const f=fixture();await assert.rejects(api.readCurriculumReview(a,{},f.db),{status:403});await assert.rejects(api.readReviewContent(a,id(3),id(7),false,f.db),{status:403});assert.deepEqual(f.reads,[]);
 }
});
test('other students enrollments cannot be used; no enrollment is created to review another cohort',async()=>{
 const f=fixture();await assert.rejects(api.readCurriculumReview(actor(),{enrollment:id(11)},f.db),{status:403});const before=JSON.stringify(f.tables);const snapshot=await api.readCurriculumReview(actor(),{cohort:id(4)},f.db);assert.equal(snapshot.enrollmentId,null);assert.equal(JSON.stringify(f.tables),before);
});
test('a direct class link keeps its own enrollment when two grants cover the same cohort',async()=>{
 const f=fixture();
 const original=f.tables.enrollments.find(e=>e.id===id(10));
 f.tables.enrollments.unshift({...original,id:id(30),created_at:'2090-01-01'});
 const selected=await api.readCurriculumReview(actor(),{enrollment:id(10)},f.db);
 assert.equal(selected.enrollmentId,id(10));
 original.access_ends_at='2020-01-01';
 assert.equal((await api.readCurriculumReview(actor(),{enrollment:id(10)},f.db)).enrollmentId,id(30));
 f.tables.enrollments[0].revoked_at='2020-01-01';
 assert.equal((await api.readCurriculumReview(actor(),{enrollment:id(10)},f.db)).enrollmentId,null);
});
test('review reads a locked lesson but student mode fails closed, including a failed gate lookup',async()=>{
 const f=fixture();const content=await api.readReviewContent(actor(),id(3),id(7),false,f.db);assert.equal(content.body,'공개 본문');assert.equal(content.document.blocks[0].quiz.questions[0].correctIndex,undefined);assert.equal('draft' in content,false);assert.equal('submission' in content,false);
 await assert.rejects(api.readReviewContent(actor(),id(3),id(7),true,f.db),{status:403});f.failGate();const s=await api.readCurriculumReview(actor(),{},f.db);assert.equal(s.studentStateError,true);assert.ok(s.lessons.every(l=>!l.studentUnlocked));await assert.rejects(api.readReviewContent(actor(),id(3),id(6),true,f.db),{status:503});
});
test('hidden, archived, other-cohort and archived-course content cannot be opened by direct URL',async()=>{
 const f=fixture();for(const n of [8,9])await assert.rejects(api.readReviewContent(actor(),id(3),id(n),false,f.db),{status:404});await assert.rejects(api.readReviewContent(actor(),id(4),id(7),false,f.db),{status:404});f.tables.courses[0].archived_at='2026-01-01';await assert.rejects(api.readReviewContent(actor(),id(3),id(7),false,f.db),{status:404});
});
test('downloads require an asset referenced in the current published lesson, matching course and kind',async()=>{
 const f=fixture();assert.equal((await api.readReviewAsset(actor(),id(3),id(7),id(16),false,f.db)).path,'media/file');
 await assert.rejects(api.readReviewAsset(actor(),id(3),id(7),id(17),false,f.db),{status:404});await assert.rejects(api.readReviewAsset(actor(),id(3),id(7),id(16),true,f.db),{status:403});
 f.tables.edu_lesson_media[0].course_id=id(80);await assert.rejects(api.readReviewAsset(actor(),id(3),id(7),id(16),false,f.db),{status:404});
});
test('legacy and graduate access is calculated from existing IDs without fabricating completions',async()=>{
 process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='false';const f=fixture();const s=await api.readCurriculumReview(actor(),{},f.db);assert.ok(s.lessons.every(l=>l.studentUnlocked));assert.equal(s.lessons[1].completed,false);
 f.tables.lesson_progress=[];f.tables.cohorts[0].status='completed';const g=await api.readCurriculumReview(actor(),{},f.db);assert.ok(g.lessons.every(l=>l.studentUnlocked&&!l.completed));
});
test('the HTTP route enforces authentication, current role and input scope; exposes GET only',async()=>{
 const compiled=await build({entryPoints:['app/api/platform/curriculum-review/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'route-fixtures',setup(b){
  b.onResolve({filter:/lib\/server-auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/supabase\/admin$/},()=>({path:'db',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?'export async function getAuthenticatedUser(){return globalThis.__reviewActor}':'export function createAdminClient(){return globalThis.__reviewDB}'}));
 }}]});
 const route=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text+'\n//# sourceURL=review-route-test.mjs').toString('base64'));
 assert.equal(route.POST,undefined);assert.equal(route.PATCH,undefined);process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';const f=fixture();globalThis.__reviewDB=f.db;
 try{
  for(const [a,status] of [[null,401],[actor('student'),403],[actor('staff','suspended'),403]]){globalThis.__reviewActor=a;assert.equal((await route.GET(new Request('http://localhost/api/platform/curriculum-review'))).status,status)}
  assert.deepEqual(f.reads,[]);globalThis.__reviewActor=actor();
  assert.equal((await route.GET(new Request('http://localhost/api/platform/curriculum-review?cohort=invalid'))).status,400);
  assert.equal((await route.GET(new Request('http://localhost/api/platform/curriculum-review?enrollment='+id(11)))).status,403);
  const response=await route.GET(new Request(`http://localhost/api/platform/curriculum-review?cohort=${id(3)}&lesson=${id(7)}`));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const json=await response.json();assert.equal(json.document.blocks[0].quiz.questions[0].correctIndex,undefined);assert.equal(JSON.stringify(json).includes('resource_storage_path'),false);
 }finally{delete globalThis.__reviewActor;delete globalThis.__reviewDB;}
});
