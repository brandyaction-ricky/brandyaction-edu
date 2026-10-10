import { createAdminClient } from '@/lib/supabase/admin';
import { handleErasure } from './edu-tips-erasure-http';

export function erasureRoute(request: Request, action: 'page' | 'receipts' | 'ack') {
  return handleErasure(request, action, { env: process.env, rpc: async (name, args, signal) => {
    const { data, error } = await createAdminClient().rpc(name, args).abortSignal(signal);
    return { data, error };
  } });
}
