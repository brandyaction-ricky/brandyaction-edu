import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleCampusFocus } from '@/features/campus/focus-handler';
import { loadCampusFocus, saveCampusFocus } from '@/features/campus/focus-repository';

export const dynamic = 'force-dynamic';
function handle(request: Request) {
  return handleCampusFocus(request, {
    // Separate rollout gate: the existing read-only campus works before this migration.
    enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_FOCUS_ENABLED === 'true',
    authenticate: getAuthenticatedUser,
    load: async (viewer, enrollmentId) => loadCampusFocus(await createClient(), viewer.id, enrollmentId),
    save: async (viewer, command) => saveCampusFocus(await createClient(), viewer.id, command),
  });
}
export const GET = handle;
export const POST = handle;
