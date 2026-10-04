import { createHash, createHmac } from 'node:crypto';

export const erasePath = '/api/integrations/edu/diagnosis/erase';
export const eraseCountKeys = ['sessions','report_requests','report_jobs','precision_calls','precision_stages','precision_artifacts','precision_quality_receipts','precision_issues','markdown_exports','precision_diagnostics','admin_report_events'] as const;
export type EraseReceipt = { erased:true; requestId:string; counts:Record<(typeof eraseCountKeys)[number],number>; storageRemoved:number; storageFailedCount:number };
export class EraseBridgeError extends Error {
  constructor(public code:string, public retryable:boolean) { super(code); }
}
const uuid = (v:unknown):v is string => typeof v==='string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const count = (v:unknown):v is number => Number.isSafeInteger(v) && Number(v)>=0;
export function eraseHeaders(body:string,secret:string,environment:string,timestamp=String(Math.floor(Date.now()/1000))) {
  if (!/^[a-f0-9]{64}$/i.test(secret) || !['dev','production'].includes(environment) || !/^\d{10}$/.test(timestamp)) throw new EraseBridgeError('CONFIGURATION',false);
  const digest=createHash('sha256').update(body).digest('hex');
  const signature=createHmac('sha256',Buffer.from(secret,'hex')).update(`edu-n6-erase-v1\n${environment}\nPOST\n${erasePath}\n${timestamp}\n${digest}`).digest('hex');
  return {'Content-Type':'application/json',Authorization:`Bearer ${signature}`,'X-Edu-Environment':environment,'X-Edu-Timestamp':timestamp};
}
export function validateEraseReceipt(value:unknown,requestId:string):EraseReceipt {
  const v=value as Record<string,unknown>, counts=v?.counts as Record<string,unknown>;
  if (!v || v.erased!==true || v.requestId!==requestId || !counts || Array.isArray(counts)
    || eraseCountKeys.some(k=>!count(counts[k])) || Object.keys(counts).some(k=>!eraseCountKeys.includes(k as typeof eraseCountKeys[number]))
    || !count(v.storageRemoved) || !Array.isArray(v.storageFailed) || v.storageFailed.length>10000) throw new EraseBridgeError('INVALID_RESPONSE',false);
  return {erased:true,requestId,counts:Object.fromEntries(eraseCountKeys.map(k=>[k,counts[k]])) as EraseReceipt['counts'],storageRemoved:v.storageRemoved,storageFailedCount:v.storageFailed.length};
}
export async function sendDiagnosisErase(subject:string,requestId:string,{env=process.env,fetcher=fetch}:{env?:NodeJS.ProcessEnv;fetcher?:typeof fetch}={}) {
  const environment=env.NEXT_PUBLIC_APP_ENV==='production'?'production':'dev';
  const origin=environment==='production'?'https://server.myinlab.co.kr':'https://dev-server.myinlab.co.kr';
  if (!uuid(subject)||!uuid(requestId)) throw new EraseBridgeError('INVALID',false);
  if (env.EDU_MYIN_BRIDGE_ENVIRONMENT!==environment || env.EDU_MYIN_BRIDGE_ORIGIN!==origin) throw new EraseBridgeError('CONFIGURATION',false);
  const body=JSON.stringify({subject,requestId});
  const headers=eraseHeaders(body,env.EDU_MYIN_BRIDGE_SECRET??'',environment);
  try {
    const response=await fetcher(origin+erasePath,{method:'POST',headers,body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new EraseBridgeError(({400:'INVALID',401:'UNAUTHORIZED',403:'FORBIDDEN',404:'DISABLED',413:'INVALID',503:'UNAVAILABLE'} as Record<number,string>)[response.status]??'UNAVAILABLE',response.status===503 || response.status===429 || response.status>=500);
    const reader=response.body?.getReader();if(!reader)throw new EraseBridgeError('INVALID_RESPONSE',false);
    const parts:Uint8Array[]=[];let bytes=0;
    try {for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>262144){await reader.cancel();throw new EraseBridgeError('INVALID_RESPONSE',false);}parts.push(item.value);}}finally{reader.releaseLock();}
    let value:unknown;try{value=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new EraseBridgeError('INVALID_RESPONSE',false);}
    return validateEraseReceipt(value,requestId);
  } catch(error) {if(error instanceof EraseBridgeError)throw error;throw new EraseBridgeError('NETWORK',true);}
}
