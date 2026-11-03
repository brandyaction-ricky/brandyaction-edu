import type {SupportRequest,SupportAction,OfficeSession,Booking} from './domain';
type Submission={id:string;enrollment_id:string;mission_id:string;status:string;submitted_at:string;reviewed_at:string|null;attempt_number:number};
type Focus={id:string;enrollment_id:string;lesson_id:string;status:string;updated_at:string};
type Mission={id:string;lesson_id:string;title:string};
type Lesson={id:string;title:string;day_number:number};
export type SupportAnalytics=ReturnType<typeof analyzeSupport>;
const day=86400000, timestamp=(v:string|null)=>v?Date.parse(v):NaN;
const within=(v:string|null,from:number,to:number)=>timestamp(v)>=from&&timestamp(v)<to;
/** Descriptive temporal association, never a causal or revenue-effect score. */
export function analyzeSupport(input:{requests:SupportRequest[];actions:SupportAction[];submissions:Submission[];focus:Focus[];missions:Mission[];lessons:Lesson[];sessions:OfficeSession[];bookings:Booking[];now?:number}){
 const {requests,actions,submissions,focus,missions,lessons,sessions,bookings}=input,now=input.now??Date.now();
 const current=requests.filter(r=>within(r.created_at,now-7*day,now+1)),previous=requests.filter(r=>within(r.created_at,now-14*day,now-7*day));
 const latest=new Map<string,Submission>();for(const s of submissions){const k=s.enrollment_id+':'+s.mission_id,old=latest.get(k);if(!old||s.attempt_number>old.attempt_number)latest.set(k,s);}
 const submissionQueue=[...latest.values()].filter(s=>s.status==='submitted').sort((a,b)=>a.submitted_at.localeCompare(b.submitted_at)).map(s=>({id:s.id,enrollmentId:s.enrollment_id,title:missions.find(m=>m.id===s.mission_id)?.title||'과제',submittedAt:s.submitted_at,hours:Math.max(0,now-timestamp(s.submitted_at))/3600000}));
 const obstacles=Object.values(requests.reduce<Record<string,{lessonId:string|null;title:string;category:string;current:number;previous:number;learners:Set<string>}>>((out,r)=>{const key=(r.lesson_id||'general')+':'+r.category;out[key]??={lessonId:r.lesson_id,title:lessons.find(l=>l.id===r.lesson_id)?.title||'수업 외 실행',category:r.category,current:0,previous:0,learners:new Set()};if(current.includes(r)){out[key].current++;out[key].learners.add(r.user_id);}if(previous.includes(r))out[key].previous++;return out;},{})).filter(r=>r.current||r.previous).map(r=>({...r,learners:r.learners.size})).sort((a,b)=>b.current-a.current);
 const effects=requests.flatMap(r=>{
  const first=actions.filter(a=>a.request_id===r.id&&a.kind==='reply').sort((a,b)=>a.created_at.localeCompare(b.created_at))[0];if(!first)return [];
  const from=timestamp(first.created_at),to=Math.min(from+7*day,now+1),lessonMissions=new Set(missions.filter(m=>m.lesson_id===r.lesson_id).map(m=>m.id));
  const matching=submissions.filter(s=>s.enrollment_id===r.enrollment_id&&(!r.lesson_id||lessonMissions.has(s.mission_id)));
  const submitted=matching.filter(s=>within(s.submitted_at,from,to)),approved=matching.filter(s=>s.status==='approved'&&within(s.reviewed_at,from,to));
  const executed=focus.filter(f=>f.enrollment_id===r.enrollment_id&&(!r.lesson_id||f.lesson_id===r.lesson_id)&&f.status==='finished'&&within(f.updated_at,from,to));
  return [{requestId:r.id,title:r.title,replyAt:first.created_at,windowComplete:now>=from+7*day,submitted:submitted.length,resubmitted:submitted.filter(s=>s.attempt_number>1).length,approved:approved.length,executed:executed.length}];
 });
 const oldest=requests.length?Math.min(...requests.map(r=>timestamp(r.created_at))):NaN;
 const weeks=Array.from({length:4},(_,i)=>({from:new Date(now-(i+1)*7*day).toISOString(),arrivals:requests.filter(r=>within(r.created_at,now-(i+1)*7*day,now-i*7*day)).length,resolved:requests.filter(r=>r.status==='resolved'&&within(r.updated_at,now-(i+1)*7*day,now-i*7*day)).length})).reverse();
 const forecast=oldest<=now-28*day?{weeklyAverage:weeks.reduce((n,w)=>n+w.arrivals,0)/4,observedLow:Math.min(...weeks.map(w=>w.arrivals)),observedHigh:Math.max(...weeks.map(w=>w.arrivals)),weeklyResolved:weeks.reduce((n,w)=>n+w.resolved,0)/4,waiting:requests.filter(r=>['open','in_progress'].includes(r.status)).length}:null;
 const upcoming=sessions.filter(s=>s.status==='open'&&within(s.starts_at,now,now+7*day)).map(s=>({title:s.title,startsAt:s.starts_at,capacity:s.capacity,reserved:bookings.filter(b=>b.session_id===s.id&&b.status==='reserved').length}));
 return {period:{from:new Date(now-7*day).toISOString(),to:new Date(now).toISOString()},currentRequests:current.length,previousRequests:previous.length,submissionQueue,obstacles,effects,weeks,forecast,upcoming};
}
export function retrospectiveMarkdown(value:SupportAnalytics){return ['# 문샷 기수 운영 회고 초안','',`집계: ${value.period.from} ~ ${value.period.to}`,'',`- 도움 요청: 최근 7일 ${value.currentRequests}건 / 앞선 7일 ${value.previousRequests}건`,`- 최신 제출 검토 대기: ${value.submissionQueue.length}건`,`- 첫 답변 후 7일 내 후속 행동이 관측된 요청: ${value.effects.filter(r=>r.submitted||r.approved||r.executed).length} / ${value.effects.length}건`,'','## 반복된 막힘',...value.obstacles.map(r=>`- ${r.title} / ${r.category}: 이번 ${r.current}건, 이전 ${r.previous}건, 이번 요청자 ${r.learners}명`),'','## 다음 운영에서 확인할 것','- 증가한 요청의 수업·도구·안내를 직접 검토합니다.','- 오래 기다린 제출물과 미해결 요청에 담당자를 배정합니다.','- 지원 후 변화는 시간순 관측이며 지원의 인과 효과를 뜻하지 않습니다.','- 검수 전 초안이며 자동 발행되지 않습니다.'].join('\n');}
