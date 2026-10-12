import { createAdminClient } from '@/lib/supabase/admin';
import { handleEligibility } from '@/lib/edu-tips-eligibility-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return handleEligibility(request, { env: process.env, rpc: async (args, signal) => {
    const { data, error } = await createAdminClient().rpc('edu_tips_check_eligibility', args).abortSignal(signal);
    return { data, error };
  } });
}
export function GET() { return unsupported(); }
export function HEAD() { return unsupported(); }
function unsupported() {
  return Response.json({ error: 'invalid_request' }, { status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store', 'X-Contract-Version': '2.0.0-rc.2' } });
}
