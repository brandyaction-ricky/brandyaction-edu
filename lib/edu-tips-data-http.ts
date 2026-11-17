import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './edu-tips-data.schema.json';
import { parseStrictTipsJson } from './edu-tips-json';
const ajv = new Ajv({ strict: false, allErrors: false }); addFormats(ajv); ajv.addSchema(schema);
const validators = Object.fromEntries(['EventPage','LearningPage','RecoveryRequest','RecoveryResponse','RecoveryCompleteRequest','RecoveryCompleteResponse']
  .map(name => [name, ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` })]));
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
type Action = 'events' | 'learning' | 'recovery' | 'complete';
type Dependencies = { env: Record<string,string|undefined>; rpc: (name: string,args: Record<string,unknown>,signal: AbortSignal) => Promise<{data:unknown;error:{message:string}|null}> };
class Failure extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
const fail = (status: number,code: string): never => { throw new Failure(status,code); };
function object(v: unknown): Record<string,unknown> {
  if (!v || typeof v!=='object' || Array.isArray(v)) return fail(503,'contract_violation');
  return v as Record<string,unknown>;
}
function exact(v: Record<string,unknown>,keys: string[]) {
  if (Object.keys(v).length!==keys.length || keys.some(k=>!(k in v))) fail(503,'contract_violation');
}
function validate(name: string,v: unknown,input=false) {
  if (!validators[name](v)) fail(input?400:503,input?'invalid_request':'contract_violation');
}
function response(body: unknown,status=200) {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Contract-Version':'2.0.0-rc.2',...(status===429?{'Retry-After':'60'}:{})}});
}
async function body(request: Request,signal: AbortSignal) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') fail(400,'invalid_request');
  if (Number(request.headers.get('content-length')||0)>4096) fail(400,'invalid_request');
  const reader=request.body?.getReader();if(!reader) return fail(400,'invalid_request');
  const chunks: Uint8Array[]=[];let size=0;const cancel=()=>{void reader.cancel();};signal.addEventListener('abort',cancel,{once:true});
  try { while(true) { signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;
    size+=part.value.byteLength;if(size>4096){await reader.cancel();fail(400,'invalid_request');}chunks.push(part.value); }
    try{return parseStrictTipsJson(Buffer.concat(chunks));}catch{return fail(400,'invalid_request');}
  }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}
const codes: Record<string,[number,string]>={
  TIPS_INVALID:[400,'invalid_request'],TIPS_UNKNOWN_CURSOR:[409,'unknown_cursor'],TIPS_CURSOR_EXPIRED:[410,'cursor_expired'],
  TIPS_RECOVERY_REQUIRED:[409,'recovery_required'],TIPS_RECOVERY_INCOMPLETE:[409,'recovery_incomplete'],
  TIPS_IDEMPOTENCY_CONFLICT:[409,'idempotency_conflict'],TIPS_SOURCE_INCONSISTENT:[503,'contract_violation'],
};
function checkItems(action: Action,items: unknown[],generatedAt: string) {
  const now=Date.parse(generatedAt), seen=new Set<string>();
  for(const v of items) {
    const item=object(v),p=action==='events'?object(item.payload):item;
    if(typeof p.expires_at!=='string' || Date.parse(p.expires_at)<=now)fail(503,'contract_violation');
    const id=String(action==='events'?item.event_id:item.record_id)+':'+p.record_revision;
    if(seen.has(id))fail(503,'contract_violation');seen.add(id);
    if(action==='events') {
      if(Date.parse(String(item.event_timestamp))>now)fail(503,'contract_violation');
      if(item.event_type==='order_refunded' && Date.parse(String(p.original_payment_at))>Date.parse(String(item.event_timestamp))+3599999)fail(503,'contract_violation');
    } else {
      const expiry=Date.parse(String(item.date_kst)+'T00:00:00+09:00')+90*86400000;
      if(Date.parse(String(item.expires_at))!==expiry)fail(503,'contract_violation');
      if(item.completed_items!==null && item.total_items!==null && Number(item.completed_items)>Number(item.total_items))fail(503,'contract_violation');
      const comparable=item.completed_items!==null && item.total_items!==null && Number(item.total_items)>0 && item.curriculum_version!==null;
      if(comparable ? item.usage_ratio!==Number(item.completed_items)/Number(item.total_items) : item.usage_ratio!==null)fail(503,'contract_violation');
    }
  }
}
export async function handleData(request: Request,action: Action,deps: Dependencies): Promise<Response> {
  try {
    // Collection gate never disables independent deletion/eligibility endpoints.
    if(deps.env.EDU_TIPS_DATA_API_ENABLED!=='true')return response({error:'disabled'},503);
    const env=deps.env.NEXT_PUBLIC_APP_ENV==='development'?'dev':deps.env.NEXT_PUBLIC_APP_ENV==='production'?'production':null;
    const secret=deps.env.EDU_TIPS_DATA_CURSOR_SECRET,eraseSecret=deps.env.EDU_TIPS_ERASURE_CURSOR_SECRET;
    if(!env || !secret || secret.length<43 || !eraseSecret || eraseSecret.length<43)return response({error:'unavailable'},503);
    const page=action==='events'||action==='learning';
    if(request.method!==(page?'GET':'POST'))return response({error:'invalid_request'},405);
    const query=new URL(request.url).searchParams;
    if(page?([...query.keys()].some(k=>!['after','limit'].includes(k)) || query.getAll('after').length>1 || query.getAll('limit').length>1):query.size>0)fail(400,'invalid_request');
    const rawLimit=query.get('limit')??'200';if(!/^[1-9][0-9]{0,2}$/.test(rawLimit)||Number(rawLimit)>500)fail(400,'invalid_request');
    const limit=Number(rawLimit),signal=AbortSignal.any([request.signal,AbortSignal.timeout(5000)]);
    const key=/^Bearer ([A-Za-z0-9_-]{32,512})$/i.exec(request.headers.get('authorization')||'')?.[1];if(!key)return response({error:'unauthorized'},401);
    const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await deps.rpc(name,args,signal);if(r.error){const known=codes[r.error.message];if(known)fail(...known);fail(503,'unavailable');}return object(r.data);};
    const scope=action==='events'?'edu.events.read':action==='learning'?'edu.learning.read':'edu.recovery';
    const keyHash=sha(key),gate=await rpc('edu_tips_data_gate',{p_key_hash:keyHash,p_environment:env,p_scope:scope});
    const gateError=(value:Record<string,unknown>)=>{
      if(value.error){const status={unauthorized:401,forbidden_scope:403,rate_limited:429,disabled:503}[String(value.error)];if(!status)fail(503,'unavailable');return response({error:value.error},status);}return null;
    };
    const denied=gateError(gate);if(denied)return denied;
    exact(gate,['consumer_id']);if(typeof gate.consumer_id!=='string'||!/^[0-9a-f-]{36}$/i.test(gate.consumer_id))fail(503,'contract_violation');
    const consumer=gate.consumer_id;
    const sign=(stream:string,nonce:Buffer)=>createHmac('sha256',stream==='tombstones'?eraseSecret:secret)
      .update(`${consumer}:${env}:brandyaction:brandyaction_edu:${stream}:1:`).update(nonce).digest();
    const mint=(stream:string,prefix:string,seed?:string)=>{const nonce=seed?createHmac('sha256',secret).update(`${consumer}:${env}:${stream}:${seed}`).digest():randomBytes(32);
      return prefix+Buffer.concat([nonce,sign(stream,nonce)]).toString('base64url');};
    const hashCursor=(v:unknown,stream:string)=>{
      const prefix=stream==='events'?'ev_':stream==='learning'?'lu_':'ts_';
      if(typeof v!=='string'||!new RegExp(`^(${prefix}|${stream==='tombstones'?'ts_':'rc_'})[A-Za-z0-9_-]{86}$`).test(v))return fail(409,'unknown_cursor');
      const bytes=Buffer.from(v.slice(3),'base64url');if(bytes.length!==64||bytes.toString('base64url')!==v.slice(3)||!timingSafeEqual(bytes.subarray(32),sign(stream,bytes.subarray(0,32))))return fail(409,'unknown_cursor');return sha(v);
    };
    let input:Record<string,unknown>={};let after:string|null=null;let tokens:string[];
    if(page){after=query.has('after')?hashCursor(query.get('after'),action):null;tokens=[mint(action,action==='events'?'ev_':'lu_'),mint(action,action==='events'?'ev_':'lu_'),mint(action,action==='events'?'ev_':'lu_')];}
    else{
      const parsed=await body(request,signal);validate(action==='recovery'?'RecoveryRequest':'RecoveryCompleteRequest',parsed,true);input=object(parsed);
      if(action==='recovery'){tokens=[mint('events','rc_',String(input.requestId)),mint('learning','rc_',String(input.requestId)),mint('tombstones','ts_',String(input.requestId))];}
      else{input={...input,event_through:hashCursor(input.event_through,'events'),learning_through:hashCursor(input.learning_through,'learning'),tombstone_through:hashCursor(input.tombstone_through,'tombstones')};
        tokens=[mint('events','ev_'),mint('learning','lu_'),mint('events','ev_')];}
    }
    const raw=await rpc('edu_tips_data_operation',{p_consumer:consumer,p_key_hash:keyHash,p_environment:env,p_action:action,p_body:input,p_after:after,p_limit:limit,p_hashes:tokens.map(sha)});
    const invalid=gateError(raw);if(invalid)return invalid;
    const header={source:'brandyaction_edu',tenant_id:'brandyaction',brand_id:'brandyaction_edu',contract_version:'2.0.0-rc.2'};
    if(page){exact(raw,['items','has_more','stream_generation']);if(!Array.isArray(raw.items)||raw.items.length>limit)fail(503,'contract_violation');
      const generatedAt=new Date().toISOString();checkItems(action,raw.items as unknown[],generatedAt);
      const result={...header,generated_at:generatedAt,stream_generation:raw.stream_generation,next_cursor:tokens[0],snapshot_upper:tokens[1],has_more:raw.has_more,[action==='events'?'events':'rows']:raw.items};
      validate(action==='events'?'EventPage':'LearningPage',result);return response(result);}
    if(action==='recovery'){exact(raw,['recovery_id','expires_at','cutoff_at']);raw.expires_at=new Date(String(raw.expires_at)).toISOString();raw.cutoff_at=new Date(String(raw.cutoff_at)).toISOString();const result={...header,...raw,status:'paused_for_rebuild',event_cursor:tokens[0],learning_cursor:tokens[1],tombstone_cursor:tokens[2]};
      validate('RecoveryResponse',result);return response(result);}
    raw.completed_at=new Date(String(raw.completed_at)).toISOString();validate('RecoveryCompleteResponse',raw);return response(raw);
  }catch(error){return response({error:error instanceof Failure?error.code:'unavailable'},error instanceof Failure?error.status:503);}
}

export async function scheduledDataRetention(request: Request,deps: Dependencies): Promise<Response> {
  try {
    if(request.method!=='GET')return response({error:'invalid_request'},405);
    if(deps.env.EDU_TIPS_DATA_RETENTION_ENABLED!=='true')return response({error:'disabled'},503);
    const secret=deps.env.CRON_SECRET;
    if(!secret || !['development','production'].includes(deps.env.NEXT_PUBLIC_APP_ENV||''))return response({error:'unavailable'},503);
    const actual=request.headers.get('authorization')||'';
    if(!timingSafeEqual(Buffer.from(sha(actual),'hex'),Buffer.from(sha('Bearer '+secret),'hex')))return response({error:'unauthorized'},401);
    if(new URL(request.url).searchParams.size)return response({error:'invalid_request'},400);
    const r=await deps.rpc('edu_tips_prune_feed_content',{},AbortSignal.any([request.signal,AbortSignal.timeout(5000)]));
    if(r.error)return response({error:'unavailable'},503);
    const data=object(r.data);exact(data,['delivery_copies','versions','facts','snapshot_copies','daily_evidence']);
    if(Object.values(data).some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0))return response({error:'contract_violation'},503);
    return response({status:'ok',pruned:data});
  }catch{return response({error:'unavailable'},503);}
}
