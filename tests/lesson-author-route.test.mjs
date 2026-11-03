import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import ts from 'typescript';
const cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,r=>load(r.replace('./','')));return exports;}
const contract=load('lesson-author-drafts');
const payload=()=>({form:{basic:{week_id:id(),day_number:'1',title:'초안 제목',description:'',duration_label:'',is_published:false,is_preview:false},format:'text',bodyText:'본문',videoUrl:'',externalUrl:'',resourceName:'',resourcePath:''},blocks:{active:false,document:{schemaVersion:1,blocks:[],checklist:[]}}});
function harness({user={id:id()},error=null,stored=payload()}={}){
 const out={},calls=[],invalidations=[],revision=id();
 const dependencies={
  '@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'products');return user;}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:(name,args)=>({abortSignal:async signal=>{assert.ok(signal instanceof AbortSignal);calls.push({name,args});return{data:name==='edu_lesson_author_snapshot'?{payload:stored,stamp:'a'.repeat(32)}:name==='edu_read_lesson_author'?{revision,payload:stored,public:{stamp:'a'.repeat(32),payload:stored,blockRevision:null}}:{revision:args.p_request},error};}})})},
  '@/lib/edu-workflows':load('edu-workflows'),'@/lib/lesson-author-drafts':contract,
  'next/cache':{revalidateTag:(...v)=>invalidations.push(v)},'@/lib/public-platform-plan':{PUBLIC_CACHE_TAG:'public'}
 };
 new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../app/api/admin/lesson-author/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>{assert.ok(dependencies[name],name);return dependencies[name];});
 const body={action:'save',lessonId:id(),requestId:id(),expectedRevision:null,stamp:'a'.repeat(32),create:false,rebase:false,payload:payload()};
 return {calls,body,invalidations,user,revision,get:q=>out.GET(new Request('https://edu.test/api/admin/lesson-author?'+q)),post:(body,origin='https://edu.test')=>out.POST(new Request('https://edu.test/api/admin/lesson-author',{method:'POST',headers:origin?{origin}:{},body:typeof body==='string'?body:JSON.stringify(body)}))};
}
test('draft route requires permission/origin, uses session actor, and never invalidates student cache for a draft',async()=>{
 const denied=harness({user:null});assert.equal((await denied.get('lesson='+denied.body.lessonId)).status,403);assert.equal((await denied.post(denied.body)).status,403);assert.equal(denied.calls.length,0);
 const h=harness();assert.equal((await h.post(h.body,null)).status,403);assert.equal((await h.post(h.body,'https://other.test')).status,403);assert.equal(h.calls.length,0);
 const res=await h.post({...h.body,p_actor:'spoofed'});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(h.calls[0].args.p_actor,h.user.id);assert.equal(h.invalidations.length,0);
 assert.equal((await h.get('lesson='+h.body.lessonId+'&version='+id())).status,200);
});
test('invalid/oversized input cannot reach RPC, and unfinished questions save only as drafts',async()=>{
 const h=harness();for(const body of [null,{},'{',{...h.body,requestId:'bad'},{...h.body,expectedRevision:undefined},{...h.body,payload:{form:[]}}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post(' '.repeat(4100001))).status,413);assert.equal(h.calls.length,0);
 const p=payload();p.form.basic.title='';p.blocks.active=true;p.blocks.document.blocks.push({id:'q',type:'question',question:{label:'',kind:'text',required:true}});assert.deepEqual(contract.validateAuthorPayload(p),p);assert.throws(()=>contract.validateAuthorPayload(p,true));
 assert.equal((await h.post({...h.body,payload:p})).status,200);
});
test('publication validates stored revision and payload, ignores caller content, and invalidates cache only after success',async()=>{
 const bad=payload();bad.form.bodyText='';const invalid=harness({stored:bad});assert.equal((await invalid.post({...invalid.body,action:'publish',revision:invalid.revision,payload:payload()})).status,400);assert.equal(invalid.calls.length,1);assert.equal(invalid.invalidations.length,0);
 const h=harness();assert.equal((await h.post({...h.body,action:'publish',revision:id()})).status,409);assert.equal(h.calls.length,1);
 assert.equal((await h.post({...h.body,action:'publish',revision:h.revision,payload:{}})).status,200);assert.equal(h.calls.at(-1).name,'edu_publish_lesson_author');assert.equal(h.calls.at(-1).args.p_actor,h.user.id);assert.equal(h.invalidations.length,1);
});
test('conflicts are actionable and unexpected SQL errors never expose private content',async()=>{
 for(const [error,status] of [[{message:'AUTHOR_CHANGED'},409],[{message:'AUTHOR_PUBLIC_CHANGED'},409],[{message:'BLOCK_FORBIDDEN'},403],[{code:'23505'},409],[{message:'customer answers / SECRET'},503]]){const h=harness({error});const r=await h.post(h.body);assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/SECRET|customer answers/);}
});
test('public drift includes changes made after the last acknowledged publication',()=>{
 const s={revision:'a',publishedRevision:'a',publishedStamp:'published',baseStamp:'before',public:{stamp:'published'}};assert.equal(contract.authorPublicChanged(s),false);assert.equal(contract.authorPublicChanged({...s,public:{stamp:'external edit'}}),true);assert.equal(contract.authorPublicChanged({...s,revision:'new draft'}),true);
});

