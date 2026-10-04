import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';const source=fs.readFileSync(new URL('../app/api/platform/resource/route.ts',import.meta.url),'utf8');
function harness({active=true,scope='enrolled',signError=false,recordError=false,visible=true,user={id,role:'student'}}={}){
 const calls=[],tables={courses:{id,status:'published',metadata:{}},enrollments:active?[{id,cohort_id:id,status:'active',order_item_id:id}]:[],curriculum_lessons:{id,curriculum_weeks:{course_id:id}},lesson_contents:{resource_storage_path:'private/lesson.pdf',resource_name:'학습 자료'},order_items:{unit_price:100}};
 const db={from:table=>{const q={};for(const n of ['select','eq','gt','order'])q[n]=()=>q;const done=async()=>({data:tables[table],error:null});q.limit=done;q.single=done;q.maybeSingle=done;return q;},storage:{from:()=>({createSignedUrl:async()=>{calls.push('sign');return{data:signError?null:{signedUrl:'https://storage.test/signed'},error:signError?'private error':null};}})}};
 const mocks={'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/platform-rules':{hasLearningAccess:e=>e.status==='active'},'@/lib/product-metadata':{productResources:()=>[{id,path:'private/product.pdf',name:'자료',scope}],productDigitalSections:()=>[]},'@/lib/cohort-curriculum-server':{isLessonVisibleToCohort:async()=>visible},'@/lib/learning-usage-server':{recordLearningUsage:async(...args)=>{calls.push(args);if(recordError)throw Error('secret SQL');}}};
 const exports={};new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>mocks[n]);return{calls,get:(q=`resource=${id}&course=${id}`)=>exports.GET(new Request('https://edu.test/api/platform/resource?'+q))};
}
test('paid product and published lesson downloads record only after a signed grant and use server-selected entitlement',async()=>{
 for(const query of [`resource=${id}&course=${id}`,`lesson=${id}`]){const h=harness(),r=await h.get(query);assert.equal(r.status,303);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(h.calls[0],'sign');assert.deepEqual(h.calls[1],[{id,role:'student'},id,'material_download',id]);}
});
test('missing rights, unpublished cohort and signing failures do not count; public resources remain outside paid usage',async()=>{
 for(const[options,query,status]of [[{active:false},undefined,403],[{visible:false},`lesson=${id}`,403],[{signError:true},undefined,503],[{user:null},undefined,401]]){const h=harness(options);assert.equal((await h.get(query)).status,status);assert.ok(!h.calls.some(Array.isArray));}
 const free=harness({scope:'public',user:null});assert.equal((await free.get()).status,303);assert.deepEqual(free.calls,['sign']);
 const failure=harness({recordError:true}),r=await failure.get();assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);assert.doesNotMatch(await r.text(),/secret SQL/);
});
