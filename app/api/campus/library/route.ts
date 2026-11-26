import {readWelcome} from '@/features/campus/welcome/server';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {hasLearningAccess} from '@/lib/platform-rules';
import {externalPartnerScope} from '@/lib/external-partner-access';
import {uuid} from '@/features/campus/webinar/domain';
import {privateReply,problem} from '@/features/campus/webinar/server';
export async function GET(request:Request){try{
 if(process.env.EDU_CAMPUS_ENABLED!=='true')return privateReply({error:'준비 중입니다.'},404);
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return privateReply({error:'허용되지 않은 요청입니다.'},403);
 const user=await getAuthenticatedUser();if(!user)return privateReply({error:'로그인이 필요합니다.'},401);
 const id=new URL(request.url).searchParams.get('enrollmentId');if(!uuid(id))return privateReply({error:'수강권을 확인해 주세요.'},400);
 const db=createAdminClient(),result=await db.from('enrollments').select('id,cohort_id,status,revoked_at,access_starts_at,access_ends_at').eq('id',id).eq('user_id',user.id).maybeSingle();
 if(result.error)throw result.error;
 const cohort = result.data ? (hasLearningAccess(result.data) ? result.data.cohort_id : null) : (await externalPartnerScope(user.id, id, db))?.cohort_id;
 if (!cohort) return privateReply({error:'현재 이용 가능한 캠퍼스 권한이 없습니다.'},403);
 const welcome=await readWelcome(cohort);
 return privateReply({resources:welcome.resources,welcome:welcome.settings,content:welcome.content});
}catch(e){return problem(e);}}
