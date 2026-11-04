import { createAdminClient } from '@/lib/supabase/admin';
import { handleData } from '@/lib/edu-tips-data-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
 return handleData(request, 'learning', { env: process.env, rpc: async (name,args,signal) => {
  const { data,error } = await createAdminClient().rpc(name,args).abortSignal(signal); return { data,error };
 } });
}
export function HEAD() { return unsupported(); }
export function POST() { return unsupported(); }
function unsupported() { return Response.json({ error:'invalid_request' }, { status:405,
 headers:{ Allow:'GET', 'Cache-Control':'no-store','X-Contract-Version':'2.0.0-rc.2' } }); }
