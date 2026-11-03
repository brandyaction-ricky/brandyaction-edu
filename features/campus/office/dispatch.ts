import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { readOfficeConnectors } from './webhook';

export type OutboundConnector = { id: string; keyVersion: string; secret: string; ownerIds: string[]; endpoint: string; allowedHost: string };
export type DispatchLease = { id: string; leaseId: string; attempt: number; operation: 'submit'|'status'|'cancel'; connectorId: string; keyVersion: string; payload: Record<string, unknown> };
export type DispatchOutcome = 'accepted'|'not_found'|'cancelled'|'busy'|'uncertain'|'rejected';
const outcomes = ['accepted','not_found','cancelled','busy','rejected'] as const;
/** No arbitrary request URL: administrators configure an exact HTTPS host+path. */
export function readOutboundConnectors(env: Record<string,string|undefined>): OutboundConnector[] {
  if (env.EDU_CAMPUS_ENABLED !== 'true' || env.EDU_CAMPUS_OFFICE_ENABLED !== 'true' || env.EDU_CAMPUS_OFFICE_DISPATCH_ENABLED !== 'true') return [];
  try {
    const entries: unknown = JSON.parse(env.EDU_CAMPUS_OFFICE_OUTBOUND_JSON ?? '[]');
    if (!Array.isArray(entries) || entries.length > 3) return [];
    const incoming=readOfficeConnectors(env), seen=new Set<string>();
    return entries.map(e=>{
      if (!e || typeof e!=='object' || typeof e.endpoint!=='string' || typeof e.allowedHost!=='string') throw Error('config');
      const connector=incoming.find(c=>c.id===e.id);
      const u=new URL(e.endpoint);
      if (!connector || seen.has(connector.id) || u.protocol!=='https:' || u.username || u.password || u.hash || u.search || u.port || isIP(u.hostname) || u.hostname!==e.allowedHost || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname) || u.pathname.length>200) throw Error('config');
      seen.add(connector.id);return {...connector,endpoint:u.href,allowedHost:u.hostname};
    });
  } catch { return []; }
}
/** IPv4 only by design: reject all special-use/reserved networks and DNS mixtures.
 * The validated address is pinned into TLS lookup, preventing DNS rebinding. */
