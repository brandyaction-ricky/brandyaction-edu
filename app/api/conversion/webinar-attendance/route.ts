import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionCapabilities, conversionError, conversionId } from '@/lib/conversion-review-server';
import { attendanceError } from '@/lib/webinar-attendance-server';
import { livePhase, youtubeLiveUrl } from '@/lib/webinar-attendance';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(request:Request,write:boolean) {
 try {
  if(!conversionCapabilities(process.env).enabled) conversionError('기능이 활성화되지 않았습니다.',404);
  if(write&&request.headers.get('origin')!==new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.',403);
  if(write) conversionError('출석 접수 대신 방송·교육 안내 링크 설정을 사용해 주세요.',410);
  const actor=await getOperatorUser('marketing');
  if(!actor?.permissions.products) conversionError('마케팅·상품 권한이 필요합니다.',403);
  let body; let settings=null;
  if(write){
   const raw=await request.text();if(raw.length>2000)conversionError('입력 내용이 너무 큽니다.',413);
   try{body=JSON.parse(raw);}catch{conversionError('입력을 확인해 주세요.');}
   if(!body||typeof body.open!=='boolean'||!Number.isSafeInteger(body.expected)||body.expected<0)conversionError('입력을 확인해 주세요.');
   try{settings={phase:livePhase(body.phase),url:youtubeLiveUrl(body.url),open:body.open,expected:body.expected};}catch{conversionError('라이브 구분과 YouTube 영상 주소를 확인해 주세요.');}
   if(settings.open&&!settings.url)conversionError('출석 접수를 열려면 YouTube 주소가 필요합니다.');
  }
  const code=conversionId(write?body.code:new URL(request.url).searchParams.get('code'));
  const {data,error}=await createAdminClient().rpc('edu_manage_webinar_attendance',{p_actor:actor.id,p_code:code,p_settings:settings});
  if(error)attendanceError(error);return reply(data);
 }catch(e){const status=Number((e as {status?:number})?.status||503);return reply({error:status===503?'라이브 설정을 확인하지 못했습니다.':(e as Error).message},status);}
}
export const GET=(request:Request)=>handle(request,false);
export const POST=(request:Request)=>handle(request,true);
