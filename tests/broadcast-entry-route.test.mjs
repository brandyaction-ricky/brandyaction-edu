import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}}),rules=load('../lib/webinar-attendance.ts'),entry=load('../lib/broadcast-entry.ts'),errors=load('../lib/webinar-attendance-server.ts',{'./conversion-review-server':server});
const code=randomUUID(),actor=randomUUID();
function harness({enabled=true,allowed=true,url='https://www.youtube.com/watch?v=abcdefghijk',error=null}={}){
 const calls=[];const modules={'@/lib/conversion-review-server':server,'@/lib/webinar-attendance':rules,'@/lib/broadcast-entry':entry,'@/lib/webinar-attendance-server':errors,'@/lib/operator-permissions':{getOperatorUser:async()=>({id:actor,permissions:{products:allowed}})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error,data:{url}};}})}};
 return {calls,route:load('../app/go/[code]/[phase]/[channel]/[target]/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{}),admin:load('../app/api/conversion/broadcast/route.ts',modules,enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{})};
}
const context=(target='live')=>({params:Promise.resolve({code,phase:'first',channel:'organic',target})});
const req=(method='GET',headers={})=>new Request('https://example.test/go/test',{method,headers:{'user-agent':'Mozilla/5.0','sec-fetch-mode':'navigate',...headers}});
test('direct entry redirects without login or extra page; HEAD, previews and prefetch do not record and targets are validated',async()=>{
 const h=harness();const response=await h.route.GET(req(),context());assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(await response.text(),'');assert.equal(h.calls[0].args.p_record,true);assert.equal(response.headers.get('set-cookie'),null);assert.match(response.headers.get('cache-control'),/no-store/);
 await h.route.HEAD(req('HEAD'),context());await h.route.GET(req('GET',{'user-agent':'kakaotalk-scrap/1.0'}),context());await h.route.GET(req('GET',{'sec-purpose':'prefetch'}),context());assert.deepEqual(h.calls.slice(1).map(c=>c.args.p_record),[false,false,false]);
 assert.equal((await harness({url:'https://evil.test'}).route.GET(req(),context())).status,503);
 const offer=harness({url:'/classes/'+randomUUID()});assert.equal((await offer.route.GET(req(),context('offer'))).status,302);
 assert.equal((await harness({enabled:false}).route.GET(req(),context())).status,404);assert.equal((await harness({error:{message:'CONVERSION_NOT_FOUND'}}).route.GET(req(),context())).status,404);
});
test('broadcast configuration derives actor, restricts origin and validates URL and independent switches',async()=>{
 const body={code,phase:'first',url:'https://youtu.be/abcdefghijk?si=x',enabled:true,offerEnabled:false,expected:0,actor:'forged'};
 const post=(value=body,origin='https://example.test')=>new Request('https://example.test/api/conversion/broadcast',{method:'POST',headers:{origin},body:JSON.stringify(value)});
 const h=harness();assert.equal((await h.admin.POST(post())).status,200);assert.equal(h.calls[0].args.p_actor,actor);assert.equal(h.calls[0].args.p_settings.url,'https://www.youtube.com/watch?v=abcdefghijk');
 assert.equal((await h.admin.POST(post(body,'https://evil.test'))).status,403);assert.equal((await h.admin.POST(post({...body,url:null}))).status,400);assert.equal((await harness({allowed:false}).admin.POST(post())).status,403);
});
