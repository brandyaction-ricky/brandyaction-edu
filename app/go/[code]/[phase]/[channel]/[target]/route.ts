import { createAdminClient } from '@/lib/supabase/admin';
import { conversionCapabilities, conversionId, conversionError, conversionDatabaseError } from '@/lib/conversion-review-server';
import { recordBroadcastRequest } from '@/lib/broadcast-entry';
import { youtubeLiveUrl } from '@/lib/webinar-attendance';
export const dynamic='force-dynamic';
type Context={params:Promise<{code:string;phase:string;channel:string;target:string}>};
async function handle(request:Request,context:Context){
 const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
 try{
  if(!conversionCapabilities(process.env).enabled)conversionError('링크가 준비되지 않았습니다.',404);
  const {code,phase,channel,target}=await context.params;
  if(!['first','encore'].includes(phase)||!['paid','organic','unknown'].includes(channel)||!['live','offer'].includes(target))conversionError('링크를 확인해 주세요.',404);
  const {data,error}=await createAdminClient().rpc('edu_broadcast_destination',{p_code:conversionId(code),p_phase:phase,p_channel:channel,p_target:target,p_record:recordBroadcastRequest(request)});
  if(error)conversionDatabaseError(error);
  const url=data?.url;
  const valid=typeof url==='string'&&(target==='live'?youtubeLiveUrl(url)===url:/^\/classes\/[0-9a-f-]{36}$/i.test(url));
  if(!valid)throw new Error('Invalid destination');
  return new Response(null,{status:302,headers:{...headers,Location:url}});
 }catch(e){const status=Number((e as {status?:number})?.status||503);return new Response(request.method==='HEAD'?null:'방송 또는 교육 안내 링크가 아직 준비되지 않았거나 중지되었습니다.',{status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});}
}
export const GET=handle;
export const HEAD=handle;
