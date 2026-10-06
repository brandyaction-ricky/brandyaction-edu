import { DiagnosisBridgeError } from './diagnosis-bridge';
import { validAdminDiagnosisBinding, validateAdminReportRows, validateAdminRetry, type AdminDiagnosisBinding, type AdminReportStatus } from './diagnosis-admin-bridge';

export type DiagnosisAdminRow = {id:string; name:string; published:boolean; attemptId:string|null; state:string; startedAt:string|null; updatedAt:string|null; report:(AdminReportStatus & {checkedAt:string})|null; statusAvailable:boolean};
export type DiagnosisAdminList = {enabled:boolean; allPublished:boolean; revision:number; eligibleCount:number; startedCount:number; nextCursor:string|null; rows:DiagnosisAdminRow[]; remoteAvailable:boolean};
type InternalRow = DiagnosisAdminRow & {binding: AdminDiagnosisBinding|null};
type Dependencies = {actor:{id:string};rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>;send:(input:Record<string,unknown>)=>Promise<unknown>;now?:()=>number};
export async function runDiagnosisAdmin(deps:Dependencies,input:Record<string,unknown>) {
  const {actor,rpc,send,now=Date.now}=deps;
  const call=async(name:string,args:Record<string,unknown>)=>{
    const result=await rpc(name,{...args,p_actor:actor.id});
    if(result.error){const m=(result.error as {message?:string}).message;const code=m==='DIAGNOSIS_FORBIDDEN'?'FORBIDDEN':m==='DIAGNOSIS_CONFLICT'?'CONFLICT':m==='DIAGNOSIS_INVALID'?'INVALID':'UNAVAILABLE';throw new DiagnosisBridgeError(code,{FORBIDDEN:403,CONFLICT:409,INVALID:400,UNAVAILABLE:503}[code]);}
    return result.data;
  };
  if(input.action==='list'){
    const data=await call(input.member?'edu_diagnosis_admin_member':'edu_diagnosis_admin_list',input.member?{p_member:input.member}:{p_before:input.before??null,p_query:input.query??'',p_limit:100}) as Omit<DiagnosisAdminList,'rows'> & {rows:InternalRow[]};
    if(!data||!Array.isArray(data.rows)||data.rows.length>100)throw new DiagnosisBridgeError('UNAVAILABLE',503);
    const bindings=data.rows.map(r=>r.binding).filter((b):b is AdminDiagnosisBinding=>validAdminDiagnosisBinding(b));
    const checkedAt=new Date(now()).toISOString();let remoteAvailable=true;
    let reports=new Map<string,AdminReportStatus>();
    if(bindings.length){
      try{
        const rows=validateAdminReportRows(await send({action:'status',actorId:actor.id,bindings}),bindings);
        await call('edu_diagnosis_admin_observe',{p_rows:rows});reports=new Map(rows.map(r=>[r.attemptId,r]));
      }catch(e){if(e instanceof DiagnosisBridgeError&&e.code==='FORBIDDEN')throw e;remoteAvailable=false;}
    }
    // A role change during the remote read must not expose the earlier list.
    await call('edu_diagnosis_assert_admin',{});
    return {enabled:data.enabled,allPublished:data.allPublished,revision:data.revision,eligibleCount:data.eligibleCount,startedCount:data.startedCount,nextCursor:data.nextCursor,remoteAvailable,
      rows:data.rows.map(r=>{const fresh=r.attemptId?reports.get(r.attemptId):undefined;
        const prior=r.report;
        return {id:r.id,name:r.name,published:r.published,attemptId:r.attemptId,state:r.state,startedAt:r.startedAt,updatedAt:r.updatedAt,
          statusAvailable:!r.binding||remoteAvailable,
          report:fresh?{queuePosition:fresh.queuePosition,queuedAt:fresh.queuedAt,queueObservedAt:fresh.queueObservedAt,retryMode:fresh.retryMode,startedAt:fresh.startedAt,submittedAt:fresh.submittedAt,issuedAt:fresh.issuedAt,state:fresh.state,updatedAt:fresh.updatedAt,errorCode:fresh.errorCode,canRetry:fresh.canRetry,version:fresh.version,details:fresh.details,checkedAt}:prior?{...prior,canRetry:false}:null};})} satisfies DiagnosisAdminList;
  }
  if(input.action==='publish_all'||input.action==='publish_member')return call('edu_diagnosis_admin_publication',{p_request:input.requestId,p_action:input.action,p_user:input.userId??null,p_enabled:input.enabled,p_revision:input.revision});
  if(input.action!=='retry')throw new DiagnosisBridgeError('INVALID',400);
  const args={p_request:input.requestId,p_attempt:input.attemptId,p_expected:input.expectedVersion};
  const mode=input.retryMode==='rewrite'?'rewrite':'resume';
  // Legacy receipts predate rewrite and therefore always mean resume.
  const checkReceipt=(receipt:unknown)=>{const savedMode=(receipt as {retryMode?:string})?.retryMode??'resume';if(savedMode!==mode)throw new DiagnosisBridgeError('CONFLICT',409);return receipt;};
  const saved=await call('edu_diagnosis_admin_retry_receipt',{...args,p_result:null});if(saved)return checkReceipt(saved);
  const binding=await call('edu_diagnosis_admin_context',{p_attempt:input.attemptId});
  if(!validAdminDiagnosisBinding(binding))throw new DiagnosisBridgeError('FORBIDDEN',403);
  // MYIN validates expectedVersion/mode atomically after checking its request receipt.
  // A status preflight here would prevent replay after a lost successful response.
  const result=validateAdminRetry(await send({action:'retry',actorId:actor.id,binding,requestId:input.requestId,expectedVersion:input.expectedVersion,...(input.retryMode?{retryMode:input.retryMode}:{})}),binding,String(input.requestId),mode);
  return checkReceipt(await call('edu_diagnosis_admin_retry_receipt',{...args,p_result:result}));
}
