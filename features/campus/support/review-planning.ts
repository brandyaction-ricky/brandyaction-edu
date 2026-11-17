import {campusError} from '../snapshot';
import {id} from './domain';

export type ReviewWindow={id:string;mission_id:string;cohort_id:string;planned_at:string;status:'planned'|'cancelled';revision:number};
export type ReviewMission={id:string;title:string;lesson_id:string};
/** Operator workload planning only. This never changes student submission deadlines. */
export function parseReviewPlan(b:Record<string,unknown>,now=Date.now()){
 const planned=Date.parse(String(b.plannedAt||''));
 if(!Number.isFinite(planned)||planned<now-60000||planned>now+180*86400000)campusError(400,'확인 예정일은 현재부터 180일 이내로 선택해 주세요.');
 if(!Number.isInteger(b.revision)||Number(b.revision)<0)campusError(400,'일정 버전을 확인해 주세요.');
 return {id:id(b.id),mission_id:id(b.missionId),planned_at:new Date(planned).toISOString(),expectedRevision:Number(b.revision)};
}
