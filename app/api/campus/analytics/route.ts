import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {readSpaceJson} from '@/features/campus/space/body';
import {parseBatch} from '@/features/campus/analytics/domain';
import {publicWebinar,problem} from '@/features/campus/webinar/server';
import {fail} from '@/features/campus/webinar/domain';
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const body=parseBatch(await readSpaceJson(request,10000));let userId:string|null=null;
 if(body.scope==='member'){const user=await getAuthenticatedUser();if(!user)fail('로그인이 필요합니다.',401);userId=user.id;}
 else if(!await publicWebinar(body.scope))fail('공개된 행사가 아닙니다.',404);
 const r=await createAdminClient().rpc('edu_campus_record_activity',{p_id:body.id,p_session:body.session,p_scope:body.scope,p_user:userId,p_events:body.events,p_dwell:body.dwell}).abortSignal(AbortSignal.timeout(3000));
 if(r.error)throw r.error;return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 }catch(e){return problem(e);}}
