import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}}), rules=load('../lib/recruitment-rooms.ts');
const actor=randomUUID();
const input={period:'sample-4',expected_version:0,requestId:randomUUID(),settings:{label:'Sample',organicUrl:'https://open.kakao.com/o/organic',paidUrl:'https://open.kakao.com/o/paid',paidMode:'undecided'}};
const request=(body=input,origin='https://example.test')=>new Request('https://example.test/api/conversion/rooms',{method:'POST',headers:{origin},body:JSON.stringify(body)});
function harness(enabled=true,allowed=true,error=null){
 const calls=[];
 const query={select(){return this;},eq(key,value){calls.push({key,value});return this;},order(){return this;},limit(){return this;},async maybeSingle(){return{data:null,error};}};
 const route=load('../app/api/conversion/rooms/route.ts',{'@/lib/conversion-review-server':server,'@/lib/recruitment-rooms':rules,'@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'marketing');return{id:actor,permissions:{products:allowed}};}},'@/lib/supabase/admin':{createAdminClient:()=>({from(){calls.push('read');return query;},async rpc(name,args){calls.push({name,args});return{data:{period_id:input.period,version:1,settings:input.settings,actor_id:actor,request_id:input.requestId},error};}})}},enabled?{EDU_CONVERSION_REVIEW_ENABLED:'true'}:{});
 return{...route,calls};
}
test('room routes gate access before DB and validate origin, period and destinations',async()=>{
 for(const [enabled,allowed,status] of [[false,true,404],[true,false,403]]){const h=harness(enabled,allowed);assert.equal((await h.GET(new Request('https://example.test/api/conversion/rooms?period=sample'))).status,status);assert.equal((await h.POST(request())).status,status);assert.deepEqual(h.calls,[]);}
 const h=harness();assert.equal((await h.POST(request(input,'https://else.test'))).status,403);assert.equal((await h.POST(request({...input,settings:{...input.settings,paidUrl:'javascript:evil'}}))).status,400);assert.equal((await h.GET(new Request('https://example.test/api/conversion/rooms?period=../bad'))).status,400);assert.deepEqual(h.calls,[]);
});
test('room save derives actor, removes audit fields and propagates stale conflict',async()=>{
 const h=harness();const response=await h.POST(request({...input,actor_id:randomUUID()}));assert.equal(response.status,200);assert.equal(h.calls[0].args.p_actor,actor);const result=await response.json();assert.equal('actor_id' in result.draft,false);assert.equal('request_id' in result.draft,false);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await harness(true,true,{message:'CONVERSION_STALE'}).POST(request())).status,409);
});
