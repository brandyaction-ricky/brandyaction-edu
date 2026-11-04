import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleOffice } from '@/features/campus/office/handler';
import { loadOfficeState, saveOfficeCommand } from '@/features/campus/office/repository';
export const dynamic = 'force-dynamic';
function handle(request: Request) { return handleOffice(request, { enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_OFFICE_ENABLED === 'true', authenticate: getAuthenticatedUser, load: async (viewer, enrollmentId) => loadOfficeState(await createClient(), viewer, enrollmentId), save: async command => saveOfficeCommand(await createClient(), command) }); }
export const GET = handle;
export const POST = handle;
