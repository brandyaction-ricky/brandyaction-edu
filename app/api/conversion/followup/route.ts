import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionCapabilities, conversionError, conversionId, conversionDatabaseError } from '@/lib/conversion-review-server';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(request:Request,write:boolean){
 try{
  if(!conversionCapabilities(process.env).enabled)conversionError('기능이 활성화되지 않았습니다.',404);
  if(write&&request.headers.get('origin')!==new URL(request.url).origin)conversionError('요청 출처를 확인해 주세요.',403);
  const actor=await getOperatorUser('marketing');if(!actor?.permissions.products)conversionError('마케팅·상품 권한이 필요합니다.',403);
  let body;let settings=null;
  if(write){
   const raw=await request.text();if(raw.length>6000)conversionError('입력 내용이 너무 큽니다.',413);
   try{body=JSON.parse(raw);}catch{conversionError('입력을 확인해 주세요.');}
   if(!body||!['room','direct'].includes(body.channel)||!['offer','encore'].includes(body.purpose)||typeof body.body!=='string'||!body.body.trim()||body.body.trim().length>2000||!Number.isSafeInteger(body.expected)||body.expected<0)conversionError('채널·목적·안내 초안을 확인해 주세요.');
   if(body.channel==='direct'&&(!actor.permissions.members||!actor.permissions.orders))conversionError('개별 안내 준비에는 회원·주문 권한도 필요합니다.',403);
   settings={channel:body.channel,purpose:body.purpose,body:body.body.trim(),expected:body.expected};
  }
  const code=conversionId(write?body.code:new URL(request.url).searchParams.get('code'));
  const {data,error}=await createAdminClient().rpc('edu_manage_webinar_followup',{p_actor:actor.id,p_code:code,p_settings:settings});
  if(error){if(error.message?.includes('CONVERSION_STALE'))conversionError('다른 운영자가 초안을 변경했습니다. 다시 불러와 주세요.',409);conversionDatabaseError(error);}
  return reply(data);
 }catch(e){const status=Number((e as {status?:number})?.status||503);return reply({error:status===503?'후속 안내 준비 상태를 확인하지 못했습니다.':(e as Error).message},status);}
}
export const GET=(request:Request)=>handle(request,false);
export const POST=(request:Request)=>handle(request,true);
