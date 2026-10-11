import type { createAdminClient } from './supabase/admin';

let ready = false;
// Allow code/Preview to run against the old schema with deletion unavailable.
// Once supported, database failures must fail closed rather than reveal rows.
export async function questionDeletionReady(db: Pick<ReturnType<typeof createAdminClient>, 'rpc'>): Promise<boolean> {
  if (ready) return true;
  const result = await db.rpc('edu_question_delete_ready');
  if (result.error?.code === 'PGRST202') return false;
  if (result.error) throw result.error;
  if (result.data !== true) throw new Error('Question deletion schema is unavailable');
  ready = true;
  return true;
}
