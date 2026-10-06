import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
import { DiagnosisBridgeError } from '@/lib/diagnosis-bridge';
import { sendAdminDiagnosis } from '@/lib/diagnosis-admin-bridge';
import { runDiagnosisAdmin } from '@/lib/diagnosis-admin-service';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Robots-Tag':'noindex, nofollow'}});
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
async function handle(request:Request,write:boolean){
  if(process.env.EDU_MYIN_DIAGNOSIS_ENABLED!=='true')return reply({error:'진단 기능을 준비 중입니다.'},404);
  try{
    if(write&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'요청 출처를 확인해 주세요.'},403);
    const actor=await getAuthenticatedUser();if(!actor)return reply({error:'로그인이 필요합니다.'},401);if(actor.role!=='admin')return reply({error:'관리자만 이용할 수 있습니다.'},403);
    let input:Record<string,unknown>;
    if(!write){const query=new URL(request.url).searchParams;const before=query.get('before'),member=query.get('member'),search=query.get('query')??'';
      if((before&&!uuid(before))||(member!==null&&!uuid(member))||search.length>100)return reply({error:'조회 조건을 확인해 주세요.'},400);input={action:'list',before,query:search,...(member?{member}:{})};
    }else{
      const reader=request.body?.getReader();if(!reader)return reply({error:'입력 내용을 확인해 주세요.'},400);let size=0;const parts:Uint8Array[]=[];
      try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>4096){await reader.cancel();return reply({error:'입력 내용이 너무 깁니다.'},413);}parts.push(p.value);}}finally{reader.releaseLock();}
      try{input=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return reply({error:'입력 내용을 확인해 주세요.'},400);}
      if(!input||Array.isArray(input)||!uuid(input.requestId))return reply({error:'입력 내용을 확인해 주세요.'},400);
      const publish=['publish_all','publish_member'].includes(String(input.action));
      const keys=publish?['action','requestId','userId','enabled','revision']:['action','requestId','attemptId','expectedVersion','retryMode'];
      if(Object.keys(input).some(k=>!keys.includes(k))||(publish?(typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.revision)||Number(input.revision)<0||(input.action==='publish_member'?!uuid(input.userId):input.userId!=null)):(input.action!=='retry'||(input.retryMode!==undefined&&!['resume','rewrite'].includes(String(input.retryMode)))||!uuid(input.attemptId)||typeof input.expectedVersion!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedVersion))))return reply({error:'입력 내용을 확인해 주세요.'},400);
    }
    const db=createAdminClient();const result=await runDiagnosisAdmin({actor,rpc:async(name,args)=>await db.rpc(name,args).abortSignal(AbortSignal.timeout(10_000)),send:sendAdminDiagnosis},input);
    return reply(result,write&&input.action==='retry'?202:200);
  }catch(e){const code=e instanceof DiagnosisBridgeError?e.code:'UNAVAILABLE';const messages:Record<string,string>={FORBIDDEN:'관리자 권한이나 수강 정보를 다시 확인해 주세요.',CONFLICT:'다른 화면에서 상태가 바뀌었습니다. 새로고침 후 다시 선택해 주세요.',RETRY_BLOCKED:'이미 처리 중이거나 추가 확인이 필요한 보고서입니다. 오류 기록을 확인해 주세요.',INVALID:'입력 내용을 확인해 주세요.',UNAVAILABLE:'진단 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'};return reply({code,error:messages[code]??messages.UNAVAILABLE},e instanceof DiagnosisBridgeError?e.status:503);}
}
