import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { buildSync } from 'esbuild';
const root=new URL('../',import.meta.url),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bundle=buildSync({entryPoints:[new URL('../lib/lesson-qa.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const qaModule={exports:{}};new Function('module','exports','require',bundle)(qaModule,qaModule.exports,()=>{throw Error('Unexpected runtime import');});
const qa=qaModule.exports;
const payload={form:{basic:{week_id:id(3),day_number:'1',title:'시험 학습',description:'',duration_label:'',is_published:true,is_preview:false},format:'text',bodyText:'',videoUrl:'',externalUrl:'',resourcePath:'',resourceName:''},blocks:{active:true,document:{schemaVersion:1,blocks:[{id:'intro',type:'text',content:'설명 단락'},{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'one',prompt:'질문',options:['가','나'],correctIndex:1}]}}],checklist:[]}}};
function load(file,deps){const code=ts.transpileModule(fs.readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};new Function('exports','require',code)(exports,k=>{assert.ok(deps[k],k);return deps[k];});return exports;}
const uuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);
const hub=load('lib/question-hub-server.ts',{'./edu-workflows':{uuid}});
function harness({permission=true,members=true,enabled=false,error=null,owner=id(9),digest='3'.repeat(32),invalidPayload=false,sourcePayload=payload}={}){
 const calls=[];let cache=0;
 const db={rpc:async(name,args)=>{calls.push({name,args});return{error,data:name==='edu_read_lesson_qa'?{lessonId:id(4),questionStamp:'1'.repeat(32),publicStamp:'2'.repeat(32),cohortStamp:'5'.repeat(32),authorHead:null,payload:sourcePayload,cohorts:[{id:id(5),name:'시험 기수'}],draftPending:false,applied:false}:{id:id(2),digest,title:'질문',answer:'답변',published:true}};},from(table){assert.equal(table,'edu_lesson_qa_plans');const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:{payload:invalidPayload?{}:payload,created_by:owner,digest},error})};return q;}};
 const api=load('app/api/admin/questions/lesson-qa/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/operator-permissions':{getOperatorUser:async()=>permission?{id:id(9),permissions:{members}}:null},'@/lib/edu-workflows':{uuid},'@/lib/question-hub-server':hub,'@/lib/lesson-qa':qa,'@/lib/lesson-author-drafts':{validateAuthorPayload:v=>{assert.ok(v.form,'Invalid payload');return v;}},'next/cache':{revalidateTag:()=>cache++},'@/lib/public-platform-plan':{PUBLIC_CACHE_TAG:'public-fixture'}});
 const env=()=>{if(enabled)process.env.EDU_LESSON_QA_PUBLICATION_ENABLED='true';else delete process.env.EDU_LESSON_QA_PUBLICATION_ENABLED;};
 return {calls,cache:()=>cache,get:async(q=id(1))=>{env();return api.GET(new Request('https://qa.example/api/admin/questions/lesson-qa?question='+q));},post:async(body,origin='https://qa.example')=>{env();return api.POST(new Request('https://qa.example/api/admin/questions/lesson-qa',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));}};
}
const prepare={action:'prepare',questionId:id(1),requestId:id(2),questionStamp:'1'.repeat(32),publicStamp:'2'.repeat(32),cohortStamp:'5'.repeat(32),authorHead:null,blockId:'intro',node:-1,title:'질문',answer:'답변'};
const approve={action:'approve',planId:id(2),digest:'3'.repeat(32),privacyReviewed:true,allCohortsReviewed:true};
test('both operator scopes and same-origin writes are required before opening QA RPCs',async()=>{
 for(const options of [{permission:false},{members:false}]){const h=harness(options);assert.equal((await h.get()).status,403);assert.equal((await h.post(prepare)).status,403);assert.equal(h.calls.length,0);}
 const h=harness();assert.equal((await h.post(prepare,'https://other.example')).status,403);assert.equal(h.calls.length,0);
});
test('readonly source exports anchors and scope only, never full curriculum quiz keys or private question bodies',async()=>{
 const r=await harness().get();assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.anchors,[{blockId:'intro',node:-1,label:'설명 단락'}]);assert.equal(data.canPublish,false);assert.equal(data.payload,undefined);assert.equal(r.headers.get('Vary'),'Cookie');assert.match(r.headers.get('Cache-Control'),/no-store/);
});
test('invalid hashes, anchors and private contact/path text fail without persisting a review',async()=>{
 for(const extra of [{questionStamp:['1'.repeat(32)]},{node:1.5},{authorHead:'bad'},{title:'person@example.test'},{answer:'010-1234-5678'},{answer:'/Users/Private/folder'}]){const h=harness();assert.equal((await h.post({...prepare,...extra})).status,400);assert.equal(h.calls.length,0);}
 assert.equal((await harness().get('bad')).status,400);
});
test('prepare persists an exact candidate without publishing; explicit feature and both attestations gate publication',async()=>{
 const h=harness();assert.equal((await h.post(prepare)).status,200);assert.equal(h.calls[0].name,'edu_prepare_lesson_qa');assert.equal((await h.post(approve)).status,409);assert.equal(h.calls.length,1);
 for(const extra of [{privacyReviewed:false},{allCohortsReviewed:false},{digest:['3'.repeat(32)]}]){const a=harness({enabled:true});assert.equal((await a.post({...approve,...extra})).status,400);assert.equal(a.calls.length,0);}
});
test('only the exact owner and digest of a valid saved payload can publish; cache invalidation follows success',async()=>{
 for(const options of [{owner:id(8)},{digest:'4'.repeat(32)},{invalidPayload:true}]){const h=harness({enabled:true,...options});assert.ok([400,409].includes((await h.post(approve)).status));assert.equal(h.calls.length,0);assert.equal(h.cache(),0);}
 const h=harness({enabled:true});assert.equal((await h.post(approve)).status,200);assert.deepEqual(h.calls,[{name:'edu_apply_lesson_qa',args:{p_actor:id(9),p_plan:id(2),p_digest:'3'.repeat(32)}}]);assert.equal(h.cache(),1);
});
test('SQL conflicts stay actionable and internal DB details stay private',async()=>{
 const r=await harness({error:{message:'QA_CHANGED'}}).post(prepare);assert.equal(r.status,409);assert.match((await r.json()).error,/버전/);
 const bad=await harness({error:{message:'private DB credentials detail'}}).get();assert.equal(bad.status,503);assert.doesNotMatch(await bad.text(),/credentials/);
});

