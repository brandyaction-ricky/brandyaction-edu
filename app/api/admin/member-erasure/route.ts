import {getAuthenticatedUser} from '@/lib/server-auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {uuid} from '@/lib/edu-workflows';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET() {
  const user=await getAuthenticatedUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
  if(user.role!=='admin')return reply({error:'관리자만 이용할 수 있습니다.'},403);
  const r=await createAdminClient().rpc('edu_read_member_erasure',{p_actor:user.id});
  if(r.error||!Array.isArray(r.data))return reply({error:'탈퇴 요청 기록을 불러오지 못했습니다.'},503);
  return reply({rows:r.data,enabled:process.env.EDU_DIAGNOSIS_ERASURE_ENABLED==='true'});
}
export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'요청 출처를 확인해 주세요.'},403);
  const user=await getAuthenticatedUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
  if(user.role!=='admin')return reply({error:'관리자만 이용할 수 있습니다.'},403);
  // Browser retries only requeue the saved ID. They never choose a remote subject or environment.
  if(process.env.EDU_DIAGNOSIS_ERASURE_ENABLED!=='true')return reply({error:'삭제 연동 검수 전입니다. 현재는 접수만 기록합니다.'},409);
  const reader=request.body?.getReader();if(!reader)return reply({error:'요청 번호를 확인해 주세요.'},400);
  const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>1024){await reader.cancel();return reply({error:'입력 내용이 너무 깁니다.'},413);}parts.push(item.value);}}finally{reader.releaseLock();}
  const raw=Buffer.concat(parts).toString('utf8');
  let input;try{input=JSON.parse(raw);}catch{return reply({error:'요청 번호를 확인해 주세요.'},400);}
  if(!input||Object.keys(input).length!==1||!uuid(input.requestId))return reply({error:'요청 번호를 확인해 주세요.'},400);
  const r=await createAdminClient().rpc('edu_retry_member_erasure',{p_actor:user.id,p_request:input.requestId});
  if(r.error)return reply({error:'재시도할 상태가 아닙니다. 목록을 새로고침해 주세요.'},409);
  return reply({ok:true},202);
}
