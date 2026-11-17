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

test('campus entry loads only for enabled member pages and preserves existing public and disabled route output',async()=>{
 const {readFile}=await import('node:fs/promises'),{default:ts}=await import('typescript');
 const jsx=(type,props)=>({type,props}),imports=[];
 let privateRelease=false;const mocks={'@/features/campus/private-release':{campusPrivateRelease:()=>privateRelease},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'@/lib/course-catalog':{},'@/lib/edu-settings':{},'react':{cache:f=>f},'@/lib/edu-seo':{EDU_SITE_NAME:'브랜디에듀',seoText:()=>''},'@/lib/supabase/server':{createClient:async()=>({from:()=>({select(){return this},eq(){return this},async maybeSingle(){return {data:null}}})})},'@/app/ui/platform':{Platform:'platform'},'next/navigation':{notFound:()=>{throw Error('404');}},'@/lib/landing-admin-state':{},'@/lib/platform':{sections:[]},'next/headers':{},'@/lib/product-sharing':{},'@/lib/legal-policies':{isPolicyPath:()=>false},'@/features/campus/ui/entry-bar':{CampusEntryBar:'campus-entry'},'@/features/campus/space/lesson-focus':{LessonFocus:'focus'}};
 const output={};new Function('exports','require',ts.transpileModule(await readFile('app/[[...path]]/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(output,name=>{assert.ok(name in mocks,name);imports.push(name);return mocks[name];});
 const original=process.env.EDU_CAMPUS_ENABLED,space=process.env.EDU_CAMPUS_SPACE_ENABLED;
 const render=path=>output.default({params:Promise.resolve({path}),searchParams:Promise.resolve({})});
 try{
  process.env.EDU_CAMPUS_ENABLED='false';assert.equal((await render(['my','classes'])).type,'platform');assert.ok(!imports.includes('@/features/campus/ui/entry-bar'));
  process.env.EDU_CAMPUS_ENABLED='true';process.env.EDU_CAMPUS_SPACE_ENABLED='true';assert.equal((await render(['classes','moonshot'])).type,'platform');assert.ok(!imports.includes('@/features/campus/ui/entry-bar'));
  const my=await render(['my','classes']);assert.deepEqual(my.props.children.filter(Boolean).map(c=>c.type),['campus-entry','platform']);
  privateRelease=true;assert.equal((await render(['my','classes'])).type,'platform');assert.equal((await render(['learn',id(1),id(2)])).type,'platform');
  // While private, a lesson opened from inside the campus still gets the way back (and only the way back).
  const back=await output.default({params:Promise.resolve({path:['learn',id(1),id(2)]}),searchParams:Promise.resolve({campusReturn:'/campus/workspace?enrollmentId='+id(1)+'&room=study'})});
  const bar=back.props.children.filter(Boolean)[0];assert.equal(bar.type,'campus-entry');assert.equal(bar.props.backOnly,true);
  assert.equal((await output.default({params:Promise.resolve({path:['learn',id(1),id(2)]}),searchParams:Promise.resolve({campusReturn:'https://evil.example/'})})).type,'platform');privateRelease=false;
  const lesson=await render(['learn',id(1),id(2)]);assert.deepEqual(lesson.props.children.filter(Boolean).map(c=>c.type),['campus-entry','platform','focus']);
 }finally{if(original===undefined)delete process.env.EDU_CAMPUS_ENABLED;else process.env.EDU_CAMPUS_ENABLED=original;if(space===undefined)delete process.env.EDU_CAMPUS_SPACE_ENABLED;else process.env.EDU_CAMPUS_SPACE_ENABLED=space;}
});
