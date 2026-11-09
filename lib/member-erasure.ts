import {createAdminClient} from './supabase/admin';
import {EraseBridgeError,sendDiagnosisErase,type EraseReceipt} from './diagnosis-erase-bridge';

type Rpc=(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>;
type Job={requestId:string;subject:string;lease:string;environment:string;authErased?:boolean};
type LocalFile={id:string;bucket:string;path:string};
const privateBuckets=new Set(['question-images','lesson-answer-files','campus-portfolio-private']);
export async function eraseMemberLocalData(rpc:Rpc,job:Job,remove=(bucket:string,paths:string[])=>createAdminClient().storage.from(bucket).remove(paths)) {
  const args={p_request:job.requestId,p_lease:job.lease};
  const prepared=await rpc('edu_prepare_member_local_erasure',args);
  if(prepared.error){
    // Only fixed codes are propagated; never log SQL errors, file names or member content.
    const code=typeof prepared.error==='object'&&prepared.error!==null&&'message' in prepared.error&&prepared.error.message==='LOCAL_UPLOAD_DRAIN_PENDING'
      ?'LOCAL_UPLOAD_DRAIN_PENDING':'LOCAL_ERASURE_PENDING';
    throw new EraseBridgeError(code,true);
  }
  if(!prepared.data||typeof prepared.data!=='object'||!('ready' in prepared.data))throw new EraseBridgeError('LOCAL_ERASURE_PENDING',true);
  if(prepared.data.ready===true)return;
  // Bounded work per lease; remaining objects stay in the durable queue for the same request.
  for(let batch=0;batch<3;batch++){
    const listed=await rpc('edu_list_member_erasure_files',args);
    if(listed.error||!Array.isArray(listed.data)||listed.data.length>50)throw new EraseBridgeError('LOCAL_STORAGE_PENDING',true);
    const files=listed.data as LocalFile[];
    if(!files.length){
      const saved=await rpc('edu_finish_member_local_erasure',args);
      if(saved.error)throw new EraseBridgeError('LOCAL_STORAGE_PENDING',true);
      return;
    }
    if(files.some(f=>!f||!privateBuckets.has(f.bucket)||typeof f.path!=='string'||!f.path||!f.id))throw new EraseBridgeError('LOCAL_STORAGE_PENDING',true);
    for(const bucket of new Set(files.map(f=>f.bucket))){
      const group=files.filter(f=>f.bucket===bucket);
      const removed=await remove(bucket,group.map(f=>f.path));
      if(removed.error)throw new EraseBridgeError('LOCAL_STORAGE_PENDING',true);
      const saved=await rpc('edu_record_member_erasure_files',{...args,p_files:group.map(f=>f.id)});
      if(saved.error)throw new EraseBridgeError('LOCAL_STORAGE_PENDING',true);
    }
  }
  throw new EraseBridgeError('LOCAL_STORAGE_PENDING',true);
}
const environments={
  production:{host:'qitqxizuwmmlhlcgsrqe.supabase.co',origin:'https://server.myinlab.co.kr'},
  dev:{host:'vjmjhaidlqkmascdjocw.supabase.co',origin:'https://dev-server.myinlab.co.kr'},
};
export function memberErasureReady(env:NodeJS.ProcessEnv=process.env) {
  const environment=env.NEXT_PUBLIC_APP_ENV==='production'?'production':'dev';
  try {
    return env.EDU_DIAGNOSIS_ERASURE_ENABLED==='true'
      && env.EDU_MYIN_BRIDGE_ENVIRONMENT===environment
      && env.EDU_MYIN_BRIDGE_ORIGIN===environments[environment].origin
      && /^[a-f0-9]{64}$/i.test(env.EDU_MYIN_BRIDGE_SECRET??'')
      && new URL(env.NEXT_PUBLIC_SUPABASE_URL??'').origin===`https://${environments[environment].host}`;
  } catch {return false;}
}

// Soft deletion removes Auth credentials/identities without cascading away legally retained orders.
// The profile has already been withdrawn in the approval transaction; APIs reject it immediately.
export async function eraseMemberAuth(subject:string) {
  const auth=createAdminClient().auth.admin;
  const current=await auth.getUserById(subject);
  if(current.error) {
    if(current.error.code==='user_not_found')return;
    throw new EraseBridgeError('AUTH_ERASURE_FAILED',true);
  }
  if(!current.data.user)throw new EraseBridgeError('AUTH_ERASURE_FAILED',true);
  if(current.data.user.deleted_at)return;
  const result=await auth.deleteUser(subject,true);
  if(result.error)throw new EraseBridgeError('AUTH_ERASURE_FAILED',true);
}

export async function dispatchMemberErasure({rpc,send,eraseAuth=eraseMemberAuth,eraseLocal=eraseMemberLocalData,env=process.env,limit=3,requestId}: {
  rpc?:Rpc;send?:(subject:string,requestId:string)=>Promise<EraseReceipt>;
  eraseAuth?:(subject:string)=>Promise<void>;eraseLocal?:(rpc:Rpc,job:Job)=>Promise<void>;env?:NodeJS.ProcessEnv;limit?:number;requestId?:string;
}={}) {
  if(env.EDU_DIAGNOSIS_ERASURE_ENABLED!=='true')return {enabled:false,processed:0,completed:0};
  if(!memberErasureReady(env))throw new EraseBridgeError('CONFIGURATION',false);
  if(requestId&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))throw new EraseBridgeError('INVALID',false);
  const environment=env.NEXT_PUBLIC_APP_ENV==='production'?'production':'dev';
  const call=rpc??((name,args)=>createAdminClient().rpc(name,args));
  const claimed=await call('edu_claim_approved_member_erasure',{p_environment:environment,p_limit:requestId?1:limit,p_request:requestId??null});
  if(claimed.error||!Array.isArray(claimed.data))throw Error('ERASURE_CLAIM_FAILED');
  let completed=0;
  for(const job of claimed.data as Job[]){
    if(job.environment!==environment || (requestId&&job.requestId!==requestId))throw Error('ERASURE_ENVIRONMENT_MISMATCH');
    let result:EraseReceipt|null=null,code:string|null=null,retryable=false;
    try {
      // Storage-owned objects can prevent Auth deletion. Revoke access in the approval
      // transaction, drain signed uploads, then remove owned objects before deleting credentials.
      await eraseLocal(call,job);
      if(!job.authErased){
        await eraseAuth(job.subject);
        const savedAuth=await call('edu_record_member_auth_erasure',{p_request:job.requestId,p_lease:job.lease});
        // An uncertain receipt must be retried using the same request, never reported as completed.
        if(savedAuth.error)throw new EraseBridgeError('AUTH_RECEIPT_PENDING',true);
      }
      result=await (send??((s,r)=>sendDiagnosisErase(s,r,{env})))(job.subject,job.requestId);
      if(result.storageFailedCount){code='STORAGE_PENDING';retryable=true;}
    } catch(error){
      code=error instanceof EraseBridgeError?error.code:'NETWORK';
      retryable=error instanceof EraseBridgeError?error.retryable:true;
    }
    const saved=await call('edu_finish_member_erasure',{p_request:job.requestId,p_lease:job.lease,p_result:result,p_code:code,p_retryable:retryable});
    if(saved.error)throw Error('ERASURE_RECEIPT_SAVE_FAILED');
    if(saved.data===true)completed++;
  }
  return {enabled:true,processed:claimed.data.length,completed};
}
