import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleCampusGet } from '@/features/campus/handler';
import { loadCampusSnapshot } from '@/features/campus/repository';

export async function GET(request: Request) {
  return handleCampusGet(request, {
    enabled: process.env.EDU_CAMPUS_ENABLED === 'true',
    authenticate: getAuthenticatedUser,
    load: async (viewer, enrollmentId) => loadCampusSnapshot(await createClient(), viewer, enrollmentId),
  });
}
