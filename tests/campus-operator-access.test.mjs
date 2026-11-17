import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const r=await build({entryPoints:['features/campus/operator-access.ts'],bundle:true,platform:'node',format:'esm',write:false});
const policy=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
test('only active database admins and staff can enter without enrollment',()=>{
 for(const role of ['admin','staff'])assert.equal(policy.canReviewCampus({role,status:'active'}),true);
 for(const user of [null,{}, {role:'student',status:'active'},{role:'admin',status:'suspended'},{role:'staff',status:'inactive'},{role:'admin'},{role:'user',status:'active',user_metadata:{role:'admin'}}])assert.equal(policy.canReviewCampus(user),false);
});
test('welcome links route staff and admins to the requested room before enrollment lookup',async()=>{
 const jsx=(type,props)=>({type,props});let user,dbCalls=0;
 const mocks={'@/features/campus/webinar/server':{readWebinar:async()=>({cohortId:'event-cohort'})},'@/features/campus/welcome/server':{readWelcome:async()=>({settings:{},resources:[]})},'@/features/campus/tour/preview':{FourSpacesPreview:()=>null},'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/link':{},'@/features/campus/ui/theme.module.css':{default:{}},'@/features/campus/ui/entry.module.css':{default:{}},'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/server':{createClient:async()=>{dbCalls++;throw Error('ENROLLMENT')}},'@/features/campus/entry':{campusEntryPath:()=>'/campus/enter'},'@/features/campus/snapshot':{isCampusId:()=>true}};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/enter/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';
 try{
  for(const role of ['admin','staff']){user={id:'operator',role,status:'active'};await assert.rejects(mod.default({searchParams:Promise.resolve({cohort:'cohort-id',welcome:'1'})}),/REDIRECT \/campus\/operator\?room=welcome&cohort=cohort-id/);}
  assert.equal(dbCalls,0);user={id:'learner',role:'student',status:'active'};await assert.rejects(mod.default({searchParams:Promise.resolve({})}),/ENROLLMENT/);assert.equal(dbCalls,1);
  user=null;await assert.rejects(mod.default({searchParams:Promise.resolve({})}),/REDIRECT \/login/);
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('direct operator entry rejects students, inactive staff and missing sessions',async()=>{
 let user, productAccess=false;const jsx=(type,props)=>({type,props});
 const mocks={'@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{assert.equal(scope,'products');assert.equal(actor,user);return actor.role==='admin'||productAccess?actor:null;}},'@/features/campus/webinar/server':{readWebinar:async()=>({cohortId:'event-cohort'})},'@/features/campus/welcome/server':{readWelcome:async()=>({settings:{},resources:[]})},'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/features/campus/tour/preview':{FourSpacesPreview:'tour'},'@/features/campus/snapshot':{isCampusId:()=>true},'@/features/campus/tour/model':{rooms:[{id:'welcome'},{id:'study'}]}};
 const entry={};new Function('exports','require',ts.transpileModule(await readFile('features/campus/entry-user.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(entry,name=>mocks[name]);
 mocks['@/features/campus/entry-user']=entry;
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/operator/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';
 const render=()=>mod.default({searchParams:Promise.resolve({room:'welcome'})});
 try{
  for(const role of ['admin','staff']){user={id:role,role,status:'active'};const result=await render();assert.equal(result.props.review.room,'welcome');assert.equal(result.props.review.studyPreview,role==='admin');assert.deepEqual(result.props.snapshot.scopes,[]);assert.equal(result.props.snapshot.viewer.id,role);}
  productAccess=true;assert.equal((await render()).props.review.studyPreview,true);
  for(const candidate of [{role:'student',status:'active'},{role:'staff',status:'suspended'}]){user=candidate;await assert.rejects(render(),/404/);}
  user=null;await assert.rejects(render(),e=>new URL(e.message.slice(9),'https://dev.example').searchParams.get('next')==='/campus/operator?room=welcome');
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('future buyer can read welcome while refunded and expired buyers cannot',async()=>{
 const built=await build({entryPoints:['features/campus/entry.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const entry=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const id='00000000-0000-4000-8000-000000000001',user={id:'buyer',role:'student',status:'active'},jsx=(type,props)=>({type,props});let calls=0;
 let enrollment={id,user_id:'buyer',course_id:'course',cohort_id:id,status:'active',access_starts_at:new Date(Date.now()+86400000).toISOString(),access_ends_at:null,revoked_at:null};
 const db={from(table){const result=()=>({data:table==='enrollments'?[enrollment]:table==='courses'?[{id:'course',title:'수업'}]:[{id,course_id:'course',name:'1기'}],error:null});const chain={select(){return this},eq(){return this},order(){return this},limit(){return this},in(){return this},is(){return this},then(resolve){return Promise.resolve(result()).then(resolve)}};return chain;}};
 const mocks={'@/features/campus/webinar/server':{readWebinar:async()=>({cohortId:'event-cohort'})},'@/features/campus/welcome/server':{readWelcome:async cohort=>{assert.equal(cohort,id);calls++;return{settings:{title:'비공개 공지'},resources:[]}}},'@/features/campus/tour/preview':{FourSpacesPreview:'tour'},'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/link':{},'@/features/campus/ui/theme.module.css':{default:{}},'@/features/campus/ui/entry.module.css':{default:{}},'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/server':{createClient:async()=>db},'@/features/campus/entry':entry,'@/features/campus/snapshot':{isCampusId:()=>true}};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/enter/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';const render=()=>mod.default({searchParams:Promise.resolve({cohort:id,welcome:'1'})});
 try{const result=await render();assert.equal(result.type,'tour');assert.equal(result.props.review.role,'waiting');assert.equal(result.props.review.room,'welcome');assert.deepEqual(result.props.snapshot.lessons,[]);assert.equal(calls,1);
 for(const patch of [{status:'refunded'},{access_ends_at:'2020-01-01T00:00:00Z'},{user_id:'another'},{revoked_at:'2020-01-01T00:00:00Z'}]){const original=enrollment;enrollment={...original,...patch};const denied=await render();assert.notEqual(denied.type,'tour');assert.equal(calls,1);enrollment=original;}
 enrollment={...enrollment,access_starts_at:new Date(Date.now()-86400000).toISOString()};
 await assert.rejects(render(),new RegExp('REDIRECT /campus/workspace\\?enrollmentId='+id+'&section=space&welcome=1'));
 await assert.rejects(mod.default({searchParams:Promise.resolve({cohort:id})}),new RegExp('REDIRECT /campus/workspace\\?enrollmentId='+id+'&section=space$'));
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('real attendance display is enabled only by the authorized operator preview route',async()=>{
 let allowed=false,reads=0;const jsx=(type,props)=>({type,props});
 const mocks={'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{notFound:()=>{throw Error('404')}},'@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'marketing');return allowed?{id:'admin'}:null}},'@/features/campus/webinar/room':{WebinarRoom:'room'},'@/features/campus/webinar/server':{readWebinar:async()=>{reads++;return null}},'@/features/campus/webinar/domain':{projectWebinar:w=>w}};
 mocks['@/features/campus/entry-user']={campusUser:async()=>({id:'operator'})};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/admin/campus/preview/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 await assert.rejects(mod.default({searchParams:Promise.resolve({slug:'example'})}),/404/);assert.equal(reads,0);allowed=true;const result=await mod.default({searchParams:Promise.resolve({})});assert.equal(result.type,'room');assert.equal(result.props.operatorReview,true);
});
