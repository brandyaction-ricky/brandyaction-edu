import { createAdminClient } from '@/lib/supabase/admin';
import { handleActionReview } from '@/lib/edu-tips-action-review-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handleActionReview(request, { env: process.env,
    rpc: async (args, signal) => await createAdminClient().rpc('edu_tips_action_review_context', args).abortSignal(signal) });
}
export async function GET() { return Response.json({ error: 'invalid_request', deliveryAllowed: false }, { status: 405, headers: { 'Cache-Control': 'no-store' } }); }
export const HEAD = GET;
