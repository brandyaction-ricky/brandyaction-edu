import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path, dependencies={}) {
 const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','require',js)(exports,name=>{if(name in dependencies)return dependencies[name];throw Error(name);});return exports;
}
const quiz=load('lib/mission-quiz.ts');
const rules=load('lib/edu-workflows.ts');
const definition={passPercent:67,questions:[{id:'one',prompt:'Question',options:['A','B'],correctIndex:0},{id:'two',prompt:'Second',options:['A','B'],correctIndex:1},{id:'three',prompt:'Third',options:['A','B'],correctIndex:0}]};
test('student quiz projection does not include answer keys',()=>{
 const result=quiz.publicQuiz(definition,'revision');assert.equal(result.revision,'revision');assert.ok(!JSON.stringify(result).includes('correctIndex'));assert.equal(definition.questions[0].correctIndex,0);
});
test('exact quiz threshold never rounds failed answers up',()=>{
 assert.equal(quiz.gradeQuiz(definition,{one:0,two:1,three:1}).passed,false);
 assert.equal(quiz.gradeQuiz({...definition,passPercent:66},{one:0,two:1,three:1}).passed,true);
 assert.equal(quiz.gradeQuiz(definition,{one:0,two:1,three:0}).score,100);
 for(const answer of [null,{},[],{one:'0',two:1,three:0},{one:2,two:1,three:0},{passed:true,score:100}]) assert.throws(()=>quiz.gradeQuiz(definition,answer));
});
test('quiz editor rejects duplicate choices and unknown answer indexes',()=>{
 assert.ok(quiz.validateQuiz({...definition,questions:[{...definition.questions[0],options:['A',' A ']}]}));
 assert.ok(quiz.validateQuiz({...definition,questions:[{...definition.questions[0],correctIndex:3}]}));
});
test('achievement counts latest approved required missions in the right enrollment',()=>{
 const missions=[{id:'m1',is_required:true,is_published:true},{id:'m2',is_required:true,is_published:true},{id:'private',is_required:true,is_published:false},{id:'optional',is_required:false,is_published:true}];
 const submissions=[{enrollment_id:'e',mission_id:'m1',attempt_number:1,status:'approved'},{enrollment_id:'e',mission_id:'m1',attempt_number:2,status:'changes_requested'},{enrollment_id:'e',mission_id:'m2',attempt_number:1,status:'approved'},{enrollment_id:'e',mission_id:'private',attempt_number:1,status:'approved'},{enrollment_id:'e',mission_id:'optional',attempt_number:1,status:'approved'},{enrollment_id:'other',mission_id:'m1',attempt_number:1,status:'approved'}];
 assert.deepEqual(rules.achievement('e',missions,submissions),{approved:1,total:2,percent:50,level:3});
 assert.deepEqual(rules.achievement('e',[],submissions),{approved:0,total:0,percent:null,level:null});
});
test('settings allowlist keeps scripts out and requires valid typed metrics',()=>{
 assert.deepEqual(rules.validateSetting('settings',{supportEmail:'help@example.com',supportUrl:'https://example.com',trackingEnabled:true,script:'alert(1)',role:'admin'}),{supportEmail:'help@example.com',supportUrl:'https://example.com',trackingEnabled:true});
 assert.throws(()=>rules.validateSetting('settings',{trackingEnabled:'true'}));
 assert.throws(()=>rules.validateSetting('settings',{trackingEnabled:true,supportUrl:'javascript:alert(1)'}));
 assert.throws(()=>rules.validateSetting('metrics',{date:'2026-02-30',campaign:'test',spend:1,impressions:1,clicks:1,leads:0,revenue:0}));
 assert.throws(()=>rules.validateSetting('metrics',{date:'2026-09-11',campaign:'test',spend:-1,impressions:1,clicks:1,leads:0,revenue:0}));
});
const uid='11111111-1111-4111-8111-111111111111';
function handler(user) {
 let calls=[];
 const exports=load('app/api/platform/workflows/route.ts',{
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(...args)=>{calls.push(args);return {data:1};}})},
 '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
 '@/lib/platform-rules':load('lib/platform-rules.ts'),
 '@/lib/edu-workflows':rules,
 '@/lib/participant-matrix':load('lib/participant-matrix.ts'),
 '@/lib/mission-quiz':quiz,
 '@/lib/platform':load('lib/platform.ts'),
 '@/lib/refunds':{processRefund:async()=>{throw Error('unexpected refund provider call');}},
 '@/lib/operator-permissions':{permissionsFor:async u=>({products:u?.role==='admin',members:u?.role==='admin',orders:u?.role==='admin',content:u?.role==='admin',marketing:u?.role==='admin'}),normalizeOperatorPermissions:v=>v||{}},
 });return {...exports,calls};
}
const request=(body,origin='https://example.com')=>new Request('https://example.com/api/platform/workflows',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('participant matrix requires membership operations permission before querying data', async () => {
 const request = new Request('https://example.com/api/platform/workflows?kind=participants');
 assert.equal((await handler(null).GET(request)).status,401);
 const member = handler({id:uid,role:'member'});
 assert.equal((await member.GET(request)).status,403);
 assert.equal(member.calls.length,0);
});
test('all operational writes require admin authentication and same origin',async()=>{
 for(const action of ['session','clone-cohort','quiz','review','assign','settings','refund','grant-enrollment']) {
  assert.equal((await handler(null).POST(request({action}))).status,401);
  assert.equal((await handler({id:uid,role:'student'}).POST(request({action,role:'admin'}))).status,403);
  assert.equal((await handler({id:uid,role:'admin'}).POST(request({action},'https://other.example'))).status,403);
 }
});
test('bulk review rejects duplicate IDs and missing feedback before a write',async()=>{
 const h=handler({id:uid,role:'admin'});
 assert.equal((await h.POST(request({action:'review',ids:[uid,uid],decision:'approved'}))).status,400);
 assert.equal((await h.POST(request({action:'review',ids:[uid],decision:'changes_requested',feedback:' '}))).status,400);
 assert.equal(h.calls.length,0);
 assert.equal((await h.POST(request({action:'review',ids:[uid],decision:'changes_requested',feedback:'출처를 추가해 주세요.'}))).status,200);
 assert.equal(h.calls[0][0],'review_mission_submissions');
 assert.equal(h.calls[0][1].p_actor,uid);
});
test('live-session mutation rejects invalid URL and non-integer order',async()=>{
 const h=handler({id:uid,role:'admin'});
 const values={cohort_id:uid,session_number:1,title:'Session',is_public:true,scheduled_at:'2026-09-12T00:00:00Z'};
 assert.equal((await h.POST(request({action:'session',values:{...values,live_url:'javascript:alert(1)'}}))).status,400);
 assert.equal((await h.POST(request({action:'session',values:{...values,session_number:1.2}}))).status,400);
 assert.equal(h.calls.length,0);
 assert.equal((await h.POST(request({action:'session',values:{...values,live_url:'https://meet.example.com/class'}}))).status,200);
});

test('private resource signing only follows a published lesson and authorized content lookup',async()=>{
 let signed=0;
 function resource(user,publication,content){let reads=0;const query={select(){return this;},eq(){return this;},async single(){return {data:reads++===0?publication:content};}};
 return load('app/api/platform/resource/route.ts',{
 '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
 '@/lib/supabase/server':{createClient:async()=>({from:()=>query})},
 '@/lib/platform-rules':load('lib/platform-rules.ts'),
 '@/lib/product-metadata':load('lib/product-metadata.ts',{'./platform':load('lib/platform.ts')}),
 '@/lib/supabase/admin':{createAdminClient:()=>({storage:{from:()=>({createSignedUrl:async(path,ttl)=>{assert.equal(path,'edu/private.pdf');assert.equal(ttl,60);signed++;return {data:{signedUrl:'https://signed.example/resource'}};}})}})},
 }).GET;}
 const req=new Request('https://example.com/api/platform/resource?lesson='+uid);
 assert.equal((await resource(null,{},{})(req)).status,401);
 assert.equal((await resource({id:uid},null,{resource_storage_path:'edu/private.pdf'})(req)).status,403);
 assert.equal((await resource({id:uid},{id:uid},null)(req)).status,403);
 assert.equal(signed,0);
 const response=await resource({id:uid},{id:uid},{resource_storage_path:'edu/private.pdf',resource_name:'자료.pdf'})(req);
 assert.equal(response.status,303);assert.equal(signed,1);
});
