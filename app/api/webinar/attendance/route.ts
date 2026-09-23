import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { conversionCapabilities, conversionError, conversionId } from '@/lib/conversion-review-server';
import { attendanceError } from '@/lib/webinar-attendance-server';
import { livePhase } from '@/lib/webinar-attendance';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(request:Request,write:boolean){
 try{
  if(!conversionCapabilities(process.env).enabled)conversionError('기능이 활성화되지 않았습니다.',404);
  if(write&&request.headers.get('origin')!==new URL(request.url).origin)conversionError('요청 출처를 확인해 주세요.',403);
  const user=await getAuthenticatedUser();if(!user)conversionError('로그인이 필요합니다.',401);
  let body;let phase=null;
  if(write){
   const raw=await request.text();if(raw.length>1000)conversionError('입력을 확인해 주세요.',413);
   try{body=JSON.parse(raw);}catch{conversionError('입력을 확인해 주세요.');}
   if(!body||!Number.isSafeInteger(body.expected)||body.expected<1)conversionError('라이브 설정을 새로고침해 주세요.');
   try{phase=livePhase(body.phase);}catch{conversionError('라이브 구분을 확인해 주세요.');}
  }
  const code=conversionId(write?body.code:new URL(request.url).searchParams.get('code'));
  const {data,error}=await createAdminClient().rpc('edu_webinar_attendance',{p_code:code,p_user:user.id,p_phase:phase,p_expected:write?body.expected:null});
  if(error)attendanceError(error);return reply(data);
 }catch(e){const status=Number((e as {status?:number})?.status||503);return reply({error:status===503?'출석 정보를 확인하지 못했습니다.':(e as Error).message},status);}
}
export const GET=(request:Request)=>handle(request,false);
export const POST=()=>reply({error:'별도 출석 체크는 더 이상 사용하지 않습니다. 카톡방의 방송 안내 링크를 이용해 주세요.'},410);
