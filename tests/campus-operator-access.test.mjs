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
test('direct operator entry rejects students, inactive staff and missing sessions',async()=>{
 let user;const jsx=(type,props)=>({type,props});
 const mocks={'@/features/campus/webinar/server':{readWebinar:async()=>({cohortId:'event-cohort'})},'@/features/campus/welcome/server':{readWelcome:async()=>({settings:{},resources:[]})},'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/features/campus/tour/preview':{FourSpacesPreview:'tour'},'@/features/campus/snapshot':{isCampusId:()=>true},'@/features/campus/tour/model':{campusDestinations:[{id:'study'}]}};
 const entry={};new Function('exports','require',ts.transpileModule(await readFile('features/campus/entry-user.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(entry,name=>mocks[name]);
 mocks['@/features/campus/entry-user']=entry;
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/operator/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';
 const render=()=>mod.default({searchParams:Promise.resolve({room:'welcome'})});
 try{
  for(const role of ['admin','staff']){user={id:role,role,status:'active'};const result=await render();assert.equal(result.props.review.room,'study');assert.deepEqual(result.props.snapshot.scopes,[]);assert.equal(result.props.snapshot.viewer.id,role);}
  for(const candidate of [{role:'student',status:'active'},{role:'staff',status:'suspended'}]){user=candidate;await assert.rejects(render(),/404/);}
  user=null;await assert.rejects(render(),e=>new URL(e.message.slice(9),'https://dev.example').searchParams.get('next')==='/campus/operator?room=welcome');
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('legacy welcome links show the start date to future buyers and preserve enrollment checks',async()=>{
 const built=await build({entryPoints:['features/campus/entry.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const entry=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const id='00000000-0000-4000-8000-000000000001',user={id:'buyer',role:'student',status:'active'},jsx=(type,props)=>({type,props});let calls=0;
 let enrollment={id,user_id:'buyer',course_id:'course',cohort_id:id,status:'active',access_starts_at:new Date(Date.now()+86400000).toISOString(),access_ends_at:null,revoked_at:null};
 const db={from(table){const result=()=>({data:table==='enrollments'?[enrollment]:table==='courses'?[{id:'course',title:'수업'}]:[{id,course_id:'course',name:'1기'}],error:null});const chain={select(){return this},eq(){return this},order(){return this},limit(){return this},in(){return this},is(){return this},then(resolve){return Promise.resolve(result()).then(resolve)}};return chain;}};
 const mocks={'@/lib/external-partner-url':{},'@/lib/external-partner-access':{myExternalPartnerScopes:async()=>[]},'@/features/campus/webinar/server':{readWebinar:async()=>({cohortId:'event-cohort'})},'@/features/campus/welcome/server':{readWelcome:async cohort=>{assert.equal(cohort,id);calls++;return{settings:{title:'비공개 공지'},resources:[]}}},'@/features/campus/tour/preview':{FourSpacesPreview:'tour'},'react/jsx-runtime':{jsx,jsxs:jsx},'@/features/campus/operator-access':policy,'next/link':{},'@/features/campus/ui/theme.module.css':{default:{}},'@/features/campus/ui/entry.module.css':{default:{}},'next/navigation':{notFound:()=>{throw Error('404')},redirect:path=>{throw Error('REDIRECT '+path)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/server':{createClient:async()=>db},'@/features/campus/entry':entry,'@/features/campus/snapshot':{isCampusId:()=>true}};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/enter/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';const render=()=>mod.default({searchParams:Promise.resolve({cohort:id,welcome:'1'})});
 try{const result=await render();assert.equal(result.type,'main');assert.match(JSON.stringify(result),/정규 공부방은/);assert.equal(calls,0);
 for(const patch of [{status:'refunded'},{access_ends_at:'2020-01-01T00:00:00Z'},{user_id:'another'},{revoked_at:'2020-01-01T00:00:00Z'}]){const original=enrollment;enrollment={...original,...patch};const denied=await render();assert.match(JSON.stringify(denied),/이용 가능한 수강권/);assert.equal(calls,0);enrollment=original;}
 enrollment={...enrollment,access_starts_at:new Date(Date.now()-86400000).toISOString()};
 await assert.rejects(render(),new RegExp('REDIRECT /campus/workspace\\?enrollmentId='+id+'&section=space$'));
 await assert.rejects(mod.default({searchParams:Promise.resolve({cohort:id})}),new RegExp('REDIRECT /campus/workspace\\?enrollmentId='+id+'&section=space$'));
 }finally{if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('campus entry resolves the verified enrollment before staff review or external partner access', async () => {
 const built = await build({entryPoints:['features/campus/entry.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const entry = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
 const jsx = (type,props) => ({type,props});
 let user, grants, partners, readError;
 const first = {id:id(1),user_id:id(20),course_id:id(10),cohort_id:id(3),status:'active'};
 const second = {...first,id:id(2),cohort_id:id(4)};
 const db = {from(table) {
  const source = {enrollments:grants,courses:[{id:id(10),title:'문샷',status:'published'}],
   cohorts:[{id:id(3),course_id:id(10),name:'4기'},{id:id(4),course_id:id(10),name:'5기'}]}[table];
  let rows = [...source];
  return {select(){return this;},order(){return this;},limit(){return this;},is(){return this;},
   eq(key,value){rows=rows.filter(row=>row[key]===value);return this;},
   in(key,values){rows=rows.filter(row=>values.includes(row[key]));return this;},
   then(resolve,reject){return Promise.resolve({data:rows,error:readError}).then(resolve,reject);}};
 }};
 const mocks = {'@/lib/external-partner-url':{externalPartnerUrl:()=>'/my/partner'},
  '@/lib/external-partner-access':{myExternalPartnerScopes:async()=>partners},
  '@/features/campus/welcome/server':{readWelcome:async()=>({settings:{},resources:[]})},
  '@/features/campus/tour/preview':{FourSpacesPreview:'tour'},'react/jsx-runtime':{jsx,jsxs:jsx},
  '@/features/campus/operator-access':policy,'next/link':{},'@/features/campus/ui/theme.module.css':{default:{}},
  '@/features/campus/ui/entry.module.css':{default:{}},'next/navigation':{notFound:()=>{throw Error('404');},redirect:path=>{throw Error('REDIRECT '+path);}},
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/server':{createClient:async()=>db},
  '@/features/campus/entry':entry,'@/features/campus/snapshot':{isCampusId:value=>/^[-0-9a-f]{36}$/.test(value)}};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/campus/enter/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name];});
 const before=process.env.EDU_CAMPUS_ENABLED;process.env.EDU_CAMPUS_ENABLED='true';
 const open=(query={})=>mod.default({searchParams:Promise.resolve(query)});
 const goes=(query,path)=>assert.rejects(open(query),{message:'REDIRECT '+path});
 try {
  partners=[];grants=[];
  await goes({cohort:id(3)},'/login?next='+encodeURIComponent('/campus/enter?cohort='+id(3)));
  for(const role of ['admin','staff','member']) {
   user={id:id(20),role,status:'active'};grants=[first];
   await goes({},'/campus/workspace?enrollmentId='+id(1)+'&section=space');
   grants=[second,first];
   assert.equal((await open()).type,'main');
   await goes({cohort:id(3)},'/campus/workspace?enrollmentId='+id(1)+'&section=space');
   await goes({cohort:id(4),welcome:'1'},'/campus/workspace?enrollmentId='+id(2)+'&section=space');
   grants=[{...first,access_starts_at:'2099-01-01'}];
   const waiting=await open({cohort:id(3),welcome:'1'});assert.equal(waiting.type,'main');assert.match(JSON.stringify(waiting),/정규 공부방은/);assert.doesNotMatch(JSON.stringify(waiting),/개강 준비실/);
   for(const patch of [{status:'refunded'},{access_ends_at:'2020-01-01'},{revoked_at:'2020-01-01'},{user_id:id(99)}]){
    grants=[{...first,...patch}];
    if(role==='member')assert.equal((await open()).type,'main');
    else await goes({cohort:id(3)},'/campus/operator?room=study&cohort='+id(3));
   }
   grants=[];
   if(role!=='member')await goes({cohort:id(3),welcome:'1'},'/campus/operator?room=study&cohort='+id(3));
   readError={message:'test'};
   await assert.rejects(open(),/수강권을 확인하지 못했습니다/);readError=null;
  }
  user={id:id(20),role:'member',status:'active'};grants=[first];partners=[{id:id(8),cohort_id:id(4)}];
  await goes({cohort:id(4)},'/campus/workspace?enrollmentId='+id(8)+'&section=space');
  await goes({cohort:id(3)},'/campus/workspace?enrollmentId='+id(1)+'&section=space');
  assert.equal((await open()).type, 'main');
  user = {...user,role:'student'}; grants = [];
  await goes({}, '/campus/workspace?enrollmentId='+id(8)+'&section=space');
  partners.push({id:id(7),cohort_id:id(3),course_title:'문샷',cohort_name:'4기'});
  assert.match(JSON.stringify(await open()), /4기/);
  await goes({cohort:id(3)}, '/campus/workspace?enrollmentId='+id(7)+'&section=space');
  assert.equal((await open({cohort:id(9)})).type,'main');
 } finally {if(before===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=before;}
});
test('real attendance display is enabled only by the authorized operator preview route',async()=>{
 let allowed=false,reads=0;const jsx=(type,props)=>({type,props});
 const mocks={'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{notFound:()=>{throw Error('404')}},'@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'marketing');return allowed?{id:'admin'}:null}},'@/features/campus/webinar/room':{WebinarRoom:'room'},'@/features/campus/webinar/server':{readWebinar:async()=>{reads++;return null}},'@/features/campus/webinar/domain':{projectWebinar:w=>w}};
 mocks['@/features/campus/entry-user']={campusUser:async()=>({id:'operator'})};
 const mod={};new Function('exports','require',ts.transpileModule(await readFile('app/admin/campus/preview/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name]});
 await assert.rejects(mod.default({searchParams:Promise.resolve({slug:'example'})}),/404/);assert.equal(reads,0);allowed=true;const result=await mod.default({searchParams:Promise.resolve({})});assert.equal(result.type,'room');assert.equal(result.props.operatorReview,true);
});
