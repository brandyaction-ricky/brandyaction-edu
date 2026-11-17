import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {readSpaceJson} from '@/features/campus/space/body';
import {fail,slugPattern} from '@/features/campus/webinar/domain';
export async function GET(request:Request){try{
 if(!await getOperatorUser('marketing'))fail('분석 조회 권한이 필요합니다.',403);
 const q=new URL(request.url).searchParams,from=Date.parse(q.get('from')||''),to=Date.parse(q.get('to')||''),scope=q.get('scope')||null;
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>93*86400000||scope&&!slugPattern.test(scope))fail('조회 기간은 93일 이내로 선택해 주세요.');
 const db=createAdminClient();const [r,setting]=await Promise.all([db.rpc('edu_campus_activity_report',{p_from:new Date(from).toISOString(),p_to:new Date(to).toISOString(),p_scope:scope}).abortSignal(AbortSignal.timeout(10000)),db.from('edu_campus_analytics_settings').select('enabled').eq('id',true).maybeSingle()]);
 if(r.error||setting.error)throw r.error||setting.error;
 return privateReply({...r.data,trackingEnabled:setting.data?.enabled===true});
 }catch(e){return problem(e);}}

export async function PATCH(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const user=await getOperatorUser('marketing');if(!user)fail('분석 관리 권한이 필요합니다.',403);
 const body=await readSpaceJson(request,512);
 if(Object.keys(body).length!==1||typeof body.enabled!=='boolean')fail('수집 설정을 확인해 주세요.');
 const r=await createAdminClient().from('edu_campus_analytics_settings').update({enabled:body.enabled,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',true).select('enabled').abortSignal(AbortSignal.timeout(5000)).single();
 if(r.error)throw r.error;return privateReply({trackingEnabled:r.data.enabled});
 }catch(e){return problem(e);}}
