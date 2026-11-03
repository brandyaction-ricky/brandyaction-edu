import { getAuthenticatedUser } from '@/lib/server-auth';
import { handleCommunityExhibition } from '@/features/campus/community/exhibition';
import { readCommunityExhibition } from '@/features/campus/community/exhibition-server';
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => handleCommunityExhibition(req, {
  enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_COMMUNITY_ENABLED === 'true',
  authenticate: getAuthenticatedUser,
  load: readCommunityExhibition,
});
