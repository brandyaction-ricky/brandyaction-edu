import {getAuthenticatedUser} from '@/lib/server-auth';
import {createClient} from '@/lib/supabase/server';

import {readSpaceJson} from '@/features/campus/space/body';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail,uuid} from '@/features/campus/webinar/domain';
import {BotOfficeModel,type BotDocument} from '@/public/campus/world/office/bot-profile.mjs';
import {hasOfficePilot} from '@/features/campus/office/pilot';
async function access(enrollment:unknown, includePilot=false) {
 if(process.env.EDU_CAMPUS_ENABLED!=='true')fail('공간이 준비 중입니다.',404);
 if(!uuid(enrollment))fail('수강권을 확인해 주세요.');
 const user=await getAuthenticatedUser();if(!user)fail('로그인이 필요합니다.',401);
 const enabled=process.env.EDU_CAMPUS_OFFICE_ENABLED==='true';
 const pilot=(!enabled || includePilot) && await hasOfficePilot(enrollment);
 if(!enabled&&!pilot)fail('공간이 준비 중입니다.',404);
 const db=await createClient();
 const scope=await db.rpc('edu_campus_office_access',{p_enrollment:enrollment});
 if(scope.error)throw scope.error;
 if(!scope.data)fail('이용 가능한 수강권을 선택해 주세요.',403);
 return {db,user,pilot};
}
export async function GET(request:Request){try{const params=new URL(request.url).searchParams;
 const{db,user,pilot}=await access(params.get('enrollmentId'),!params.has('directory')&&!params.has('desks'));
 if(params.has('directory')){
  let q=db.from('edu_campus_office_employees').select('employee_id,profile').eq('owner_id',user.id).order('employee_id').limit(25);
  const after=params.get('after');if(after)q=q.gt('employee_id',after);
  const {data,error}=await q;if(error)throw error;
  return privateReply({employees:data.slice(0,24).map(r=>r.profile),next:data.length>24?data[23].employee_id:null});
 }
 const r=await db.from('edu_campus_personal_offices').select('document,revision,updated_at').eq('owner_id',user.id).maybeSingle();if(r.error)throw r.error;
 const office=r.data||{document:new BotOfficeModel().getDocument(),revision:null,updated_at:null};
 if(!params.has('desks'))return privateReply({...office,pilot});
 const employees=(office.document as BotDocument).profiles.filter(profile=>profile.seatIndex>0);
 const desks=await Promise.all(employees.map(async profile=>{
   const {data,error}=await db.from('edu_campus_office_jobs').select('id,status')
     .eq('owner_id',user.id).eq('enrollment_id',params.get('enrollmentId')).eq('employee_id',profile.employeeId)
     .in('status',['running','review']).order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
   if(error)throw error;
   return data?{employeeId:profile.employeeId,jobId:data.id,status:data.status}:null;
 }));
 return privateReply({document:office.document,desks:desks.filter(Boolean)});}catch(e){return problem(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const body=await readSpaceJson(request,18000);if(body.action==='register'){
  const {db,user}=await access(body.enrollmentId);let profile;
  try{profile=new BotOfficeModel().saveEmployee({name:body.name,telegramInput:body.telegram,duties:body.duties}).profiles[1];}catch{fail('직원 이름과 텔레그램 주소를 확인해 주세요.');}
  const r=await db.from('edu_campus_office_employees').insert({owner_id:user.id,employee_id:profile.employeeId,profile});
  if(r.error?.code==='23505')fail('이미 등록한 텔레그램 봇입니다.',409);if(r.error)throw r.error;return privateReply({employee:profile},201);
 }
 if(Object.keys(body).some(k=>!['enrollmentId','document','revision','expectedRevision'].includes(k))||!uuid(body.revision)||body.expectedRevision!==null&&!uuid(body.expectedRevision))fail('저장 요청을 확인해 주세요.');
 const{db,user}=await access(body.enrollmentId);let document;try{document=new BotOfficeModel().restore(body.document);}catch{fail('직원 이름·텔레그램 주소·좌석을 확인해 주세요.');}
 const row={owner_id:user.id,document,revision:body.revision,updated_at:new Date().toISOString()};
 const r=body.expectedRevision===null?await db.from('edu_campus_personal_offices').insert(row).select('document,revision,updated_at').maybeSingle():await db.from('edu_campus_personal_offices').update(row).eq('owner_id',user.id).eq('revision',body.expectedRevision).select('document,revision,updated_at').maybeSingle();
 if(r.error&&r.error.code!=='23505')throw r.error;if(r.error||!r.data)fail('다른 창에서 직원 목록이 바뀌었어요. 새로고침 후 다시 저장해 주세요.',409);
 return privateReply(r.data);
 }catch(e){return problem(e);}}
