import { createHash } from 'node:crypto';
import { needsTutorReferences, reviewedTutorReferences, tutorEndpoint, tutorFaqSha256, type TutorReference } from './curriculum-tutor';
import type { AiSource } from './curriculum-ai';

type Rpc = { jsonrpc?:string; id?:number; error?:unknown; result?:{protocolVersion?:string;isError?:boolean;content?:{type?:string;text?:string}[]} };
const limit=128_000;
async function rpc(method:string, params:object, id:number, signal:AbortSignal, session?:string, protocol?:string) {
 const response=await fetch(tutorEndpoint,{method:'POST',redirect:'error',cache:'no-store',signal,
  headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session}:{}),...(protocol?{'MCP-Protocol-Version':protocol}:{})},
  body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 if(!response.ok)throw Error('TUTOR_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw Error('TUTOR_RESPONSE_INVALID');
 let size=0,text='';const decoder=new TextDecoder();
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw Error('TUTOR_RESPONSE_LIMIT');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const type=response.headers.get('content-type')||'';
 let value:Rpc|undefined;
 if(type.includes('application/json'))value=JSON.parse(text);
 else if(type.includes('text/event-stream')){
  for(const frame of text.replace(/\r\n/g,'\n').split('\n\n')){
   const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
   if(!data)continue;const item=JSON.parse(data) as Rpc;if(item.id===id){value=item;break;}
  }
 }
 if(value?.jsonrpc!=='2.0'||value.id!==id||value.error||!value.result||value.result.isError)throw Error('TUTOR_RESPONSE_INVALID');
 return{result:value.result,session:response.headers.get('mcp-session-id')||undefined};
}

// One bounded, read-only request sequence shared per server instance. It receives
// no student question/history, identity, screenshot, credentials or arbitrary URL.
// Keep the cache in memory; remote failure never blocks curriculum-only answers.
export function createTutorReader(now=()=>Date.now()) {
 let cached:{text:string;until:number}|undefined,pending:Promise<string>|undefined;
 return async function(question:string,sources:AiSource[]):Promise<TutorReference[]> {
  if(!needsTutorReferences(question,sources))return[];
  if(!cached||cached.until<=now()){
   if(!pending)pending=(async()=>{
    try{
     const signal=AbortSignal.timeout(2500);
     const init=await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'EDU-reviewed-faq',version:'1.0'}},1,signal);
     const reply=await rpc('tools/call',{name:'get_faq',arguments:{}},2,signal,init.session,init.result.protocolVersion);
     const text=(reply.result.content||[]).filter(c=>c.type==='text'&&typeof c.text==='string').map(c=>c.text).join('\n').replace(/\r\n/g,'\n');
     if(!text||text.length>60000)throw Error('TUTOR_RESPONSE_INVALID');
     if(createHash('sha256').update(text).digest('hex')!==tutorFaqSha256)throw Error('TUTOR_REVIEW_REQUIRED');
     cached={text,until:now()+10*60_000};return text;
    }catch{cached={text:'',until:now()+60_000};return'';}
   })().finally(()=>{pending=undefined;});
   await pending;
  }
  return reviewedTutorReferences(question,sources,cached?.text||'');
 };
}
export const readTutorReferences=createTutorReader();
