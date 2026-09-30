import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function harness({allowed=true,error=null}={}){
 const calls=[],filters=[];const query={select(){return this;},eq(...args){filters.push(args);return this;},order(){return this;},range:async()=>({data:[],error})};
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{id},error};},from:()=>query};
 const mocks={'@/lib/server-auth':{getAuthenticatedUser:async()=>allowed?{id}:null},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/supabase/server':{createClient:async()=>db}};
 const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../app/api/platform/lesson-questions/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]);
 const body={enrollmentId:id,lessonId:other,requestId:id,title:'제목',content:'내용'};
 return {calls,filters,body,post:(value=body,origin='https://edu.test')=>exports.POST(new Request('https://edu.test/api/platform/lesson-questions',{method:'POST',headers:origin?{origin,'content-type':'application/json'}:{},body:JSON.stringify(value)})),get:(extra='')=>exports.GET(new Request(`https://edu.test/api/platform/lesson-questions?enrollment=${id}&lesson=${other}${extra}`))};
}
test('question endpoint requires sign-in and exact origin, ignores forged identity and course',async()=>{
 const h=harness();for(const origin of [null,'https://evil.test'])assert.equal((await h.post(undefined,origin)).status,403);assert.equal(h.calls.length,0);
 const denied=harness({allowed:false});assert.equal((await denied.post()).status,401);assert.equal((await denied.get()).status,401);
 assert.equal((await h.post({...h.body,userId:other,courseId:other})).status,200);assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.calls[0].args.p_course,undefined);
});
test('question inputs are bounded, reads are owner-scoped and failures never expose database detail',async()=>{
 const h=harness();for(const value of [null,{}, {...h.body,title:' '},{...h.body,content:'x'.repeat(10001)}])assert.equal((await h.post(value)).status,400);
 assert.equal(h.calls.length,0);const result=await h.get();assert.equal(result.headers.get('cache-control'),'private, no-store');assert.deepEqual(h.filters,[['user_id',id],['enrollment_id',id],['lesson_id',other],['is_archived',false]]);
 assert.equal((await h.get('&page=-1')).status,400);
 const fail=harness({error:{message:'database SECRET'}});const response=await fail.post();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('SECRET'));
});

test('enabled images accept an image-only body, pass only server-validated image IDs and reject disabled or invalid attachments',async()=>{
 const h=harness();assert.equal((await h.post({...h.body,imageId:id})).status,400);
 process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED='true';
 try{assert.equal((await h.post({...h.body,content:'',imageId:id})).status,200);assert.equal(h.calls[0].name,'edu_create_lesson_question_with_image');assert.equal(h.calls[0].args.p_image,id);assert.equal(h.calls[0].args.p_content,'');
 assert.equal((await h.post({...h.body,content:'',imageId:null})).status,400);assert.equal((await h.post({...h.body,imageId:'https://evil.test/a.png'})).status,400);
 }finally{delete process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED;}
});
