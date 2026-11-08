import type { createAdminClient } from '@/lib/supabase/admin';

export const cohortReaderKey = (cohortId: string) => 'edu_campus_page_reader_' + cohortId;

export async function cohortReaderEnabled(db: Pick<ReturnType<typeof createAdminClient>, 'from'>, cohortId: string) {
  const { data, error } = await db.from('site_settings').select('value', { count: 'exact' })
    .eq('key', cohortReaderKey(cohortId)).eq('is_public', false).limit(1);
  if (error) throw new Error('기수별 수강 방식을 확인하지 못했습니다.');
  return data?.[0]?.value?.enabled === true;
}
