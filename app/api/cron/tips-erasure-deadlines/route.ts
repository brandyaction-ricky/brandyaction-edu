import { monitorErasureDeadlines } from '@/lib/edu-tips-erasure-monitor';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Next.js otherwise maps HEAD to GET, which would write deadline observations.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
}

export function GET(request: Request) {
  return monitorErasureDeadlines(request, {
    env: process.env,
    rpc: async (name, args, signal) => {
      const { data, error } = await createAdminClient().rpc(name, args).abortSignal(signal);
      return { data, error };
    },
  });
}
