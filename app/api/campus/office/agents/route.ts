import {getAuthenticatedUser} from '@/lib/server-auth';
import {createClient} from '@/lib/supabase/server';
import {loadCampusSnapshot} from '@/features/campus/repository';
import {readSpaceJson} from '@/features/campus/space/body';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail,uuid} from '@/features/campus/webinar/domain';
import {BotOfficeModel} from '@/public/campus/world/office/bot-profile.mjs';
import {hasOfficePilot} from '@/features/campus/office/pilot';
async function access(enrollment:unknown){const pilot=await hasOfficePilot(enrollment);if(process.env.EDU_CAMPUS_ENABLED!=='true'||(process.env.EDU_CAMPUS_OFFICE_ENABLED!=='true'&&!pilot))fail('공간이 준비 중입니다.',404);if(!uuid(enrollment))fail('수강권을 확인해 주세요.');const user=await getAuthenticatedUser();if(!user)fail('로그인이 필요합니다.',401);const db=await createClient();await loadCampusSnapshot(db,user,enrollment);return{db,user,pilot};}
export async function GET(request:Request){try{const{db,user,pilot}=await access(new URL(request.url).searchParams.get('enrollmentId'));const r=await db.from('edu_campus_personal_offices').select('document,revision,updated_at').eq('owner_id',user.id).maybeSingle();if(r.error)throw r.error;return privateReply({...r.data,document:r.data?.document??new BotOfficeModel().getDocument(),revision:r.data?.revision??null,updated_at:r.data?.updated_at??null,pilot});}catch(e){return problem(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const body=await readSpaceJson(request,18000);if(Object.keys(body).some(k=>!['enrollmentId','document','revision','expectedRevision'].includes(k))||!uuid(body.revision)||body.expectedRevision!==null&&!uuid(body.expectedRevision))fail('저장 요청을 확인해 주세요.');
 const{db,user}=await access(body.enrollmentId);let document;try{document=new BotOfficeModel().restore(body.document);}catch{fail('직원 이름·텔레그램 주소·좌석을 확인해 주세요.');}
 const row={owner_id:user.id,document,revision:body.revision,updated_at:new Date().toISOString()};
 const r=body.expectedRevision===null?await db.from('edu_campus_personal_offices').insert(row).select('document,revision,updated_at').maybeSingle():await db.from('edu_campus_personal_offices').update(row).eq('owner_id',user.id).eq('revision',body.expectedRevision).select('document,revision,updated_at').maybeSingle();
 if(r.error&&r.error.code!=='23505')throw r.error;if(r.error||!r.data)fail('다른 창에서 직원 목록이 바뀌었어요. 새로고침 후 다시 저장해 주세요.',409);
 return privateReply(r.data);
 }catch(e){return problem(e);}}
