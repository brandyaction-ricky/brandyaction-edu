import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail,slugPattern} from '@/features/campus/webinar/domain';
export async function GET(request:Request){try{
 if(!await getOperatorUser('marketing'))fail('분석 조회 권한이 필요합니다.',403);
 const q=new URL(request.url).searchParams,from=Date.parse(q.get('from')||''),to=Date.parse(q.get('to')||''),scope=q.get('scope')||null;
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>93*86400000||scope&&!slugPattern.test(scope))fail('조회 기간은 93일 이내로 선택해 주세요.');
 const db=createAdminClient();const [r,setting]=await Promise.all([db.rpc('edu_campus_activity_report',{p_from:new Date(from).toISOString(),p_to:new Date(to).toISOString(),p_scope:scope}).abortSignal(AbortSignal.timeout(10000)),db.from('site_settings').select('value').eq('key','edu_operations').maybeSingle()]);
 if(r.error||setting.error)throw r.error||setting.error;
 return privateReply({...r.data,trackingEnabled:setting.data?.value?.trackingEnabled===true});
 }catch(e){return problem(e);}}
