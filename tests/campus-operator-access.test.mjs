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
 const mocks={'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/link':{},'@/features/campus/ui/theme.module.css':{},'@/features/campus/ui/entry.module.css':{},'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/server':{createClient:async()=>{dbCalls++;throw Error('ENROLLMENT')}},'@/features/campus/entry':{campusEntryPath:()=>'/campus/enter'},'@/features/campus/snapshot':{isCampusId:()=>true}};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/enter/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';
 try{
  for(const role of ['admin','staff']){user={id:'operator',role,status:'active'};await assert.rejects(mod.default({searchParams:Promise.resolve({cohort:'cohort-id',welcome:'1'})}),/REDIRECT \/campus\/operator\?room=welcome&cohort=cohort-id/);}
  assert.equal(dbCalls,0);user={id:'learner',role:'student',status:'active'};await assert.rejects(mod.default({searchParams:Promise.resolve({})}),/ENROLLMENT/);assert.equal(dbCalls,1);
  user=null;await assert.rejects(mod.default({searchParams:Promise.resolve({})}),/REDIRECT \/login/);
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('direct operator entry rejects students, inactive staff and missing sessions',async()=>{
 let user;const jsx=(type,props)=>({type,props});
 const mocks={'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/features/campus/tour/preview':{FourSpacesPreview:'tour'},'@/features/campus/snapshot':{isCampusId:()=>true},'@/features/campus/tour/model':{rooms:[{id:'welcome'},{id:'study'}]}};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/operator/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';
 const render=()=>mod.default({searchParams:Promise.resolve({room:'welcome'})});
 try{
  for(const role of ['admin','staff']){user={id:role,role,status:'active'};const result=await render();assert.equal(result.props.review.room,'welcome');assert.deepEqual(result.props.snapshot.scopes,[]);assert.equal(result.props.snapshot.viewer.id,role);}
  for(const candidate of [{role:'student',status:'active'},{role:'staff',status:'suspended'}]){user=candidate;await assert.rejects(render(),/404/);}
  user=null;await assert.rejects(render(),/REDIRECT \/login/);
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
