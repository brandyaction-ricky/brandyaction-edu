import {validateCampusContent,visibleCampusContent,type CampusContent} from '../content/model';
import {validateWelcome,type WelcomeSettings} from '../welcome/content';
import {validateResources,type CampusResource} from './resources';
export const WEBINAR_PREFIX = 'edu_campus_webinar_v1_';
export const ARCHIVED_WEBINAR_PREFIX = 'edu_campus_archived_webinar_v1_';
export const WEBINAR_TAG = 'edu-campus-webinars-v1';
export const slugPattern = /^[a-z0-9][a-z0-9-]{2,59}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuid = (v: unknown): v is string => typeof v === 'string' && uuidPattern.test(v);
export type Webinar = { slug: string; title: string; description: string; status: 'draft'|'published'|'paused'; startsAt: string; endsAt: string; cohortId: string; detailPath: string; kakaoUrl: string; youtubeId: string; revision: string; resources?:CampusResource[]; welcome?:WelcomeSettings; content?:CampusContent; ambientCount?:number };
export type PublicWebinar = Pick<Webinar, 'slug'|'title'|'description'|'startsAt'|'endsAt'|'detailPath'|'kakaoUrl'|'youtubeId'> & { checkoutPath: string; content?:CampusContent; resources?:CampusResource[]; ambientCount?:number };
export type AccessResult = { kind: 'login'|'offer'|'welcome'|'member'; href?: string };
export function fail(message: string, status = 400): never { throw Object.assign(Error(message), {status}); }
function text(v: unknown, max: number, label: string) { if(typeof v !== 'string' || v.trim().length > max) fail(`${label}을 확인해 주세요.`); return v.trim(); }
export function validateWebinar(input: unknown): Webinar {
 if (!input || typeof input !== 'object' || Array.isArray(input)) fail('행사 설정을 확인해 주세요.');
 const v = input as Record<string, unknown>;
 if(Object.keys(v).some(k=>!['slug','title','description','status','startsAt','endsAt','cohortId','detailPath','kakaoUrl','youtubeId','revision','resources','welcome','ambientCount','content'].includes(k))) fail('알 수 없는 설정입니다.');
 const slug=text(v.slug,60,'행사 주소'), title=text(v.title,100,'제목'), description=text(v.description,600,'소개');
 if(!slugPattern.test(slug)||!title||!uuid(v.cohortId)||!uuid(v.revision)) fail('주소·제목·기수를 확인해 주세요.');
 if(!['draft','published','paused'].includes(String(v.status))) fail('공개 상태를 확인해 주세요.');
 const start=Date.parse(String(v.startsAt)), end=Date.parse(String(v.endsAt));
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>7*86400000) fail('행사 일정은 시작 이후부터 최대 7일로 설정해 주세요.');
 const detailPath=text(v.detailPath,160,'상세 페이지');
 if(!/^\/classes\/[a-zA-Z0-9_-]+$/.test(detailPath)) fail('에듀 상세 페이지 경로를 입력해 주세요.');
 const kakaoUrl=text(v.kakaoUrl,250,'카카오 상담 주소');
 if(kakaoUrl){let u:URL;try{u=new URL(kakaoUrl);}catch{fail('카카오 채널 주소를 확인해 주세요.');}if(u!.protocol!=='https:'||u!.hostname!=='pf.kakao.com'||u!.port||u!.username||u!.password||u!.search||u!.hash||!/^\/[a-zA-Z0-9_-]+(?:\/chat)?$/.test(u!.pathname))fail('https://pf.kakao.com/ 채널 주소만 사용할 수 있습니다.');}
 const youtubeId=text(v.youtubeId,11,'유튜브 영상 ID'); if(youtubeId&&!/^[a-zA-Z0-9_-]{11}$/.test(youtubeId)) fail('유튜브 영상 ID 11자를 확인해 주세요.');
 if(v.ambientCount!==undefined&&![0,20,40,60].includes(v.ambientCount as number))fail('공간 안내 캐릭터 수를 확인해 주세요.');
 return {...(v.content?{content:validateCampusContent(v.content)}:{}),ambientCount:typeof v.ambientCount==='number'?v.ambientCount:40,slug,title,description,status:v.status as Webinar['status'],startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),cohortId:v.cohortId,detailPath,kakaoUrl,youtubeId,revision:v.revision,resources:validateResources(v.resources,slug),...(v.welcome!==undefined?{welcome:validateWelcome(v.welcome)}:{})};
}
export function projectWebinar(w: Webinar): PublicWebinar {
 return {...(w.content?{content:visibleCampusContent(w.content,'guest')}:{}),ambientCount:w.ambientCount??40,resources:(w.resources||[]).filter(r=>r.published).map(r=>{const result={...r};delete result.storagePath;return result;}),slug:w.slug,title:w.title,description:w.description,startsAt:w.startsAt,endsAt:w.endsAt,detailPath:w.detailPath,kakaoUrl:w.kakaoUrl,youtubeId:w.youtubeId,checkoutPath:`/checkout?cohort=${w.cohortId}&utm_source=campus&utm_medium=webinar&utm_campaign=${w.slug}`};
}
export function phase(w: Pick<Webinar,'startsAt'|'endsAt'>, now=Date.now()) { return now<Date.parse(w.startsAt)?'upcoming':now>=Date.parse(w.endsAt)?'ended':'live'; }
export function loginPath(slug:string){return `/login?next=${encodeURIComponent('/campus/live/'+slug)}`;}
export const eventNames = ['entry','experience','gate','detail','consult','checkout'] as const;
export type WebinarEvent = typeof eventNames[number];
// A member result only recommends a route. The destination revalidates its own permissions.
export function accessFor(enrollments: Record<string,unknown>[], userId:string, cohortId:string, now=Date.now()):AccessResult {
 const eligible=enrollments.filter(e=>e.user_id===userId&&e.cohort_id===cohortId&&e.status==='active'&&!e.revoked_at&&(!e.access_ends_at||Date.parse(String(e.access_ends_at))>now));
 const active=eligible.find(e=>uuid(e.id)&&(!e.access_starts_at||Date.parse(String(e.access_starts_at))<=now));
 if(active)return {kind:'member',href:'/campus/workspace?enrollmentId='+active.id};
 if(eligible.some(e=>Date.parse(String(e.access_starts_at))>now))return {kind:'welcome',href:'/campus/enter?cohort='+cohortId+'&welcome=1'};
 return {kind:'offer'};
}
