import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionCapabilities, conversionError, conversionId, conversionDatabaseError } from '@/lib/conversion-review-server';
import { crmDeliveryState } from '@/lib/crm-delivery';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(request:Request,write:boolean){
 try{
  if(!conversionCapabilities(process.env).enabled)conversionError('기능이 활성화되지 않았습니다.',404);
  if(write&&request.headers.get('origin')!==new URL(request.url).origin)conversionError('요청 출처를 확인해 주세요.',403);
  const actor=await getOperatorUser('marketing');
  if(!actor||!actor.permissions.products||!actor.permissions.members||!actor.permissions.orders)conversionError('마케팅·상품·회원·주문 권한이 필요합니다.',403);
  let body:Record<string,unknown>;
  if(write){
   const raw=await request.text();if(raw.length>3000)conversionError('입력 내용이 너무 큽니다.',413);
   try{body=JSON.parse(raw);}catch{conversionError('입력을 확인해 주세요.');}
   if(!body||Array.isArray(body)||typeof body!=='object')conversionError('입력을 확인해 주세요.');
  }else body=Object.fromEntries(new URL(request.url).searchParams);
  const code=conversionId(body.code),template=conversionId(body.template,false);
  const purpose=String(body.purpose||'encore');if(!['offer','encore'].includes(purpose))conversionError('안내 목적을 확인해 주세요.');
  let schedule=null;
  if(write){
   if(body.cancel){schedule={cancel:conversionId(body.cancel)};if(template)conversionError('취소 요청을 확인해 주세요.');}
   else{
    if(!template||typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.token!=='string'||!/^[a-f0-9]{32}$/.test(body.token)||typeof body.at!=='string'||!Number.isFinite(Date.parse(body.at)))conversionError('대상을 다시 검토하고 예약 정보를 확인해 주세요.');
    schedule={name:body.name.trim(),token:body.token,at:body.at};
   }
  }
  const {data,error}=await createAdminClient().rpc('edu_prepare_recruitment_delivery',{p_actor:actor.id,p_code:code,p_template:template,p_purpose:purpose,p_schedule:schedule});
  if(error){
   if(error.message?.includes('CONVERSION_STALE'))conversionError('대상·문구가 변경됐거나 같은 목적의 예약이 있습니다. 다시 확인해 주세요.',409);
   if(error.message?.includes('CONVERSION_UNAVAILABLE'))conversionError('모집 활성화와 유료 상품 공개 상태를 확인해 주세요.',409);
   conversionDatabaseError(error);
  }
  return reply({...data,delivery:crmDeliveryState()});
 }catch(e){const status=Number((e as {status?:number})?.status||503);return reply({error:status===503?'모집 안내 발송 준비 상태를 확인하지 못했습니다.':(e as Error).message},status);}
}
export const GET=(request:Request)=>handle(request,false);
export const POST=(request:Request)=>handle(request,true);
