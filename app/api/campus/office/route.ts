import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleOffice } from '@/features/campus/office/handler';
import { loadOfficeState, saveOfficeCommand } from '@/features/campus/office/repository';
export const dynamic = 'force-dynamic';
import {hasOfficePilot} from '@/features/campus/office/pilot';
async function handle(request: Request) {
 const normallyEnabled = process.env.EDU_CAMPUS_OFFICE_ENABLED === 'true';
 const pilotRead = !normallyEnabled && request.method === 'GET' && await hasOfficePilot(new URL(request.url).searchParams.get('enrollmentId'));
 return handleOffice(request, { enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && (normallyEnabled || pilotRead), authenticate: getAuthenticatedUser, load: async (viewer, enrollmentId, params) => loadOfficeState(await createClient(), viewer, enrollmentId, params), save: async command => saveOfficeCommand(await createClient(), command) }); }
export const GET = handle;
export const POST = handle;
