import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}}),rules=load('../lib/webinar-attendance.ts'),errors=load('../lib/webinar-attendance-server.ts',{'./conversion-review-server':server});
const user=randomUUID(),code=randomUUID();
function harness({authenticated=true,allowed=true,error=null,enabled=true}={}){
 const calls=[];const modules={'@/lib/conversion-review-server':server,'@/lib/webinar-attendance':rules,'@/lib/webinar-attendance-server':errors,'@/lib/server-auth':{getAuthenticatedUser:async()=>authenticated?{id:user}:null},'@/lib/operator-permissions':{getOperatorUser:async()=>({id:user,permissions:{products:allowed}})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error,data:{sessions:[]}};}})}};
 return{calls,public:load('../app/api/webinar/attendance/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{}),admin:load('../app/api/conversion/webinar-attendance/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{})};
}
const req=(body,origin='https://example.test')=>new Request('https://example.test/api/webinar/attendance',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('YouTube live URLs are normalized and reject other hosts, credentials, schemes and malformed ids',()=>{
 for(const url of ['https://youtu.be/abcdefghijk?t=12','https://www.youtube.com/live/abcdefghijk?si=share','https://youtube.com/watch?v=abcdefghijk&list=anything'])assert.equal(rules.youtubeLiveUrl(url),'https://www.youtube.com/watch?v=abcdefghijk');
 for(const url of ['http://youtu.be/abcdefghijk','https://youtube.com.evil.test/watch?v=abcdefghijk','https://user@youtube.com/watch?v=abcdefghijk','javascript:alert(1)','https://youtube.com/@channel/live','https://youtu.be/short'])assert.throws(()=>rules.youtubeLiveUrl(url));
 assert.equal(rules.youtubeLiveUrl(''),null);
});
test('attendance API uses authenticated identity and explicit POST; admin enforces permission and canonical URL',async()=>{
 const body={code,phase:'first',expected:1,user_id:randomUUID()};const h=harness();
 let response=await h.public.GET(new Request(`https://example.test/api/webinar/attendance?code=${code}`));assert.equal(response.status,200);assert.equal(h.calls[0].args.p_phase,null);assert.equal(response.headers.get('cache-control'),'private, no-store');
 response=await h.public.POST(req(body));assert.equal(response.status,200);assert.equal(h.calls[1].args.p_user,user);assert.equal(h.calls[1].args.p_phase,'first');
 assert.equal((await h.public.POST(req(body,'https://evil.test'))).status,403);assert.equal((await h.public.POST(req({...body,phase:'other'}))).status,400);assert.equal(h.calls.length,2);
 assert.equal((await harness({authenticated:false}).public.POST(req(body))).status,401);assert.equal((await harness({enabled:false}).public.POST(req(body))).status,404);
 assert.equal((await harness({error:{message:'ATTENDANCE_CLOSED'}}).public.POST(req(body))).status,409);
 const settings={...body,expected:0,url:'https://youtu.be/abcdefghijk?si=x',open:true,actor:randomUUID()};assert.equal((await h.admin.POST(req(settings))).status,200);assert.equal(h.calls[2].args.p_actor,user);assert.equal(h.calls[2].args.p_settings.url,'https://www.youtube.com/watch?v=abcdefghijk');
 const denied=harness({allowed:false});assert.equal((await denied.admin.POST(req(settings))).status,403);assert.equal(denied.calls.length,0);
 assert.equal((await h.admin.POST(req({...settings,url:null}))).status,400);
});
