import {isCampusId} from './snapshot';
type Enrollment={id:string;user_id:string;cohort_id:string;status:string;revoked_at?:unknown;access_starts_at?:unknown;access_ends_at?:unknown};
// Welcome access does not grant learning access. Every destination rechecks it.
export function campusEntry(e:Enrollment,userId:string,cohortId:string,now=Date.now()){
 const start=e.access_starts_at?Date.parse(String(e.access_starts_at)):0;
 const end=e.access_ends_at?Date.parse(String(e.access_ends_at)):Infinity;
 if(!isCampusId(e.id)||e.user_id!==userId||e.cohort_id!==cohortId||e.status!=='active'||e.revoked_at||Number.isNaN(start)||Number.isNaN(end)||end<=now)return null;
 return {enrollmentId:e.id,ready:start<=now,startsAt:e.access_starts_at?String(e.access_starts_at):null};
}
export function campusEntryPath(cohortId?:string,welcome=false){
 return '/campus/enter'+(cohortId?'?cohort='+encodeURIComponent(cohortId)+(welcome?'&welcome=1':''):welcome?'?welcome=1':'');
}
