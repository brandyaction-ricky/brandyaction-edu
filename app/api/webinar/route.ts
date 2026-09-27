import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { POLICY_VERSION } from '@/lib/legal-policies';
import { conversionCapabilities, conversionDatabaseError, conversionError, conversionId } from '@/lib/conversion-review-server';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handle(request:Request,write:boolean) {
 try {
  if(!conversionCapabilities(process.env).enabled) conversionError('신청 링크를 확인해 주세요.',404);
  if(write && request.headers.get('origin')!==new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.',403);
  const user=await getAuthenticatedUser();
  let body;
  if(write) {
   if(!user) conversionError('로그인이 필요합니다.',401);
   const raw=await request.text();if(raw.length>1000) conversionError('입력을 확인해 주세요.',413);
   try{body=JSON.parse(raw);}catch{conversionError('입력을 확인해 주세요.');}
   if(!body || body.agreed!==true || body.policy!==POLICY_VERSION || !Number.isSafeInteger(body.expected) || body.expected<1) conversionError('현재 약관을 확인하고 동의해 주세요.');
  }
  const params=new URL(request.url).searchParams;
  const code=conversionId(write?body.code:params.get('code'));
  const channel=write?body.channel:params.get('channel');
  if(!['paid','organic','unknown'].includes(channel)) conversionError('신청 링크를 확인해 주세요.');
  const {data,error}=await createAdminClient().rpc('edu_webinar_application',{p_code:code,p_user:user?.id??null,p_channel:channel,p_register:write,p_expected:write?body.expected:null,p_policy:write?POLICY_VERSION:null});
  if(error) conversionDatabaseError(error);
  return reply({...data,authenticated:!!user,policy:POLICY_VERSION});
 }catch(e){const status=Number((e as {status?:number})?.status||503);return reply({error:status===503?'신청 정보를 확인하지 못했습니다. 다시 시도해 주세요.':(e as Error).message},status);}
}
export const GET=(request:Request)=>handle(request,false);
export const POST=(request:Request)=>handle(request,true);
