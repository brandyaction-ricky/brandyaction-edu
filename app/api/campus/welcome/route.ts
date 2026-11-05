import {getAuthenticatedUser} from '@/lib/server-auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {campusEntry} from '@/features/campus/entry';
import {readSpaceJson} from '@/features/campus/space/body';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail,uuid} from '@/features/campus/webinar/domain';
import {WELCOME_USER_PREFIX,mergeWelcomeState,type WelcomeUserState} from '@/features/campus/welcome/progress';
import {tourAvatar} from '@/features/campus/tour/appearance';
async function access(enrollmentId:unknown){
 if(process.env.EDU_CAMPUS_ENABLED!=='true')fail('공간이 준비 중입니다.',404);
 const user=await getAuthenticatedUser();if(!user||user.status!=='active')fail('로그인이 필요합니다.',401);if(!uuid(enrollmentId))fail('수강권을 확인해 주세요.');
 const db=await createClient(),r=await db.from('enrollments').select('id,user_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at,courses(status,archived_at),cohorts(archived_at)').eq('id',enrollmentId).eq('user_id',user.id).maybeSingle();
 if(r.error)throw r.error;const e=r.data,c=e&&(Array.isArray(e.courses)?e.courses[0]:e.courses),h=e&&(Array.isArray(e.cohorts)?e.cohorts[0]:e.cohorts);
 if(!e||!campusEntry(e,user.id,e.cohort_id)||c?.status!=='published'||c.archived_at||!h||h.archived_at)fail('이용 가능한 수강권이 필요합니다.',403);
 return {user,db};
}
async function read(userId:string){const r=await createAdminClient().from('site_settings').select('value').eq('key',WELCOME_USER_PREFIX+userId).eq('is_public',false).maybeSingle();if(r.error)throw r.error;return (r.data?.value||null) as WelcomeUserState|null;}
export async function GET(request:Request){try{
 const {user,db}=await access(new URL(request.url).searchParams.get('enrollmentId'));
 const [state,profile]=await Promise.all([read(user.id),db.from('edu_campus_space_profiles').select('nickname,gender,coat,avatar_model,hair_color,skin_color,pants_color,held_item').eq('user_id',user.id).maybeSingle()]);if(profile.error)throw profile.error;
 const p=profile.data;const avatar=p?tourAvatar({...p,model:p.avatar_model,hairColor:p.hair_color,skinColor:p.skin_color,pantsColor:p.pants_color,heldItem:p.held_item}):state?.avatar;
 return privateReply({state,avatar:avatar||null,avatarChosen:!!avatar});
}catch(e){return problem(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const b=await readSpaceJson(request,12000),{user,db}=await access(b.enrollmentId);
 if(Object.keys(b).some(k=>!['kind','enrollmentId','avatar','assessmentKey','progress'].includes(k)))fail('저장 요청을 확인해 주세요.');
 // Validate before making either write. A saved avatar remains valid if the later state write needs retrying.
 mergeWelcomeState(null,b,crypto.randomUUID());
 if(b.kind==='avatar'){
  const a=tourAvatar(b.avatar),found=await db.from('edu_campus_space_profiles').select('user_id').eq('user_id',user.id).maybeSingle();if(found.error)throw found.error;const fields={nickname:a.nickname,gender:a.gender,coat:a.coat,avatar_model:a.model,hair_color:a.hairColor,skin_color:a.skinColor,pants_color:a.pantsColor,held_item:a.heldItem};const r=found.data?await db.from('edu_campus_space_profiles').update(fields).eq('user_id',user.id):await db.from('edu_campus_space_profiles').insert({user_id:user.id,status:'joinable',...fields});if(r.error)throw r.error;
 }
 const admin=createAdminClient();
 for(let attempt=0;attempt<3;attempt++){
  const current=await read(user.id),state=mergeWelcomeState(current,b,crypto.randomUUID()),row={value:state,is_public:false,updated_by:user.id,updated_at:new Date().toISOString()},key=WELCOME_USER_PREFIX+user.id;
  const r=current?await admin.from('site_settings').update(row).eq('key',key).eq('is_public',false).eq('value->>revision',current.revision).select('key').maybeSingle():await admin.from('site_settings').insert({key,...row}).select('key').maybeSingle();
  if(r.data&&!r.error)return privateReply({state});if(r.error&&r.error.code!=='23505')throw r.error;
 }
 fail('다른 기기에서 변경 중입니다. 잠시 후 다시 저장해 주세요.',409);
}catch(e){return problem(e);}}
