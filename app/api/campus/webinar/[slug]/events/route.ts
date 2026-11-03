import { createAdminClient } from '@/lib/supabase/admin';
import { isTestRequest } from '@/lib/landing';
import { readSpaceJson } from '@/features/campus/space/body';
import { eventNames, uuid, fail } from '@/features/campus/webinar/domain';
import { publicWebinar, problem } from '@/features/campus/webinar/server';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
  if(isTestRequest(request.headers.get('cookie')))return new Response(null,{status:204});
  const body=await readSpaceJson(request,1024);
  if(!uuid(body.session)||!eventNames.includes(body.event as typeof eventNames[number])||Object.keys(body).some(k=>!['session','event'].includes(k)))fail('기록 형식을 확인해 주세요.');
  const {slug}=await params;if(!await publicWebinar(slug))fail('공개된 행사가 아닙니다.',404);
  const result=await createAdminClient().rpc('edu_record_event',{p_session:body.session,p_user:null,p_event:body.event==='entry'?'page_view':'click',p_path:'/campus/live/'+slug,p_target:null,p_metadata:{campaign:slug,source:'campus',medium:'webinar',webinar_action:body.event}}).abortSignal(AbortSignal.timeout(3000));
  if(result.error)throw result.error;
  return new Response(null,{status:204});
 }catch(e){return problem(e);}
}
