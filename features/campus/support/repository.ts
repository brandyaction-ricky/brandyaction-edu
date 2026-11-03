import type { createClient } from '@/lib/supabase/server';
import { analyzeSupport } from './analytics';
import {parseReviewPlan} from './review-planning';
import {analyzeSupportDepth,type SupportDepthInput} from './depth-analytics';
import { hasLearningAccess } from '@/lib/platform-rules';
import { campusError } from '../snapshot';
import { id, text, parseIntake, parsePreferences, parseSession, initialPreferences, supportMetrics, type SupportState, type SupportRequest } from './domain';
type Database=Awaited<ReturnType<typeof createClient>>;
type Row=Record<string,unknown> & {id:string};
type Result={data:unknown;error:unknown;count?:number|null};
const unavailable=()=>campusError(503,'조회하지 못했습니다.');
async function one(q:PromiseLike<Result>):Promise<Row|null>{const r=await q;if(r.error)unavailable();return r.data as Row|null;}
async function all(q:PromiseLike<Result>):Promise<Row[]>{const r=await q;if(r.error||!Array.isArray(r.data)||(r.count!==undefined&&r.count!==null&&r.count!==r.data.length))unavailable();return r.data as Row[];}
async function paged(make:(start:number,end:number)=>PromiseLike<Result>):Promise<Row[]>{const out:Row[]=[];let count:number|null=null;for(let start=0;start<20000;start+=500){const r=await make(start,start+499);if(r.error||!Array.isArray(r.data)||r.count==null||r.count>20000||(count!==null&&count!==r.count)||r.data.length!==Math.min(500,r.count-start))unavailable();count=r.count!;out.push(...r.data as Row[]);if(out.length===count){if(new Set(out.map(r=>r.id)).size!==out.length)unavailable();return out;}}return unavailable();}
async function scope(db:Database,actor:string,enrollment:string){const e=await one(db.from('enrollments').select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at').eq('id',id(enrollment)).eq('user_id',actor).maybeSingle());if(!e||!hasLearningAccess(e))campusError(403,'수강권을 확인해 주세요.');const c=await one(db.from('courses').select('id').eq('id',e.course_id).eq('status','published').is('archived_at',null).maybeSingle());if(!c)campusError(403,'과정을 확인해 주세요.');const h=await one(db.from('cohorts').select('id').eq('id',e.cohort_id).eq('course_id',e.course_id).is('archived_at',null).maybeSingle());if(!h)campusError(403,'기수를 확인해 주세요.');return e;}
export async function loadSupport(db:Database,actor:string,enrollment:string,admin?:()=>Database,signals=false):Promise<SupportState>{
 const e=await scope(db,actor,enrollment);
 const [requests,prefs,sessions]=await Promise.all([
 signals?Promise.resolve([]):all(db.from('edu_campus_support_requests').select('*',{count:'exact'}).eq('user_id',actor).eq('enrollment_id',enrollment).order('created_at',{ascending:false}).limit(1000)),
 one(db.from('edu_campus_preferences').select('mode,reminders,alumni,known_lessons').eq('user_id',actor).maybeSingle()),
 all(db.from('edu_campus_office_sessions').select('*',{count:'exact'}).eq('cohort_id',e.cohort_id).gte('ends_at',new Date().toISOString()).order('starts_at').limit(200))]);
 const [actions,bookings]=await Promise.all([
 requests.length?all(db.from('edu_campus_support_actions').select('*',{count:'exact'}).in('request_id',requests.map(r=>r.id)).neq('kind','handover').order('created_at').limit(3000)):[],
 sessions.length?all(db.from('edu_campus_office_bookings').select('*',{count:'exact'}).eq('user_id',actor).in('session_id',sessions.map(s=>s.id)).limit(200)):[]]);
 const checked=admin&&sessions.length?await all(admin().from('edu_campus_office_bookings').select('id,session_id,checked_in_at,queue_status',{count:'exact'}).in('session_id',sessions.map(s=>s.id)).eq('status','reserved').in('queue_status',['waiting','called']).order('checked_in_at').order('id').limit(1000)):[];
 const ownBookings=bookings.map(b=>({...b,queue_position:b.queue_status==='waiting'?checked.filter(q=>q.session_id===b.session_id&&q.queue_status==='waiting').findIndex(q=>q.id===b.id)+1:null}));
 return {requests,actions,sessions,bookings:ownBookings,preferences:prefs?parsePreferences({...prefs,knownLessons:prefs.known_lessons}):initialPreferences,serverNow:new Date().toISOString()} as SupportState;
}
export async function saveSupport(db:Database,admin:()=>Database,actor:string,b:Record<string,unknown>){
 const enrollment=id(b.enrollmentId);const member=await scope(db,actor,enrollment);
 if(b.kind==='intake'){
  const intake=parseIntake(b);const existing=await one(db.from('edu_campus_support_requests').select('*').eq('id',intake.id).eq('user_id',actor).maybeSingle());
  if(existing){if(Object.entries(intake).some(([k,v])=>existing[k]!==v))campusError(409,'요청 내용이 다릅니다.');return loadSupport(db,actor,enrollment,admin);}
  const r=await db.from('edu_campus_support_requests').insert({...intake,user_id:actor});if(r.error){if(r.error.code==='23505')campusError(409,'중복 요청입니다.');if(r.error.code==='42501'||r.error.code==='23514')campusError(403,'현재 수업을 확인해 주세요.');unavailable();}
 }else if(b.kind==='study-create'){
  const data=parseSession({...b,cohortId:member.cohort_id,sessionKind:'study',locationUrl:''});if(b.shareGoal!==true)campusError(400,'기수 공유 범위를 확인해 주세요.');
  const r=await admin().rpc('edu_campus_create_study',{p_actor:actor,p_enrollment:enrollment,p_id:data.id,p_title:data.title,p_goal:text(b.goal,300),p_start:data.starts_at,p_end:data.ends_at,p_capacity:data.capacity});if(r.error){if(r.error.code==='23514')campusError(409,'일정 조건을 확인해 주세요.');unavailable();}
 }else if(b.kind==='study-cancel'){
  const r=await admin().from('edu_campus_office_sessions').update({status:'cancelled'}).eq('id',id(b.sessionId)).eq('cohort_id',member.cohort_id).eq('created_by',actor).eq('student_created',true).select('id').maybeSingle();if(r.error)unavailable();if(!r.data)campusError(404,'일정을 확인해 주세요.');
 }else if(b.kind==='queue'){
  if(!['checkin','leave'].includes(String(b.action)))campusError(400,'대기 요청을 확인해 주세요.');const visible=await one(db.from('edu_campus_office_sessions').select('id').eq('id',id(b.sessionId)).eq('cohort_id',member.cohort_id).maybeSingle());if(!visible)campusError(404,'일정을 확인해 주세요.');
  const r=await admin().rpc('edu_campus_office_queue',{p_actor:actor,p_session:b.sessionId,p_kind:b.action});if(r.error){if(r.error.code==='42501')campusError(403,'예약을 확인해 주세요.');if(r.error.code==='23514')campusError(409,'모임 시간을 확인해 주세요.');unavailable();}
 }else if(b.kind==='participation-mode'){
  if(!['quiet','together','help'].includes(String(b.mode)))campusError(400,'참여 방식을 확인해 주세요.');
  const existing=await one(db.from('edu_campus_preferences').select('user_id').eq('user_id',actor).maybeSingle());
  const query=existing?db.from('edu_campus_preferences').update({mode:b.mode}).eq('user_id',actor):db.from('edu_campus_preferences').insert({user_id:actor,mode:b.mode});
  const r=await query;if(r.error)unavailable();
 }else if(b.kind==='preferences'){
  const p=parsePreferences(b.preferences);if(b.field!==undefined&&!['mode','reminders','alumni','knownLessons'].includes(String(b.field)))campusError(400,'설정을 확인해 주세요.');const payload=b.field?{[b.field==='knownLessons'?'known_lessons':String(b.field)]:p[b.field as keyof typeof p]}:{mode:p.mode,reminders:p.reminders,alumni:p.alumni,known_lessons:p.knownLessons};const existing=await one(db.from('edu_campus_preferences').select('user_id').eq('user_id',actor).maybeSingle());const q=existing?db.from('edu_campus_preferences').update({...payload,updated_at:new Date().toISOString()}).eq('user_id',actor):db.from('edu_campus_preferences').insert({user_id:actor,...payload});const r=await q;if(r.error)unavailable();
 }else if(b.kind==='reserve'||b.kind==='cancel-reservation'){
  const session=id(b.sessionId),requestId=id(b.id);const visible=await one(db.from('edu_campus_office_sessions').select('id').eq('id',session).maybeSingle());if(!visible)campusError(404,'일정을 확인해 주세요.');
  const result=await admin().rpc('edu_campus_reserve_office',{p_actor:actor,p_session:session,p_request:requestId,p_cancel:b.kind==='cancel-reservation'});if(result.error){if(['23514','23505'].includes(result.error.code))campusError(409,'예약 상태를 확인해 주세요.');if(result.error.code==='42501')campusError(403,'수강권을 확인해 주세요.');unavailable();}
 }else if(b.kind==='withdraw'){
  const request=id(b.requestId);if(!Number.isInteger(b.revision))campusError(400,'기록을 확인해 주세요.');const r=await admin().from('edu_campus_support_requests').update({status:'withdrawn',revision:Number(b.revision)+1,updated_at:new Date().toISOString()}).eq('id',request).eq('user_id',actor).eq('enrollment_id',enrollment).eq('revision',b.revision).in('status',['open','in_progress']).select('id').maybeSingle();if(r.error)unavailable();if(!r.data)campusError(409,'기록이 변경되었습니다.');
 }else campusError(400,'요청을 확인해 주세요.');
 return loadSupport(db,actor,enrollment,admin);
}
async function cohort(db:Database,cohortId:string){const c=await one(db.from('cohorts').select('id,course_id').eq('id',id(cohortId)).maybeSingle());if(!c)campusError(404,'기수를 확인해 주세요.');return c;}
export async function loadSupportAdmin(db:Database,cohortId:string){
 const chosen=await cohort(db,cohortId);const enrollments=await paged((a,b)=>db.from('enrollments').select('id,user_id,status,revoked_at,access_starts_at,access_ends_at',{count:'exact'}).eq('cohort_id',cohortId).eq('course_id',chosen.course_id).order('id').range(a,b));
 const [requests,sessions]=await Promise.all([enrollments.length?all(db.from('edu_campus_support_requests').select('*',{count:'exact'}).in('enrollment_id',enrollments.map(e=>e.id)).order('created_at',{ascending:false}).limit(3000)):[],all(db.from('edu_campus_office_sessions').select('*',{count:'exact'}).eq('cohort_id',cohortId).order('starts_at',{ascending:false}).limit(500))]);
 const [actions,bookings]=await Promise.all([requests.length?all(db.from('edu_campus_support_actions').select('*',{count:'exact'}).in('request_id',requests.map(r=>r.id)).order('created_at').limit(5000)):[],sessions.length?all(db.from('edu_campus_office_bookings').select('*',{count:'exact'}).in('session_id',sessions.map(s=>s.id)).limit(5000)):[]]);
 const weeks=await all(db.from('curriculum_weeks').select('id',{count:'exact'}).eq('course_id',chosen.course_id).limit(500));
 const lessons=weeks.length?await all(db.from('curriculum_lessons').select('id,title,day_number',{count:'exact'}).in('week_id',weeks.map(w=>w.id)).limit(1000)):[];
 const missions=lessons.length?await all(db.from('curriculum_missions').select('id,lesson_id,title',{count:'exact'}).in('lesson_id',lessons.map(l=>l.id)).limit(1000)):[];
 const [submissions,focus]=await Promise.all([
 enrollments.length&&missions.length?paged((a,b)=>db.from('mission_submissions').select('id,enrollment_id,mission_id,status,submitted_at,reviewed_at,attempt_number',{count:'exact'}).in('enrollment_id',enrollments.map(e=>e.id)).in('mission_id',missions.map(m=>m.id)).order('id').range(a,b)):[],
 enrollments.length?paged((a,b)=>db.from('edu_campus_focus_sessions').select('id,enrollment_id,lesson_id,status,updated_at',{count:'exact'}).in('enrollment_id',enrollments.map(e=>e.id)).eq('status','finished').order('id').range(a,b)):[]]);
 const analytics=analyzeSupport({requests,actions,sessions,bookings,submissions,focus,missions,lessons} as unknown as Parameters<typeof analyzeSupport>[0]);
 const reviewWindows=await all(db.from('edu_campus_review_windows').select('*',{count:'exact'}).eq('cohort_id',cohortId).order('planned_at').limit(1000));
 const profileIds=[...new Set(enrollments.map(e=>e.user_id))];const profiles=profileIds.length?await paged((a,b)=>db.from('profiles').select('id,status',{count:'exact'}).in('id',profileIds).order('id').range(a,b)):[];const activeUsers=new Set(profiles.filter(p=>p.status==='active').map(p=>p.id));const activeEnrollmentIds=enrollments.filter(e=>activeUsers.has(String(e.user_id))&&hasLearningAccess(e)).map(e=>e.id);
 const depth=analyzeSupportDepth({enrollmentIds:enrollments.map(e=>e.id),activeEnrollmentIds,lessons,missions,submissions,reviewWindows:reviewWindows.filter(w=>w.status==='planned').map(w=>({missionId:w.mission_id,dueAt:w.planned_at,expectedEnrollmentIds:activeEnrollmentIds})),complete:true} as SupportDepthInput);
 return {requests,actions,sessions,bookings,missions,reviewWindows,depth,metrics:supportMetrics(requests as SupportRequest[]),analytics,serverNow:new Date().toISOString()};
}
export async function saveSupportAdmin(db:Database,actor:string,b:Record<string,unknown>){
 const cohortId=id(b.cohortId);const chosen=await cohort(db,cohortId);
 if(b.kind==='review-plan'){
  const p=parseReviewPlan(b);const m=await one(db.from('curriculum_missions').select('id,lesson_id').eq('id',p.mission_id).maybeSingle());if(!m)campusError(404,'과제를 확인해 주세요.');
  const l=await one(db.from('curriculum_lessons').select('id,week_id').eq('id',m.lesson_id).maybeSingle());const w=l?await one(db.from('curriculum_weeks').select('id').eq('id',l.week_id).eq('course_id',chosen.course_id).maybeSingle()):null;if(!w)campusError(403,'다른 과정의 과제입니다.');
  const current=await one(db.from('edu_campus_review_windows').select('*').eq('cohort_id',cohortId).eq('mission_id',p.mission_id).maybeSingle());
  if(current&&current.id===p.id&&Date.parse(String(current.planned_at))===Date.parse(p.planned_at)&&current.status==='planned'&&current.revision===p.expectedRevision+1)return loadSupportAdmin(db,cohortId);
  if((current&&current.revision!==p.expectedRevision)||(!current&&p.expectedRevision!==0)||(current&&current.id!==p.id))campusError(409,'확인 계획이 변경되었습니다. 새로고침해 주세요.');
  const r=current?await db.from('edu_campus_review_windows').update({planned_at:p.planned_at,status:'planned',revision:p.expectedRevision+1,updated_at:new Date().toISOString()}).eq('id',p.id).eq('revision',p.expectedRevision).select('id').maybeSingle():await db.from('edu_campus_review_windows').insert({id:p.id,mission_id:p.mission_id,cohort_id:cohortId,planned_at:p.planned_at,created_by:actor}).select('id').maybeSingle();if(r.error){if(r.error.code==='23505')campusError(409,'이미 계획이 등록되었습니다.');unavailable();}if(!r.data)campusError(409,'확인 계획이 변경되었습니다.');
 }else if(b.kind==='cancel-review-plan'){
  if(!Number.isInteger(b.revision)||Number(b.revision)<1)campusError(400,'일정 버전을 확인해 주세요.');const r=await db.from('edu_campus_review_windows').update({status:'cancelled',revision:Number(b.revision)+1,updated_at:new Date().toISOString()}).eq('id',id(b.id)).eq('cohort_id',cohortId).eq('revision',b.revision).select('id').maybeSingle();if(r.error)unavailable();if(!r.data)campusError(409,'확인 계획이 변경되었습니다.');
 }else if(b.kind==='session'){
  const s=parseSession(b);const r=await db.from('edu_campus_office_sessions').insert({...s,created_by:actor});if(r.error){if(r.error.code==='23505')campusError(409,'이미 등록한 일정입니다.');unavailable();}
 }else if(b.kind==='cancel-session'){
  const r=await db.from('edu_campus_office_sessions').update({status:'cancelled'}).eq('id',id(b.sessionId)).eq('cohort_id',cohortId).select('id').maybeSingle();if(r.error)unavailable();if(!r.data)campusError(404,'일정을 확인해 주세요.');
 }else if(b.kind==='queue'){
  if(!['present','call','done'].includes(String(b.action)))campusError(400,'진행 상태를 확인해 주세요.');const visible=await one(db.from('edu_campus_office_sessions').select('id').eq('id',id(b.sessionId)).eq('cohort_id',cohortId).maybeSingle());if(!visible)campusError(404,'일정을 확인해 주세요.');
  const r=await db.rpc('edu_campus_office_queue',{p_actor:actor,p_session:b.sessionId,p_kind:b.action,p_booking:b.action==='present'?null:id(b.bookingId)});if(r.error){if(r.error.code==='23514')campusError(409,'대기열이 변경되었습니다.');unavailable();}
 }else if(b.kind==='followup'){
  const requestId=id(b.requestId);const row=await one(db.from('edu_campus_support_requests').select('enrollment_id').eq('id',requestId).maybeSingle());if(!row)campusError(404,'요청을 확인해 주세요.');const e=await one(db.from('enrollments').select('id').eq('id',row.enrollment_id).eq('cohort_id',cohortId).maybeSingle());if(!e)campusError(403,'기수가 다릅니다.');
  if(!['reply','handover','status'].includes(String(b.actionKind))||!['open','in_progress','resolved'].includes(String(b.status))||!Number.isInteger(b.revision)||Number(b.revision)<1)campusError(400,'지원 내용을 확인해 주세요.');
  const r=await db.rpc('edu_campus_support_followup',{p_actor:actor,p_request:requestId,p_action:id(b.id),p_revision:b.revision,p_kind:b.actionKind,p_content:text(b.content,4000),p_status:b.status});if(r.error){if(r.error.code==='23514')campusError(409,'기록이 바뀌었습니다.');unavailable();}
 }else campusError(400,'요청을 확인해 주세요.');return loadSupportAdmin(db,cohortId);
}
