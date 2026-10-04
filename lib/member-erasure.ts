import { createAdminClient } from './supabase/admin';
import { EraseBridgeError, sendDiagnosisErase, type EraseReceipt } from './diagnosis-erase-bridge';
type Rpc = (name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>;
type Job = {requestId:string;subject:string;lease:string;environment:string};
export async function dispatchMemberErasure({rpc,send=sendDiagnosisErase,env=process.env,limit=3}:{rpc?:Rpc;send?:(subject:string,requestId:string)=>Promise<EraseReceipt>;env?:NodeJS.ProcessEnv;limit?:number}={}) {
  if(env.EDU_DIAGNOSIS_ERASURE_ENABLED!=='true')return{enabled:false,processed:0,completed:0};
  const environment=env.NEXT_PUBLIC_APP_ENV==='production'?'production':'dev';
  if(env.EDU_MYIN_BRIDGE_ENVIRONMENT!==environment)throw new EraseBridgeError('CONFIGURATION',false);
  const call=rpc??((name,args)=>createAdminClient().rpc(name,args));
  const claimed=await call('edu_claim_member_erasure',{p_environment:environment,p_limit:limit});
  if(claimed.error || !Array.isArray(claimed.data))throw new Error('ERASURE_CLAIM_FAILED');
  let completed=0;
  for(const job of claimed.data as Job[]) {
    if(job.environment!==environment)throw new Error('ERASURE_ENVIRONMENT_MISMATCH');
    let result:EraseReceipt|null=null,code:string|null=null,retryable=false;
    try {result=await send(job.subject,job.requestId);if(result.storageFailedCount){code='STORAGE_PENDING';retryable=true;}}
    catch(error){code=error instanceof EraseBridgeError?error.code:'NETWORK';retryable=error instanceof EraseBridgeError?error.retryable:true;}
    const saved=await call('edu_finish_member_erasure',{p_request:job.requestId,p_lease:job.lease,p_result:result,p_code:code,p_retryable:retryable});
    // An uncertain write keeps the lease until expiry; retry uses the same remote requestId.
    if(saved.error)throw new Error('ERASURE_RECEIPT_SAVE_FAILED');
    if(saved.data===true)completed++;
  }
  return{enabled:true,processed:claimed.data.length,completed};
}
