import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifySourceStatus } from '@/lib/edu-tips-source-status';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ state: 'unauthorized' }, 401);
    if (user.role !== 'admin') return reply({ state: 'forbidden' }, 403);
    if (process.env.EDU_TIPS_SOURCE_STATUS_ENABLED !== 'true') return reply({ state: 'disabled' });
    const { data, error } = await createAdminClient().rpc('edu_tips_source_status_candidate');
    if (error) throw new Error('TIPS_SOURCE_STATUS_UNAVAILABLE');
    return reply(classifySourceStatus(data));
  } catch { return reply({ state: 'check_unavailable' }, 503); }
}
