import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { afterConsentSourceCandidate, scheduledSourceCandidate } from './edu-tips-source-runtime';

const dependencies = () => ({ env: process.env, fetch,
  rpc: async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    const call = createAdminClient().rpc(name, args);
    const { data, error } = await (signal ? call.abortSignal(signal) : call);
    return { data, error };
  },
});
export function consentSourceAfterSave(member: string) {
  return afterConsentSourceCandidate(member, dependencies());
}
export function sourceWorkerRoute(request: Request) {
  return scheduledSourceCandidate(request, dependencies());
}
