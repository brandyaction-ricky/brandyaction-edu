import type { CurriculumAnswer } from './curriculum-ai';
export type SavedAiExchange={requestId:string;question:string;imageId:string|null;imageName:string|null;answer:CurriculumAnswer|null;status:'pending'|'succeeded'|'failed';error:string|null;createdAt:string};
export type SavedAiConversation={id:string;enrollmentId:string;lessonId:string;label:string;lastQuestion:string;updatedAt:string};
export function aiHistoryUrl(enrollmentId?:string,lessonId?:string,cursor?:{time:string;id:string}){
 const query=new URLSearchParams();if(enrollmentId&&lessonId){query.set('enrollment',enrollmentId);query.set('lesson',lessonId);}if(cursor){query.set('before',cursor.time);query.set('beforeId',cursor.id);}return '/api/platform/curriculum-ai/history?'+query;
}