test('legacy, empty, quiz-only and blank text sources explain the unsupported state without prepare RPCs',async()=>{
 const legacy=structuredClone(payload);legacy.blocks.active=false;legacy.form.bodyText='기존 본문';
 const empty=structuredClone(payload);empty.blocks.document.blocks=[];
 const quizOnly=structuredClone(payload);quizOnly.blocks.document.blocks=quizOnly.blocks.document.blocks.filter(b=>b.type==='quiz');
 const blank=structuredClone(payload);blank.blocks.document.blocks=[{id:'blank',type:'text',content:'  '}];
 for(const [sourcePayload,pattern] of [[legacy,/기존 본문 형식/],[empty,/설명 위치/],[quizOnly,/설명 위치/],[blank,/설명 위치/]]){
  const h=harness({sourcePayload}),r=await h.get();assert.equal(r.status,422);const data=await r.json();assert.equal(data.code,'QA_LESSON_UNAVAILABLE');assert.match(data.error,pattern);assert.doesNotMatch(data.error,/연결을 확인/);assert.deepEqual(h.calls.map(c=>c.name),['edu_read_lesson_qa']);assert.equal(r.headers.get('Vary'),'Cookie');assert.match(r.headers.get('Cache-Control'),/no-store/);
 }
});
test('unexpected source errors and forged semantic DB errors remain sanitized 503 responses',async()=>{
 for(const options of [{sourcePayload:{}},{error:{message:'QA_LESSON_UNAVAILABLE',code:'QA_LESSON_UNAVAILABLE'}},{error:{message:'private credentials detail'}}]){
  const h=harness(options),r=await h.get();assert.equal(r.status,503);const text=await r.text();assert.match(text,/연결/);assert.doesNotMatch(text,/credentials|QA_LESSON_UNAVAILABLE|TypeError/);assert.deepEqual(h.calls.map(c=>c.name),['edu_read_lesson_qa']);
 }
});

