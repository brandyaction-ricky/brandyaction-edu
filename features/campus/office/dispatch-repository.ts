import type { createClient } from '@/lib/supabase/server';
import type { createAdminClient } from '@/lib/supabase/admin';
import { campusError } from '../snapshot';
import type { DispatchCommand } from './dispatch-handler';
import type { DispatchLease, DispatchOutcome, OutboundConnector } from './dispatch';
type Db=Awaited<ReturnType<typeof createClient>>;
function check(error:{code?:string}|null){if(error)campusError(error.code==='42501'?403:['40001','23505'].includes(error.code??'')?409:['23514','22P02'].includes(error.code??'')?400:503,'Dispatch unavailable');}
export async function loadOfficeDispatch(db:Db,viewer:{id:string},enrollmentId:string,connectors:OutboundConnector[]){const [r,connection]=await Promise.all([db.rpc('edu_campus_office_dispatch_list',{p_enrollment:enrollmentId}),db.rpc('edu_campus_office_connection',{p_enrollment:enrollmentId})]);check(r.error);check(connection.error);return{dispatches:r.data,connected:connection.data==='incoming_adapter_registered'&&connectors.filter(c=>c.ownerIds.includes(viewer.id)).length===1};}
export async function saveOfficeDispatch(db:Db,viewer:{id:string},command:DispatchCommand,connectors:OutboundConnector[]){const permitted=connectors.filter(c=>c.ownerIds.includes(viewer.id));if(permitted.length!==1)campusError(403,'No unique connector');const c=permitted[0];const r=await db.rpc('edu_campus_office_dispatch_command',{p_command:{...command,connectorId:c.id,keyVersion:c.keyVersion}});check(r.error);return r.data;}
export async function claimOfficeDispatch(db:ReturnType<typeof createAdminClient>,connector:OutboundConnector,leaseId:string):Promise<DispatchLease|null>{const r=await db.rpc('edu_campus_office_dispatch_claim',{p_connector:connector.id,p_key_version:connector.keyVersion,p_allowed_owners:connector.ownerIds,p_lease:leaseId});check(r.error);return r.data as DispatchLease|null;}
export async function finishOfficeDispatch(db:ReturnType<typeof createAdminClient>,lease:DispatchLease,outcome:DispatchOutcome){const r=await db.rpc('edu_campus_office_dispatch_finish',{p_id:lease.id,p_lease:lease.leaseId,p_outcome:outcome});check(r.error);return r.data;}
