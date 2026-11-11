import type { createClient } from '@/lib/supabase/server';
import type { createAdminClient } from '@/lib/supabase/admin';
import { campusError } from '../snapshot';
import { isCampusId } from '../snapshot';
import { validateOfficeCommand, type OfficeState } from './domain';
import type { VerifiedOfficeEvent } from './webhook';
type Db = Awaited<ReturnType<typeof createClient>>;
export async function loadOfficeState(db: Db, viewer: { id: string }, enrollmentId: string, params = new URLSearchParams()) {
  const employee=params.get('employee'), before=params.get('before'), id=params.get('id'), selected=params.get('job');
  if((employee?.length??0)>128 || (!!before !== !!id) || (id && !isCampusId(id)) ||
     (before && (!/^\d{4}-\d\d-\d\dT/.test(before)||!Number.isFinite(Date.parse(before)))) || (selected && !isCampusId(selected))) campusError(400,'조회 조건을 확인해 주세요.');
  const [access,page,connection]=await Promise.all([
    db.rpc('edu_campus_office_access',{p_enrollment:enrollmentId}),
    db.rpc('edu_campus_office_page',{p_enrollment:enrollmentId,p_employee:employee||null,p_archived:params.get('archived')==='1',p_before:before,p_id:id}),
    db.rpc('edu_campus_office_connection',{p_enrollment:enrollmentId})
  ]);
  if(access.error||page.error||connection.error||!Array.isArray(page.data)) campusError(503,'작업함을 읽지 못했습니다.');
  if(!access.data)campusError(403,'이용 가능한 수강권을 선택해 주세요.');
  const jobs=page.data.slice(0,20), tail=jobs.at(-1);
  let detail=null, history:OfficeState['history']=[];
  if(selected){
    let query=db.from('edu_campus_office_jobs').select('id,employee_id,owner_id,enrollment_id,objective,material_urls,output_type,status,revision,draft_text,draft_url,review_note,error_note,created_at,updated_at')
      .eq('id',selected).eq('owner_id',viewer.id).eq('enrollment_id',enrollmentId);
    if(employee)query=query.eq('employee_id',employee);
    const job=await query.maybeSingle();
    if(job.error)campusError(503,'업무 결과를 읽지 못했습니다.');
    detail=job.data;
    if(detail){
      const events=await db.from('edu_campus_office_history').select('id,job_id,revision,actor_type,action,status,note,draft_text,created_at').eq('job_id',selected).order('revision',{ascending:false}).limit(20);
      if(events.error)campusError(503,'업무 기록을 읽지 못했습니다.');
      history=events.data as OfficeState['history'];
    }
  }
  return {jobs,detail,history,next:page.data.length>20?{before:tail.created_at,id:tail.id}:null,connection:connection.data==='incoming_adapter_registered'?'incoming_adapter_registered':'not_connected',demo:false};
}
function dbError(error: { code?: string } | null) { if (error) campusError(error.code === '42501' ? 403 : ['23505', '40001'].includes(error.code ?? '') ? 409 : ['23514', '22P02', '23502'].includes(error.code ?? '') ? 400 : 503, '작업을 처리하지 못했습니다.'); }
export async function saveOfficeCommand(db: Db, command: unknown) {
  const c = validateOfficeCommand(command); const r = await db.rpc('edu_campus_office_mutate', { p_command: c }); dbError(r.error); return r.data;
}
export async function ingestOfficeEvent(db: ReturnType<typeof createAdminClient>, event: VerifiedOfficeEvent) {
  const r = await db.rpc(event.event.event === 'registered' ? 'edu_campus_office_register' : 'edu_campus_office_ingest', { p_connector: event.connectorId, p_key_version: event.keyVersion, p_allowed_owners: event.allowedOwners, p_event_id: event.eventId, p_payload_hash: event.payloadHash, p_event: event.event }); dbError(r.error); return r.data;
}