function uiHarness(responses){
 const slots=[],requests=[];let cursor=0,tree,component;
 const state=initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];};
 const ref=initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];};
 const jsx=(type,props)=>({type,props:props||{}});
 component=load('app/ui/final/lesson-qa-review.tsx',{'react':{useState:state,useRef:ref},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'./question-composer':{questionRequest:async(...args)=>{requests.push(args);const response=responses.shift();if(response instanceof Error)throw response;return typeof response==='function'?response():response;}},'@/lib/lesson-qa':qa,'./lesson-text':{LessonText:()=>null}}).LessonQaReview;
 function render(){cursor=0;tree=component({questionId:id(1),locked:false,onChanged(){},onDirtyChange(){},onBusyChange(){}});return tree;}
 function nodes(node){if(!arguments.length)node=tree;if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n));return[node,...nodes(node.props?.children)];}
 function text(node){if(!arguments.length)node=tree;if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'?text(node.props?.children):String(node);}
 const button=label=>nodes().find(n=>n.type==='button'&&text(n)===label);
 async function flush(){await new Promise(resolve=>setImmediate(resolve));render();}
 async function click(label){const b=button(label);assert.ok(b,label);assert.equal(Boolean(b.props.disabled),false,label);b.props.onClick();await flush();}
 function fill(type,value){const n=nodes().find(n=>n.type===type);assert.ok(n,type);n.props.onChange({target:{value}});render();}
 render();return{render,nodes,text,button,click,flush,fill,requests};
}
const uiSource={lessonId:id(4),lessonTitle:'시험 수업',questionStamp:'1'.repeat(32),publicStamp:'2'.repeat(32),cohortStamp:'5'.repeat(32),authorHead:null,draftPending:false,applied:false,cohorts:[],anchors:[{blockId:'intro',node:-1,label:'설명 단락'}],canPublish:false};
test('empty-anchor UI gives explicit guidance and does not offer prepare',async()=>{
 const h=uiHarness([{...uiSource,anchors:[]}]);await h.click('삽입 위치 확인');assert.match(h.text(),/넣을 수 있는 설명 위치가 없습니다/);assert.equal(h.button('검토본 고정·미리보기'),undefined);assert.equal(h.nodes().some(n=>n.type==='select'),false);assert.equal(h.requests.length,1);
});
test('a failed reload clears the previous source and selected anchor before it can be prepared',async()=>{
 let rejectLoad;const pending=new Promise((_,reject)=>{rejectLoad=reject;});
 const h=uiHarness([uiSource,()=>pending]);await h.click('삽입 위치 확인');h.fill('select','0');h.fill('input','질문');h.fill('textarea','답변');assert.equal(Boolean(h.button('검토본 고정·미리보기').props.disabled),false);
 h.button('최신 공개본 다시 확인').props.onClick();h.render();assert.equal(h.button('검토본 고정·미리보기'),undefined);assert.equal(h.nodes().some(n=>n.type==='select'),false);
 rejectLoad(Object.assign(new Error('이 수업은 기존 본문 형식이라 아직 지원하지 않습니다.'),{status:422}));await h.flush();assert.match(h.text(),/기존 본문 형식/);assert.equal(h.button('검토본 고정·미리보기'),undefined);assert.equal(h.requests.length,2);assert.ok(h.requests.every(args=>args.length===1));
});
test('normal anchors still select and prepare the same candidate with publication gated off',async()=>{
 const h=uiHarness([uiSource,{id:id(2),digest:'3'.repeat(32),title:'질문',answer:'답변',applied:false}]);await h.click('삽입 위치 확인');assert.equal(h.button('검토본 고정·미리보기').props.disabled,true);h.fill('select','0');h.fill('input','질문');h.fill('textarea','답변');await h.click('검토본 고정·미리보기');assert.equal(h.requests[1][1].action,'prepare');assert.equal(h.requests[1][1].blockId,'intro');assert.equal(h.requests[1][1].node,-1);assert.match(h.text(),/실제 답변과 수업은 아직 바뀌지 않았습니다/);assert.match(h.text(),/별도 승인/);assert.equal(h.button('이 검토본 승인·답변과 수업 반영'),undefined);
});
