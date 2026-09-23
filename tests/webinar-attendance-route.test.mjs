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
test('legacy attendance remains readable but new checkins and settings writes are retired',async()=>{
 const h=harness();const response=await h.public.GET(new Request(`https://example.test/api/webinar/attendance?code=${code}`));assert.equal(response.status,200);assert.equal(h.calls[0].args.p_phase,null);
 assert.equal((await h.public.POST(req({code,phase:'first',expected:1}))).status,410);
 assert.equal((await h.admin.POST(req({code,phase:'first',expected:0,url:null,open:false}))).status,410);
 assert.equal(h.calls.length,1);
 assert.equal((await harness({authenticated:false}).public.GET(new Request(`https://example.test/api/webinar/attendance?code=${code}`))).status,401);
});
