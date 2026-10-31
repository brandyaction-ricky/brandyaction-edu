import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
import { aiErrorReply } from '@/lib/curriculum-ai-server';
export const maxDuration=20;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function GET(request:Request){
 if(process.env.EDU_CURRICULUM_AI_ENABLED!=='true')return reply({error:'AI 질문 기능은 준비 중이에요.'},404);
 try{
  const actor=await getAuthenticatedUser();if(!actor)return reply({error:'로그인이 필요해요.'},401);
  const q=new URL(request.url).searchParams,enrollment=q.get('enrollment'),lesson=q.get('lesson'),before=q.get('before'),beforeId=q.get('beforeId');
  if((enrollment!==null || lesson!==null)&&(!uuid(enrollment)||!uuid(lesson)))return reply({error:'수업을 확인해 주세요.'},400);
  if((before!==null || beforeId!==null)&&(!before || !/^\d{4}-\d\d-\d\dT/.test(before)||!Number.isFinite(Date.parse(before))||!uuid(beforeId)))return reply({error:'기록 위치를 확인해 주세요.'},400);
  const result=await createAdminClient().rpc('edu_ai_student_history',{p_actor:actor.id,p_enrollment:enrollment,p_lesson:lesson,p_before:before,p_before_id:beforeId}).abortSignal(AbortSignal.timeout(10000));
  if(result.error)throw result.error;
  const data=result.data || {},key=enrollment?'items':'conversations',rows=Array.isArray(data[key])?data[key]:[];
  return reply({[key]:rows.slice(0,20),hasMore:rows.length>20});
 }catch(error){const e=aiErrorReply(error);return reply({error:e.error},e.status);}
}
