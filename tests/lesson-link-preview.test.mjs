import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import * as net from 'node:net';
import * as parse5 from 'parse5';
function load(file,mocks){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(name in mocks,name);return mocks[name];});return exports;}
const rules=load('lib/lesson-link-preview.ts',{'node:dns/promises':dns,'node:https':https,'node:net':net,parse5});
function network(pages=[{}],addresses=['93.184.215.14']){
 const calls=[],names=[];let destroyed=0;
 return{calls,names,get destroyed(){return destroyed;},resolve:async host=>{names.push(host);return addresses.map(address=>({address,family:net.isIP(address)}));},send:(options,callback)=>{
  calls.push(options);const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const data=pages[Math.min(calls.length-1,pages.length-1)],res=new PassThrough();res.on('close',()=>destroyed++);res.statusCode=data.status??200;res.headers=data.headers??{'content-type':'text/html'};callback(res);res.end(data.html??'<title>시험 제목</title>');});return req;
 }};
}
test('preview blocks local IP ranges, mapped addresses, unsafe schemes, credentials and non-web ports',()=>{
 for(const ip of ['0.0.0.0','10.1.2.3','100.64.0.1','127.0.0.1','169.254.169.254','172.16.1.2','192.168.1.2','192.0.2.1','198.18.1.1','198.51.100.1','203.0.113.1','224.1.2.3','255.255.255.255','::1','::','::ffff:127.0.0.1','::ffff:8.8.8.8','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(rules.publicPreviewAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','93.184.215.14','2606:4700::1111'])assert.equal(rules.publicPreviewAddress(ip),true,ip);
 for(const url of ['http://example.com','file:///etc/passwd','https://user:pass@example.com','https://localhost','https://name.local','https://127.1','https://0x7f000001','https://[::1]','https://example.com:8443','https://example.com.'])assert.throws(()=>rules.previewUrl(url),undefined,url);
 assert.equal(rules.previewUrl('https://example.com/a?q=x#part').href,'https://example.com/a?q=x');
});
test('metadata parsing decodes entities, prioritizes OG and produces bounded plain text',()=>{
 assert.equal(rules.previewTitle('<title>기본</title><meta content="제목 &amp; 설명 &lt;tag&gt;" property="og:title">'),'제목 & 설명 <tag>');
 assert.equal(rules.previewTitle('<title> 첫째\n 둘째 </title>'),'첫째 둘째');assert.equal(rules.previewTitle('<p>본문</p>'),'');assert.equal(rules.previewTitle('<title>'+'a'.repeat(500)+'</title>').length,200);
});
test('validated addresses are pinned, TLS/Host preserve the original host, and request carries no user credentials',async()=>{
 const n=network();assert.deepEqual(await rules.readLinkPreview('https://example.com/guide?lang=ko#one',n),{title:'시험 제목',domain:'example.com'});
 assert.equal(n.calls.length,1);const options=n.calls[0];assert.equal(options.hostname,'93.184.215.14');assert.equal(options.servername,'example.com');assert.equal(options.headers.Host,'example.com');assert.equal(options.path,'/guide?lang=ko');assert.equal(options.agent,false);assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);assert.equal(options.rejectUnauthorized,undefined);assert.equal(options.port,443);
});
test('every redirect is validated again and mixed public/private DNS answers fail closed',async()=>{
 for(const addresses of [['127.0.0.1'],['93.184.215.14','10.0.0.1'],[]]){const n=network([{}],addresses);await assert.rejects(rules.readLinkPreview('https://example.com',n),/PREVIEW_ADDRESS/);assert.equal(n.calls.length,0);}
 for(const location of ['https://127.0.0.1','http://example.com','https://user:pass@example.com','https://example.local']){const n=network([{status:302,headers:{location}}]);await assert.rejects(rules.readLinkPreview('https://example.com',n));assert.equal(n.calls.length,1);}
 const next=network([{status:302,headers:{location:'https://other.example.com/path'}},{html:'<title>리디렉션 제목</title>'}]);assert.equal((await rules.readLinkPreview('https://example.com',next)).title,'리디렉션 제목');assert.deepEqual(next.names,['example.com','other.example.com']);assert.equal(next.calls[1].servername,'other.example.com');
 const loop=network([{status:302,headers:{location:'/loop'}}]);await assert.rejects(rules.readLinkPreview('https://example.com',loop),/PREVIEW_REDIRECTS/);assert.equal(loop.calls.length,4);
});
test('non-HTML, compressed, oversized and failed responses are rejected',async()=>{
 for(const data of [{status:500},{headers:{'content-type':'image/png'}},{headers:{'content-type':'text/html','content-encoding':'gzip'}},{headers:{'content-type':'text/html','content-length':'999999'}},{html:'x'.repeat(524289)}])await assert.rejects(rules.readLinkPreview('https://example.com',network([data])),/PREVIEW_/);
});
function api({user={id:'actor'},allowed=true,fail=false}={}){
 const calls=[];const route=load('app/api/admin/link-preview/route.ts',{'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async(scope)=>{assert.equal(scope,'products');return allowed;}},'@/lib/lesson-link-preview':{previewUrl:rules.previewUrl,readLinkPreview:async url=>{calls.push(url);if(fail)throw Error('sensitive network detail');return{title:'시험 제목',domain:'example.com'};}}});
 return{calls,get:(url='https://example.com')=>route.GET(new Request('https://edu.example/api/admin/link-preview?'+new URLSearchParams({url})))};
}
test('preview API checks auth/feature/scope, limits calls and hides fetch details',async()=>{
 process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';
 for(const [options,status]of[[{user:null},401],[{allowed:false},403]]){const h=api(options);assert.equal((await h.get()).status,status);assert.equal(h.calls.length,0);}
 const h=api();assert.equal((await h.get('http://example.com')).status,400);assert.equal(h.calls.length,0);
 process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='false';assert.equal((await h.get()).status,404);process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';
 for(let i=0;i<20;i++){const result=await h.get();assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');}assert.equal((await h.get()).status,429);assert.equal(h.calls.length,20);
 const result=await api({fail:true}).get();assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/sensitive network/);
});
