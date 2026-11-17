import { getOperatorUser } from '@/lib/operator-permissions';
import { createClient } from '@/lib/supabase/server';
import { handleCommunity } from '@/features/campus/community/handler';
import { loadCommunityModeration, saveCommunityCommand } from '@/features/campus/community/repository';
export const dynamic = 'force-dynamic';
function handle(request: Request) {
  // This endpoint authorizes members operators before loading any cohort's moderation evidence.
  const url = new URL(request.url);
  if (request.method === 'GET') url.searchParams.set('enrollmentId', url.searchParams.get('cohortId') ?? '');
  const input = request.method === 'GET' ? new Request(url, request) : request;
  return handleCommunity(input, {
    enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_COMMUNITY_ENABLED === 'true',
    authenticate: () => getOperatorUser('members'),
    unauthorizedStatus: 403,
    load: async (viewer, cohortId) => ({...await loadCommunityModeration(await createClient(), cohortId),viewerId:viewer.id}),
    save: async (_viewer, command) => {
      if (command.action !== 'moderate') throw Object.assign(new Error('운영 조치만 허용합니다.'), { status: 400 });
      return saveCommunityCommand(await createClient(), command);
    },
  });
}
export const GET = handle;
export const POST = handle;
