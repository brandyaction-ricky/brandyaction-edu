import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}}),rules=load('../lib/recruitment-rooms.ts'),html=load('../lib/recruitment-join.ts');
const id=randomUUID(),actor=randomUUID(),event=randomUUID();
function harness(enabled=true,allowed=true,error=null){
 const calls=[];
 const modules={'@/lib/conversion-review-server':server,'@/lib/recruitment-rooms':rules,'@/lib/recruitment-join':html,'node:crypto':{randomUUID},'@/lib/landing':{isTestRequest:cookie=>cookie==='test'},'@/lib/operator-permissions':{getOperatorUser:async()=>({id:actor,permissions:{products:allowed}})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error,data:{label:'<script>unsafe</script>',url:'https://open.kakao.com/o/synthetic',version:1}};}})}};
 return{calls,admin:load('../app/api/conversion/links/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{}),public:load('../app/join/[id]/[channel]/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{})};
}
const context={params:Promise.resolve({id,channel:'paid'})};
const req=(method='GET',extra={})=>new Request('https://example.test/join/'+id+'/paid',method==='GET'?{}:{method,headers:{origin:'https://example.test',...extra},body:new URLSearchParams({event,version:'1'})});
test('public GET never records; POST redirects only to DB destination and test mode suppresses recording',async()=>{
 const h=harness();const read=await h.public.GET(req(),context);assert.equal(read.status,200);assert.equal(h.calls[0].args.p_event,null);assert.match(await read.text(),/&lt;script&gt;/);assert.match(read.headers.get('cache-control'),/no-store/);
 const post=await h.public.POST(req('POST'),context);assert.equal(post.status,303);assert.equal(post.headers.get('location'),'https://open.kakao.com/o/synthetic');assert.equal(h.calls[1].args.p_event,event);
 await h.public.POST(req('POST',{cookie:'test'}),context);assert.equal(h.calls[2].args.p_event,null);
 assert.equal((await h.public.POST(req('POST',{origin:'https://evil.test'}),context)).status,403);assert.equal(h.calls.length,3);
 assert.equal((await harness(false).public.GET(req(),context)).status,404);
 assert.equal((await harness(true,true,{message:'CONVERSION_NOT_FOUND'}).public.GET(req(),context)).status,404);
 assert.equal((await harness(true,true,{message:'CONVERSION_STALE'}).public.POST(req('POST'),context)).status,409);
});
test('link management checks role, origin, versions and derives actor server-side',async()=>{
 const request=body=>new Request('https://example.test/api/conversion/links',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify(body)});
 const body={period:'sample',version:1,expected:0,enabled:true,actor_id:randomUUID()};
 const h=harness();assert.equal((await h.admin.POST(request(body))).status,200);assert.equal(h.calls[0].args.p_actor,actor);
 assert.equal((await h.admin.POST(request({...body,expected:-1}))).status,400);
 for(const [enabled,allowed,status] of [[false,true,404],[true,false,403]]){const x=harness(enabled,allowed);assert.equal((await x.admin.POST(request(body))).status,status);assert.equal(x.calls.length,0);}
});
