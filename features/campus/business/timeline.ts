export type TimelineInputs={enrollmentId:string;now?:number;days?:number;progress:{id:string;enrollment_id:string;completed_at:string|null}[];submissions:{id:string;enrollment_id:string;status:string;submitted_at:string;reviewed_at:string|null}[];focus:{id:string;enrollment_id:string;status:string;updated_at:string;elapsed_seconds:number}[];records:{id:string;enrollment_id:string;created_at:string}[]};
const day=86400000;
export function timelineStart(now:number,days=28){return Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00+09:00')-(days-1)*day;}
/** Current retained record timestamps, not an immutable audit history or attention measurement. */
export function buildBusinessTimeline(input:TimelineInputs){
 const now=input.now??Date.now(),days=input.days??28;if(!Number.isInteger(days)||days<1||days>90||!Number.isFinite(now))throw new Error('Invalid timeline range');
 const start=timelineStart(now,days),series=Array.from({length:days},(_,i)=>({date:new Date(start+i*day+9*3600000).toISOString().slice(0,10),completedLessons:0,submittedMissions:0,approvedMissions:0,finishedExecutions:0,executionMinutes:0,businessRecords:0}));
 function add<T extends {id:string;enrollment_id:string}>(rows:T[],when:(r:T)=>string|null,key:'completedLessons'|'submittedMissions'|'approvedMissions'|'finishedExecutions'|'businessRecords',allow:(r:T)=>boolean=()=>true){const seen=new Set<string>();for(const row of rows){if(row.enrollment_id!==input.enrollmentId||seen.has(row.id)||!allow(row))continue;seen.add(row.id);const at=Date.parse(when(row)||'');if(!Number.isFinite(at)||at<start||at>now)continue;const index=Math.floor((at-start)/day);if(series[index])series[index][key]++;}}
 add(input.progress,r=>r.completed_at,'completedLessons');
 add(input.submissions,r=>r.submitted_at,'submittedMissions');
 add(input.submissions,r=>r.reviewed_at,'approvedMissions',r=>r.status==='approved'&&Date.parse(r.reviewed_at||'')>=Date.parse(r.submitted_at));
 add(input.focus,r=>r.updated_at,'finishedExecutions',r=>r.status==='finished'&&Number.isInteger(r.elapsed_seconds)&&r.elapsed_seconds>=0&&r.elapsed_seconds<=900);
 add(input.records,r=>r.created_at,'businessRecords');
 const seen=new Set<string>();for(const row of input.focus){const at=Date.parse(row.updated_at);if(seen.has(row.id)||row.enrollment_id!==input.enrollmentId||row.status!=='finished'||!Number.isFinite(at)||at<start||at>now||!Number.isInteger(row.elapsed_seconds)||row.elapsed_seconds<0||row.elapsed_seconds>900)continue;seen.add(row.id);const index=Math.floor((at-start)/day);series[index].executionMinutes+=row.elapsed_seconds/60;}
 return {asOf:new Date(now).toISOString(),from:new Date(start).toISOString(),timezone:'Asia/Seoul' as const,todayPartial:true,series};
}
export type BusinessTimeline=ReturnType<typeof buildBusinessTimeline>;
