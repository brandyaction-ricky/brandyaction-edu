import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { accessFor, fail, loginPath } from '@/features/campus/webinar/domain';
import { readWebinar, privateReply, problem } from '@/features/campus/webinar/server';
export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}) {
 try{
  if(request.headers.get('sec-fetch-site')==='cross-site')fail('에듀에서 다시 열어 주세요.',403);
  const section=new URL(request.url).searchParams.get('section')||'space';
  if(!['space','community','office'].includes(section))fail('입장할 공간을 확인해 주세요.');
  const {slug}=await params,w=await readWebinar(slug);
  if(!w||w.status!=='published')fail('현재 공개된 행사가 아닙니다.',404);
  const user=await getAuthenticatedUser();if(!user)return privateReply({kind:'login',href:loginPath(slug)});
  const db=await createClient();
  const result=await db.from('enrollments').select('id,user_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at').eq('user_id',user.id).eq('cohort_id',w.cohortId).eq('status','active').limit(20).abortSignal(AbortSignal.timeout(5000));
  if(result.error)throw result.error;
  const access=accessFor(result.data||[],user.id,w.cohortId);
  return privateReply(access.kind==='member'?{...access,href:access.href+'&section='+section}:access);
 }catch(e){return problem(e);}
}
