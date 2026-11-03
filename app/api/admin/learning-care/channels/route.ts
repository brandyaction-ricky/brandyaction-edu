import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { careDeliveryConfiguration } from '@/lib/learning-care-delivery-server';
const reply = (data: unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function GET(request: Request) {
  try {
    const user=await getAuthenticatedUser();
    if(!user || !await getOperatorUser('members',user)) return reply({error:'회원 관리 권한이 필요합니다.'},403);
    const params=new URL(request.url).searchParams, requestId=params.get('request');
    if(requestId){
      if(!uuid(requestId))return reply({error:'발송 기록을 확인해 주세요.'},400);
      const {data,error}=await createAdminClient().rpc('edu_care_delivery_receipt',{p_actor:user.id,p_request:requestId}).abortSignal(AbortSignal.timeout(10000));
      if(error)throw error;return data?reply(data):reply({error:'이 계정의 발송 기록이 없습니다.'},404);
    }
    const members=[...new Set((params.get('members') || '').split(','))];
    if(!members.length || members.length>100 || !members.every(uuid))return reply({error:'수강생을 다시 선택해 주세요.'},400);
    const config=await careDeliveryConfiguration();
    if(!config.enabled)return reply({config,reach:[]});
    const {data,error}=await createAdminClient().rpc('edu_care_channel_reach',{p_actor:user.id,p_members:members}).abortSignal(AbortSignal.timeout(10000));
    if(error)throw error;return reply({config,reach:data});
  } catch {return reply({error:'연락 수단을 확인하지 못했습니다. 다시 확인해 주세요.'},503);}
}
