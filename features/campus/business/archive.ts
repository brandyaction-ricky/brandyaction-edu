import type {createClient} from '@/lib/supabase/server';
import {fail,safeUrl,validId,validateTitle} from './domain';
type Database=Awaited<ReturnType<typeof createClient>>;
export const archiveKinds={plan:'개인 실행 계획',recipe:'나의 작업 순서',artifact:'내 결과물',note:'개인 노트'};
export type ArchiveScope={id:string;courseTitle:string;cohortName:string;reason:string};
export type ArchiveEntry={id:string;enrollment_id:string;kind:keyof typeof archiveKinds;title:string;body:string;url:string;source_kind:'business'|'post'|null;source_id:string|null;source_revision:number|null;revision:number;created_at:string;updated_at:string};
export type ArchiveSource={id:string;kind:string;title:string;payload?:Record<string,unknown>;body?:string;url?:string;revision:number;updatedAt:string};
export function validateArchiveCommand(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();const b=value as Record<string,unknown>;
 if(!validId(b.id)||!validId(b.requestId)||!validId(b.enrollmentId)||!['create','copy','update'].includes(String(b.action)))fail();const output:Record<string,unknown>={id:b.id,requestId:b.requestId,enrollmentId:b.enrollmentId,action:b.action};
 if(b.action==='copy'){if(!['business','post'].includes(String(b.sourceKind))||!validId(b.sourceId)||!Number.isInteger(b.sourceRevision)||Number(b.sourceRevision)<1)fail();return {...output,sourceKind:b.sourceKind,sourceId:b.sourceId,sourceRevision:b.sourceRevision};}
 if(!Object.hasOwn(archiveKinds,String(b.kind))||typeof b.body!=='string'||!b.body.trim()||b.body.length>40000||typeof b.url!=='string'||b.url.length>500||(b.url.trim()&&!safeUrl(b.url.trim())))fail();Object.assign(output,{kind:b.kind,title:validateTitle(b.title),body:b.body.trim(),url:b.url.trim()});
 if(b.action==='update'){if(!Number.isInteger(b.expectedRevision)||Number(b.expectedRevision)<1)fail();output.expectedRevision=b.expectedRevision;}
 return output;
}
const rpcError=(error:{code?:string}|null)=>{if(error){const statuses:Record<string,number>={'42501':403,'23514':400,'23502':400,'23505':409,'40001':409,'P0002':404};fail(statuses[error.code||'']||503);}};
export async function readArchive(db:Database,actor:string,collection:string,enrollmentId:string|null,cursor:string|null){if(!['scopes','business','posts','entries'].includes(collection)||(collection!=='scopes'&&!validId(enrollmentId))||(cursor&&!validId(cursor)))fail();const r=await db.rpc('edu_campus_archive_read',{p_actor:actor,p_enrollment:collection==='scopes'?null:enrollmentId,p_collection:collection,p_cursor:cursor});rpcError(r.error);return r.data;}
export async function writeArchive(db:Database,actor:string,body:unknown){const command=validateArchiveCommand(body),r=await db.rpc('edu_campus_archive_write',{p_actor:actor,p_command:command});rpcError(r.error);return r.data;}
