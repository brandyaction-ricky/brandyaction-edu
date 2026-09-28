import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const compiled=ts.transpileModule(fs.readFileSync(new URL('../app/api/member/messages/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({user={id},enabled=true,error=null,authError=null}={}){
 const calls=[],exports={};
 new Function('exports','require','process',compiled)(exports,name=>({
  '@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)},
  '@/lib/server-auth':{getAuthenticatedUser:async()=>{if(authError)throw authError;return user;}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{rows:[],unreadCount:0,canSendToMembers:false},error};}})},
 }[name]),{env:{NEXT_PUBLIC_EDU_MESSAGES_ENABLED:enabled?'true':'false'}});
 const get=(q={})=>exports.GET(new Request('https://edu.test/api/member/messages?'+new URLSearchParams(q)));
 const post=(body,origin='https://edu.test')=>exports.POST(new Request('https://edu.test/api/member/messages',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}));
 return{calls,get,post,send:{action:'send',requestId:id,content:'안녕하세요',recipients:[other]}};
}
test('off flag and missing login never access service messages',async()=>{
 for(const [options,status] of [[{enabled:false},404],[{user:null},401]]){const h=harness(options);assert.equal((await h.get()).status,status);assert.equal((await h.post(h.send)).status,status);assert.equal(h.calls.length,0);}
});
test('actor comes only from server auth and send is one atomic RPC with normalized recipient IDs',async()=>{
 const h=harness(),r=await h.post({...h.send,actor:other,senderId:other,recipients:[other,id,other]});assert.equal(r.status,200);
 assert.deepEqual(h.calls[0],{name:'edu_send_member_message',args:{p_actor:id,p_request:id,p_content:'안녕하세요',p_recipients:[id,other],p_reply:null,p_ongoing:null}});
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');
});
test('cross-origin, malformed, oversized, unsupported and invalid sends cannot reach DB',async()=>{
 const h=harness();assert.equal((await h.post(h.send,'https://attacker.test')).status,403);
 for(const body of ['{',null,[],{...h.send,content:''},{...h.send,content:' '.repeat(8)},{...h.send,content:'x'.repeat(5001)},{...h.send,recipients:Array(101).fill(id)},{...h.send,recipients:['forged']},{...h.send,requestId:'bad'},{...h.send,replyTo:id},{...h.send,ongoingLesson:'bad'},{...h.send,action:'delete'}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post('x'.repeat(40001))).status,413);assert.equal(h.calls.length,0);
});
test('read acknowledges only the supplied message and mentor inquiry sends no caller-selected recipient',async()=>{
 const h=harness();await h.post({action:'read',messageId:other,actor:other});assert.deepEqual(h.calls[0],{name:'edu_mark_member_message_read',args:{p_actor:id,p_message:other}});
 await h.post({...h.send,recipients:[],replyTo:other});assert.equal(h.calls[1].args.p_reply,other);assert.deepEqual(h.calls[1].args.p_recipients,[]);
 await h.post({...h.send,recipients:[]});assert.equal(h.calls[2].args.p_reply,null);
});
test('cursor, recipient query and historical completion filter are validated and never accept a forged actor',async()=>{
 const h=harness();await h.get({box:'sent',before:'9223372036854775807',actor:other});assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.calls[0].args.p_before,'9223372036854775807');
 await h.get({action:'recipients',search:'학생',after:other,ongoing:other});assert.deepEqual(h.calls[1].args,{p_actor:id,p_search:'학생',p_after:other,p_ongoing:other});
 const count=h.calls.length;
 for(const q of [{box:'all'},{before:'0'},{before:'1.5'},{before:'9223372036854775808'},{before:'1e10'},{action:'delete'},{action:'recipients',after:'bad'},{action:'recipients',ongoing:'bad'},{action:'recipients',search:'a'.repeat(101)}])assert.equal((await h.get(q)).status,400);
 assert.equal(h.calls.length,count);
});
test('known errors have actionable statuses, unknown failures hide database details',async()=>{
 for(const [message,status] of [['MESSAGE_FORBIDDEN',403],['MESSAGE_NOT_FOUND',404],['MESSAGE_RECIPIENT_CHANGED',409],['MESSAGE_RATE_LIMIT',429],['MESSAGE_REQUEST_REUSED',409]]){
  const h=harness({error:{message}});assert.equal((await h.post(h.send)).status,status);
 }
 for(const options of [{error:{message:'secret credential marker'}},{authError:new Error('secret credential marker')}]){
  const h=harness(options),r=await h.get();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret credential marker/);
 }
});
