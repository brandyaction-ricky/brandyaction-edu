export type DiagnosisState='not_started'|'preparing'|'in_progress'|'submitted'|'processing'|'ready'|'needs_review';
export const diagnosisStatus:Record<DiagnosisState,{title:string;description:string}>={
 not_started:{title:'나를 이해하는 N6 검사',description:'중간에 나가도 답변이 저장되어 이어서 할 수 있어요.'},
 preparing:{title:'검사를 준비하고 있어요',description:'구매·수강 정보를 확인하고 있습니다. 잠시 후 다시 확인해 주세요.'},
 in_progress:{title:'이어서 검사하기',description:'마지막으로 저장한 답변부터 이어서 할 수 있어요.'},
 submitted:{title:'답변을 제출했어요',description:'결과가 준비되면 여기에서 확인할 수 있어요. 이 화면을 닫아도 괜찮아요.'},
 processing:{title:'검사 결과를 만들고 있어요',description:'결과가 준비되면 여기에서 확인할 수 있어요. 이 화면을 닫아도 괜찮아요.'},
 ready:{title:'검사 결과가 준비됐어요',description:'결과를 읽고 MD 파일을 내려받아 옵시디언에 넣어 보세요.'},
 needs_review:{title:'검사 준비 상태를 확인하고 있어요',description:'추가 결제나 재검사는 필요하지 않아요. 운영팀 확인 후 이어서 이용할 수 있어요.'},
};
export type DiagnosisDispatch={version:1;kind:'ensure_session';adminTest?:boolean;attemptId:string;subject:string;diagnosis:'myin-n6';releaseId:string;packageVersion:string};
export type DiagnosisReceipt={version:1;attemptId:string;subject:string;releaseId:string;responseId:string};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function validDispatch(v:unknown):v is DiagnosisDispatch {
 if(!v||typeof v!=='object')return false;
 const d=v as DiagnosisDispatch;
 return d.version===1&&d.kind==='ensure_session'&&d.diagnosis==='myin-n6'&&[d.attemptId,d.subject,d.releaseId].every(uuid)
  &&typeof d.packageVersion==='string'&&d.packageVersion.length>0&&d.packageVersion.length<=100;
}
/** Receiver must persist one session per attemptId; transport retries never imply a new diagnosis.
 * No timer/cron or external transport is enabled here. Activation is a separate integration gate. */
export async function deliverDiagnosisSessions({enabled=false,rpc,send,limit=5}:{enabled?:boolean;rpc:Rpc;send:(body:DiagnosisDispatch,options:{idempotencyKey:string;signal:AbortSignal})=>Promise<DiagnosisReceipt>;limit?:number}) {
 if(!enabled)return {claimed:0,accepted:0,deferred:0};
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid diagnosis batch size');
 async function call(name:string,args:Record<string,unknown>) {const r=await rpc(name,args);if(r.error)throw Error('Diagnosis delivery storage unavailable');return r.data;}
 let claimed=0,accepted=0,deferred=0;
 async function deliver(j:{id:string;lease:string}) {
  if(!uuid(j.id)||!uuid(j.lease))throw Error('Invalid diagnosis lease');
  const fence={p_job:j.id,p_lease:j.lease};
  try {
   const body=await call('edu_diagnosis_dispatch',fence);if(body===null){deferred++;return;}
   if(!validDispatch(body))throw Error('Invalid diagnosis dispatch');
   const result=await send(body,{idempotencyKey:`edu-n6:${body.attemptId}`,signal:AbortSignal.timeout(10_000)});
   if(!result||result.version!==1||result.attemptId!==body.attemptId||result.subject!==body.subject||result.releaseId!==body.releaseId||!uuid(result.responseId)) {
    await call('edu_diagnosis_retry',{...fence,p_code:'REMOTE_REJECTED'});deferred++;return;
   }
   const ack=await call('edu_diagnosis_ack',{...fence,p_response:result.responseId});
   if(ack===true)accepted++;else deferred++;
  } catch {
   // The remote may have committed before a timeout/lost acknowledgement.
   // Re-delivery uses the same attemptId, never another charged generation.
   await call('edu_diagnosis_retry',{...fence,p_code:'REMOTE_UNAVAILABLE'}).catch(()=>null);deferred++;
  }
 }
 // Acquire leases only for work that can start immediately. Claiming 20 jobs
 // then sending them serially could expire the 60-second leases before dispatch.
 while(claimed<limit) {
  const size=Math.min(5,limit-claimed);
  const jobs=await call('edu_diagnosis_claim',{p_limit:size});
  if(!Array.isArray(jobs)||jobs.length>size)throw Error('Invalid diagnosis claims');
  claimed+=jobs.length;
  await Promise.all((jobs as {id:string;lease:string}[]).map(deliver));
  if(jobs.length<size)break;
 }
 return {claimed,accepted,deferred};
}
