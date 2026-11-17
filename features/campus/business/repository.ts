import type { createClient } from '@/lib/supabase/server';
import { createHash } from 'node:crypto';
import { hasLearningAccess } from '@/lib/platform-rules';
import type { Row } from '@/lib/platform';
import { fail, fingerprint, validId, validatePayload, validateTitle, type BusinessKind, type BusinessRecord, type BusinessState, type Payload } from './domain';
type Database=Awaited<ReturnType<typeof createClient>>;
type Result={data:unknown;error:unknown};
export type BusinessCommand={action:'create'|'update'|'archive';requestId:string;id:string;enrollmentId:string;expectedRevision?:number;kind?:BusinessKind;title?:string;payload?:Payload};
const columns='id,user_id,enrollment_id,kind,title,payload,revision,created_at,updated_at,archived_at,last_command_id,creation_fingerprint';
async function result(query:PromiseLike<Result>){const r=await query;if(r.error)fail(503);return r.data;}
export async function assertBusinessScope(db:Database,userId:string,enrollmentId:string,now:number){
  if(!validId(enrollmentId)||!validId(userId))fail();
  const e=await result(db.from('enrollments').select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at').eq('id',enrollmentId).eq('user_id',userId).maybeSingle()) as Record<string,unknown>|null;
  if(!e||!hasLearningAccess(e as Row,now))fail(403);
  const [course,cohort,profile]=await Promise.all([result(db.from('courses').select('id').eq('id',e.course_id).eq('status','published').is('archived_at',null).maybeSingle()),result(db.from('cohorts').select('id').eq('id',e.cohort_id).eq('course_id',e.course_id).is('archived_at',null).maybeSingle()),result(db.from('profiles').select('id').eq('id',userId).eq('status','active').maybeSingle())]);
  if(!course||!cohort||!profile)fail(403);
}
function record(value:unknown):BusinessRecord {try{if(!value||typeof value!=='object'||Array.isArray(value))fail();const r=value as BusinessRecord;if(!validId(r.id)||!validId(r.user_id)||!validId(r.enrollment_id)||!validId(r.last_command_id)||!Number.isInteger(r.revision)||r.revision<1||!Number.isFinite(Date.parse(r.created_at))||!Number.isFinite(Date.parse(r.updated_at)))fail();validateTitle(r.title);validatePayload(r.kind,r.payload);return r;}catch{fail(503);}}
export async function loadBusiness(db:Database,userId:string,enrollmentId:string,cursor:string|null=null,now=Date.now()):Promise<BusinessState>{
  await assertBusinessScope(db,userId,enrollmentId,now);if(cursor&&!validId(cursor))fail();
  let query=db.from('edu_campus_business_records').select(columns).eq('user_id',userId).eq('enrollment_id',enrollmentId).is('archived_at',null).order('id').limit(101);
  if(cursor)query=query.gt('id',cursor);
  const rows=await result(query);if(!Array.isArray(rows))fail(503);
  const records=rows.slice(0,100).map(record);return {records,nextCursor:rows.length>100?records.at(-1)!.id:null};
}
export async function saveBusiness(db:Database,userId:string,command:BusinessCommand,now=Date.now()):Promise<BusinessRecord>{
  if(!command||typeof command!=='object'||!['create','update','archive'].includes(command.action)||!validId(command.id)||!validId(command.requestId))fail();
  await assertBusinessScope(db,userId,command.enrollmentId,now);
  const find=async()=>{const value=await result(db.from('edu_campus_business_records').select(columns).eq('id',command.id).eq('user_id',userId).eq('enrollment_id',command.enrollmentId).maybeSingle());return value?record(value):null;};
  const current=await find();
  const title=command.action==='archive'?'':validateTitle(command.title), payload=command.action==='archive'?{}:validatePayload(command.kind,command.payload);
  if(command.action==='create'){
    const initial=createHash('sha256').update(fingerprint(command.kind!,title,payload)).digest('hex');
    if(current){if(current.creation_fingerprint!==initial)fail(409);return current;}
    const data={id:command.id,user_id:userId,enrollment_id:command.enrollmentId,kind:command.kind,title,payload,revision:1,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),archived_at:null,last_command_id:command.requestId,creation_fingerprint:initial};
    const saved=await db.from('edu_campus_business_records').insert(data).select(columns).maybeSingle();
    if(saved.error){if(saved.error.code==='23505'){const retry=await find();if(retry&&retry.creation_fingerprint===initial)return retry;fail(409);}if(saved.error.code==='42501')fail(403);fail(503);}
    return record(saved.data);
  }
  if(!current)fail(404);
  if(!Number.isInteger(command.expectedRevision)||Number(command.expectedRevision)<1)fail();
  if(current.last_command_id===command.requestId){
    if(current.revision!==Number(command.expectedRevision)+1|| (command.action==='archive'?!current.archived_at:current.archived_at||current.kind!==command.kind||fingerprint(current.kind,current.title,current.payload)!==fingerprint(command.kind!,title,payload)))fail(409);
    return current;
  }
  if(current.archived_at||current.revision!==command.expectedRevision||(command.action==='update'&&current.kind!==command.kind))fail(409);
  const patch=command.action==='archive'?{archived_at:new Date(now).toISOString()}:{title,payload};
  const updated=await result(db.from('edu_campus_business_records').update({...patch,revision:current.revision+1,last_command_id:command.requestId,updated_at:new Date(now).toISOString()}).eq('id',current.id).eq('user_id',userId).eq('enrollment_id',command.enrollmentId).eq('revision',command.expectedRevision).select(columns).maybeSingle());
  if(!updated)fail(409);return record(updated);
}
