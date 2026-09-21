import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}}),rules=load('../lib/recruitment-rooms.ts');
const user=randomUUID(),code=randomUUID(),free=randomUUID();
function harness({enabled=true,authenticated=true,allowed=true,error=null}={}){
 const calls=[];const modules={'@/lib/conversion-review-server':server,'@/lib/recruitment-rooms':rules,'@/lib/legal-policies':{POLICY_VERSION:'2026-08-11'},'@/lib/server-auth':{getAuthenticatedUser:async()=>authenticated?{id:user}:null},'@/lib/operator-permissions':{getOperatorUser:async()=>({id:user,permissions:{products:allowed}})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error,data:{revision:1,registered:args.p_register===true}};}})}};
 return{calls,public:load('../app/api/webinar/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{}),admin:load('../app/api/conversion/webinar/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{})};
}
const body={code,channel:'organic',agreed:true,policy:'2026-08-11',expected:1,user_id:randomUUID()};
const req=(value=body,origin='https://example.test')=>new Request('https://example.test/api/webinar',{method:'POST',headers:{origin},body:JSON.stringify(value)});
test('webinar registration validates consent and login, uses server identity and never changes marketing consent',async()=>{
 const h=harness();assert.equal((await h.public.POST(req())).status,200);assert.equal(h.calls[0].args.p_user,user);assert.equal(h.calls[0].args.p_policy,body.policy);assert.deepEqual(Object.keys(h.calls[0].args).sort(),['p_channel','p_code','p_expected','p_policy','p_register','p_user']);
 for(const bad of [{...body,agreed:false},{...body,policy:'old'},{...body,channel:'forged'},{...body,expected:0}])assert.equal((await h.public.POST(req(bad))).status,400);
 assert.equal((await h.public.POST(req(body,'https://else.test'))).status,403);assert.equal(h.calls.length,1);
 assert.equal((await harness({authenticated:false}).public.POST(req())).status,401);
 const publicRead=harness({authenticated:false});const response=await publicRead.public.GET(new Request(`https://example.test/api/webinar?code=${code}&channel=unknown`));assert.equal(response.status,200);assert.equal(publicRead.calls[0].args.p_user,null);assert.equal(publicRead.calls[0].args.p_register,false);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await harness({enabled:false}).public.POST(req())).status,404);
 assert.equal((await harness({error:{message:'CONVERSION_STALE'}}).public.POST(req())).status,409);
});
test('webinar management requires product/marketing role and sanitizes settings',async()=>{
 const payload={period:'sample',freeCourse:free,paidCohort:null,enabled:true,expected:0,actor:randomUUID()};
 const h=harness();assert.equal((await h.admin.POST(req(payload))).status,200);assert.equal(h.calls[0].args.p_actor,user);assert.deepEqual(h.calls[0].args.p_settings,{freeCourse:free,paidCohort:null,enabled:true,expected:0});
 const denied=harness({allowed:false});assert.equal((await denied.admin.POST(req(payload))).status,403);assert.equal(denied.calls.length,0);
});
