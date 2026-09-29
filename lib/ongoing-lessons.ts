import type { LessonBlockAnswers, PublicBlockDocument } from './lesson-blocks';
export type OngoingCadence = 'daily' | 'weekly' | 'monthly';
export const ongoingLabels: Record<OngoingCadence,string> = { daily:'일일',weekly:'주간',monthly:'월간' };
export type OngoingHistoryItem = { periodStart:string;periodEnd:string;updatedAt:string;completed:boolean };
export type OngoingCompletion = { id:string;writeId:string;revision:string;createdAt:string;values?:LessonBlockAnswers;assessment:unknown };
export type OngoingSnapshot = {stats:{completed:number;opportunities:number;rate:number};cadence:OngoingCadence;periodStart:string;periodEnd:string;currentPeriodStart:string;revision:string;document:PublicBlockDocument;
 draft:{values:LessonBlockAnswers;writeId:string;updatedAt:string}|null;completion:OngoingCompletion|null;history:OngoingHistoryItem[]};
export function ongoingPeriodLabel(start:string,end:string){const date=(value:string)=>new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'});const first=date(start),last=date(new Date(Date.parse(end)-1).toISOString());return first===last?first:`${first} ~ ${last}`;}
export type OngoingReviewSelection = { periodStart: string; snapshot: 'latest' | 'completed' };
export function ongoingReviewFileUrl(lessonId: string, enrollmentId: string, review: OngoingReviewSelection, file: string, kind: 'answer' | 'content') {
 return '/api/admin/ongoing-lessons?' + new URLSearchParams({ action: 'file', lesson: lessonId, enrollment: enrollmentId, period: review.periodStart, snapshot: review.snapshot, file, kind });
}