export function publicIpv4(address: string): boolean {
  if (isIP(address)!==4) return false;
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2||b===88&&c===99))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
}
export function verifyDispatchAck(raw: string, signature: string, connector: OutboundConnector, lease: DispatchLease, timestamp: string): DispatchOutcome {
  if (!/^v1=[0-9a-f]{64}$/.test(signature) || Buffer.byteLength(raw)>4096) return 'uncertain';
  const expected=createHmac('sha256',connector.secret).update(`campus-office-ack.v1.${connector.id}.${connector.keyVersion}.${timestamp}.${lease.id}.${lease.leaseId}.${lease.operation}.${raw}`).digest();
  if (!timingSafeEqual(expected,Buffer.from(signature.slice(3),'hex'))) return 'uncertain';
  try { const ack=JSON.parse(raw); if(ack.dispatchId!==lease.id || ack.leaseId!==lease.leaseId || ack.operation!==lease.operation || !outcomes.includes(ack.outcome)) return 'uncertain'; return ack.outcome; } catch { return 'uncertain'; }
}
export type WireRequest = { url: URL; address: string; body: string; headers: Record<string,string> };
export type WireResponse = { status: number; signature: string; body: string };
export function pinnedHttpsPost(w: WireRequest): Promise<WireResponse> {
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(w.url,{method:'POST',headers:w.headers,agent:false,family:4,minVersion:'TLSv1.2',servername:w.url.hostname,lookup:(_host,_options,callback)=>callback(null,w.address,4)},res=>{
      let size=0;const parts:Buffer[]=[];
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>4096){res.destroy();req.destroy(Error('response-limit'));}else parts.push(chunk);});
      res.on('error',()=>reject(Error('transport')));
      res.on('end',()=>{try{resolve({status:res.statusCode??0,signature:String(res.headers['x-campus-signature']??''),body:new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))});}catch{reject(Error('encoding'));}});
    });
    // Includes DNS/TLS/response stalls; socket inactivity alone is insufficient.
    const deadline=setTimeout(()=>req.destroy(Error('deadline')),8000);
    req.once('close',()=>clearTimeout(deadline));req.once('error',()=>reject(Error('transport')));req.end(w.body);
  });
}
export async function sendOfficeDispatch(connector: OutboundConnector,lease: DispatchLease,deps: { resolve?: typeof lookup; post?: (request:WireRequest)=>Promise<WireResponse>; now?: ()=>number }={}):Promise<DispatchOutcome>{
  if(!Number.isSafeInteger(lease.attempt)||lease.attempt<1||lease.attempt>12||lease.connectorId!==connector.id||lease.keyVersion!==connector.keyVersion||!['submit','status','cancel'].includes(lease.operation)||!connector.ownerIds.includes(String(lease.payload.ownerId))) return 'uncertain';
  try{
    const url=new URL(connector.endpoint);
    if(url.protocol!=='https:'||url.hostname!==connector.allowedHost||url.username||url.password||url.port||url.hash||url.search||isIP(url.hostname))return 'uncertain';
    let dnsTimer: ReturnType<typeof setTimeout>|undefined;
    const addresses=await Promise.race([(deps.resolve??lookup)(url.hostname,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('dns-deadline')),2000);})]).finally(()=>clearTimeout(dnsTimer));
    if(!addresses.length||addresses.length>16||addresses.some(a=>!publicIpv4(a.address)))return 'uncertain';
    const timestamp=String(Math.floor((deps.now?.()??Date.now())/1000));
    const body=JSON.stringify({schema:'campus-office.v1',dispatchId:lease.id,leaseId:lease.leaseId,attempt:lease.attempt,operation:lease.operation,payload:lease.payload});
    if(Buffer.byteLength(body)>26000)return 'uncertain';
    const signature=createHmac('sha256',connector.secret).update(`campus-office-request.v1.${connector.id}.${connector.keyVersion}.${timestamp}.${lease.id}.${lease.leaseId}.${lease.operation}.${body}`).digest('hex');
    const response=await(deps.post??pinnedHttpsPost)({url,address:addresses[0].address,body,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body)),'x-campus-connector':connector.id,'x-campus-key-version':connector.keyVersion,'x-campus-timestamp':timestamp,'x-campus-idempotency-key':lease.id,'x-campus-lease-id':lease.leaseId,'x-campus-operation':lease.operation,'x-campus-signature':`v1=${signature}`}});
    // No redirects, proxy headers, unsigned 429/5xx retry or arbitrary response payload.
    if(response.status!==200)return 'uncertain';
    return verifyDispatchAck(response.body,response.signature,connector,lease,timestamp);
  }catch{return 'uncertain';}
}
export async function runOfficeDispatch(deps:{connectors:OutboundConnector[];claim:(connector:OutboundConnector,leaseId:string)=>Promise<DispatchLease|null>;finish:(lease:DispatchLease,outcome:DispatchOutcome)=>Promise<unknown>;send?:(connector:OutboundConnector,lease:DispatchLease)=>Promise<DispatchOutcome>}){
  const result:{claimed:number;completed:number;uncertain:number}={claimed:0,completed:0,uncertain:0};
  for(const connector of deps.connectors.slice(0,3)){
    const lease=await deps.claim(connector,randomUUID());if(!lease)continue;result.claimed++;
    let outcome:DispatchOutcome='uncertain';try{outcome=await(deps.send??sendOfficeDispatch)(connector,lease);}catch{/* Unknown wire state: do not resubmit. */}
    await deps.finish(lease,outcome);result.completed++;if(outcome==='uncertain')result.uncertain++;
  }return result;
}
export function dispatchBearerAllowed(header:string|null,secret:string|undefined){if(!secret||secret.length<32||!header?.startsWith('Bearer '))return false;const got=Buffer.from(header.slice(7)),wanted=Buffer.from(secret);return got.length===wanted.length&&timingSafeEqual(got,wanted);}
