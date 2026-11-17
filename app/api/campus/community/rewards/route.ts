import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleCommunity } from '@/features/campus/community/handler';
import { campusError } from '@/features/campus/snapshot';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return handleCommunity(request, {
    enabled: process.env.EDU_CAMPUS_ENABLED === 'true' && process.env.EDU_CAMPUS_COMMUNITY_ENABLED === 'true',
    authenticate: getAuthenticatedUser,
    load: async (_viewer, enrollmentId) => {
      const result = await (await createClient()).rpc('edu_campus_community_rewards', { p_enrollment: enrollmentId });
      if (result.error || !result.data) campusError(result.error?.code === '42501' ? 403 : 503, '성장 기록을 확인하지 못했습니다.');
      return result.data;
    },
    save: async () => campusError(405, '조회만 가능합니다.'),
  });
}