test('large lesson reads return one body and retrieve the public copy only on request',async()=>{
 const stored=payload();stored.form.bodyText='x'.repeat(3000000);const h=harness({stored});const response=await h.get('lesson='+h.body.lessonId);const raw=await response.text();assert.ok(Buffer.byteLength(raw)<3100000);assert.equal(JSON.parse(raw).public.payload,undefined);const current=await h.get('lesson='+h.body.lessonId+'&source=public');assert.equal((await current.json()).payload.form.bodyText.length,3000000);assert.equal(h.calls.at(-1).name,'edu_lesson_author_snapshot');
});

test('backup endpoint validates payload and uses the authenticated operator without publishing',async()=>{
 const h=harness(),request={...h.body,action:'backup'};
 assert.equal((await h.post(request)).status,200);assert.equal(h.calls[0].name,'edu_save_lesson_author_recorded');assert.equal(h.calls[0].args.p_source,'backup');assert.equal(h.calls[0].args.p_actor,h.user.id);assert.equal(h.invalidations.length,0);
 assert.equal((await h.post({...request,stamp:'wrong'})).status,400);assert.equal((await h.post({...request,payload:{}})).status,400);
});

test('history validates cursor/date filters and uses only the authenticated actor',async()=>{
 const h=harness();const base='lesson='+h.body.lessonId+'&history=1';
 for(const suffix of ['&beforeAt=bad','&beforeId='+id(),'&from=2026-02-31','&from=2026-10-10&to=2026-10-01','&mode=bad','&version='+id()])assert.equal((await h.get(base+suffix)).status,400);
 assert.equal(h.calls.length,0);assert.equal((await h.get(base+'&editor=Kim&mode=all&beforeAt=2026-10-01T01:00:00Z&beforeId='+id())).status,200);
 assert.equal(h.calls[0].name,'edu_lesson_author_history');assert.equal(h.calls[0].args.p_actor,h.user.id);assert.equal(h.calls[0].args.p_editor,'Kim');
});
test('manual note and autosave source are validated before transactional storage',async()=>{
 const h=harness();for(const fields of [{saveSource:'other'},{saveNote:'x'.repeat(161)},{saveSource:'autosave',saveNote:'manual note'}])assert.equal((await h.post({...h.body,...fields})).status,400);
 assert.equal(h.calls.length,0);assert.equal((await h.post({...h.body,saveSource:'manual',saveNote:'설명 보완'})).status,200);assert.equal(h.calls[0].args.p_note,'설명 보완');assert.equal(h.calls[0].name,'edu_save_lesson_author_recorded');
});
