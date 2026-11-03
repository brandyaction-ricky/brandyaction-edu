import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleCommunity } from '@/features/campus/community/handler';
import { loadCommunityState, saveCommunityCommand } from '@/features/campus/community/repository';
export const dynamic = 'force-dynamic';
function handle(request: Request) {
  return handleCommunity(request, {
    enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_COMMUNITY_ENABLED === 'true',
    authenticate: getAuthenticatedUser,
    load: async (viewer, enrollmentId, page, view,postId) => loadCommunityState(await createClient(), viewer, enrollmentId, false, page, view,postId),
    save: async (_viewer, command) => saveCommunityCommand(await createClient(), command),
  });
}
export const GET = handle;
export const POST = handle;
