import { externalPartnerScopes } from '@/lib/external-partner-access';
import { hubReply } from '@/lib/question-hub-server';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return hubReply({ error: '로그인이 필요합니다.' }, 401);
    return hubReply({ active: user.role === 'student' && (await externalPartnerScopes(user.id)).length > 0 });
  } catch {
    return hubReply({ error: '협력자 권한을 확인하지 못했습니다.' }, 503);
  }
}
