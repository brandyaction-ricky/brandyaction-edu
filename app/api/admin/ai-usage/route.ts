import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET(request:Request) {
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 try {
  const actor=await getOperatorUser('members'); if (!actor) return reply({error:'회원 관리 권한이 필요합니다.'},403);
  if (process.env.EDU_CURRICULUM_AI_ENABLED!=='true') return reply({error:'AI 사용량 집계는 준비 중입니다.'},404);
  const days=Number(new URL(request.url).searchParams.get('days') || 30);
  if (!Number.isInteger(days) || days<1 || days>90) return reply({error:'조회 기간을 확인해 주세요.'},400);
  const result=await createAdminClient().rpc('edu_ai_usage',{p_actor:actor.id,p_days:days}).abortSignal(AbortSignal.timeout(10000));
  if (result.error) throw result.error;
  return reply(result.data);
 } catch { return reply({error:'AI 사용량을 불러오지 못했습니다. 다시 시도해 주세요.'},503); }
}
