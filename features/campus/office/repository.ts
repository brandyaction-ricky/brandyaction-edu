import type { createClient } from '@/lib/supabase/server';
import type { createAdminClient } from '@/lib/supabase/admin';
import { campusError } from '../snapshot';
import { loadCampusSnapshot } from '../repository';
import { validateOfficeCommand, type OfficeState } from './domain';
import type { VerifiedOfficeEvent } from './webhook';
type Db = Awaited<ReturnType<typeof createClient>>;
export async function loadOfficeState(db: Db, viewer: { id: string }, enrollmentId: string): Promise<OfficeState> {
  await loadCampusSnapshot(db, viewer, enrollmentId);
  const [jobs, connection] = await Promise.all([
    db.from('edu_campus_office_jobs').select('id,owner_id,enrollment_id,objective,material_urls,output_type,status,revision,draft_text,draft_url,review_note,error_note,created_at,updated_at', { count: 'exact' }).eq('owner_id', viewer.id).eq('enrollment_id', enrollmentId).order('updated_at', { ascending: false }).limit(200),
    db.rpc('edu_campus_office_connection', { p_enrollment: enrollmentId }),
  ]);
  if (jobs.error || !Array.isArray(jobs.data) || jobs.count !== jobs.data.length || connection.error) campusError(503, '작업함 전체를 확인하지 못했습니다.');
  const ids = jobs.data.map(j => j.id);
  const history = ids.length ? await db.from('edu_campus_office_history').select('id,job_id,revision,actor_type,action,status,note,draft_text,created_at', { count: 'exact' }).in('job_id', ids).order('revision', { ascending: false }).limit(3000) : { data: [], error: null, count: 0 };
  if (history.error || !Array.isArray(history.data) || history.count !== history.data.length) campusError(503, '작업 이력을 확인하지 못했습니다.');
  return { jobs: jobs.data as unknown as OfficeState['jobs'], history: history.data as unknown as OfficeState['history'], connection: connection.data === 'incoming_adapter_registered' ? 'incoming_adapter_registered' : 'not_connected', demo: false };
}
function dbError(error: { code?: string } | null) { if (error) campusError(error.code === '42501' ? 403 : ['23505', '40001'].includes(error.code ?? '') ? 409 : ['23514', '22P02', '23502'].includes(error.code ?? '') ? 400 : 503, '작업을 처리하지 못했습니다.'); }
export async function saveOfficeCommand(db: Db, command: unknown) {
  const c = validateOfficeCommand(command); const r = await db.rpc('edu_campus_office_mutate', { p_command: c }); dbError(r.error); return r.data;
}
export async function ingestOfficeEvent(db: ReturnType<typeof createAdminClient>, event: VerifiedOfficeEvent) {
  const r = await db.rpc(event.event.event === 'registered' ? 'edu_campus_office_register' : 'edu_campus_office_ingest', { p_connector: event.connectorId, p_key_version: event.keyVersion, p_allowed_owners: event.allowedOwners, p_event_id: event.eventId, p_payload_hash: event.payloadHash, p_event: event.event }); dbError(r.error); return r.data;
}
