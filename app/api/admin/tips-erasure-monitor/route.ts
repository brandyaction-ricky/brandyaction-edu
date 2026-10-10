import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyErasureMonitorStatus } from '@/lib/edu-tips-erasure-monitor-status';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
  if (user.role !== 'admin') return reply({ error: '관리자만 이용할 수 있습니다.' }, 403);
  if (process.env.EDU_TIPS_ERASURE_MONITOR_ENABLED !== 'true') return reply({ state: 'disabled' });
  const environment = process.env.NEXT_PUBLIC_APP_ENV === 'development' ? 'dev'
    : process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : null;
  if (!environment) return reply({ state: 'configuration_required' }, 503);
  try {
    const { data, error } = await createAdminClient().rpc('edu_tips_read_erasure_monitor_status', {
      p_environment: environment,
    });
    if (error) throw new Error('Monitor read failed');
    return reply(classifyErasureMonitorStatus(data));
  } catch {
    return reply({ state: 'check_unavailable' }, 503);
  }
}
