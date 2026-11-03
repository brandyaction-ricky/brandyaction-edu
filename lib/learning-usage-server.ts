import { createAdminClient } from '@/lib/supabase/admin';
import type { UsageType } from './learning-usage';

/** Called only after the content access check AND successful file/link preparation. */
export async function recordLearningUsage(actor: { id: string; role: string }, enrollmentId: string, type: Exclude<UsageType, 'vod_complete'>, itemId: string) {
  if (actor.role === 'admin' || actor.role === 'staff') return;
  const { error } = await createAdminClient().rpc('edu_record_learning_usage', {
    p_actor: actor.id, p_enrollment: enrollmentId, p_type: type, p_item: itemId,
  });
  if (error) throw new Error('이용 기록을 저장하지 못했습니다. 다시 시도해 주세요.');
}
