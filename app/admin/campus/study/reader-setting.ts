'use server';

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCampusId } from '@/features/campus/snapshot';
import { cohortReaderEnabled, cohortReaderKey, reviewCohortKey } from '@/features/campus/cohort-reader';

export async function saveReaderSetting(form: FormData) {
  const operator = await getOperatorUser('products');
  if (!operator) notFound();
  const cohortId = String(form.get('cohort') || '');
  const mode = form.get('mode');
  if (!isCampusId(cohortId) || (mode !== 'guided' && mode !== 'classroom')) notFound();
  const db = createAdminClient();
  const { data: cohort, error } = await db.from('cohorts').select('course_id')
    .eq('id', cohortId).is('archived_at', null).maybeSingle();
  if (error) throw error;
  if (!cohort) notFound();
  const params = new URLSearchParams({ cohort: cohortId });
  if (mode === 'guided') {
    const [course, registered] = await Promise.all([
      db.from('courses').select('id').eq('id', cohort.course_id).eq('status', 'published').is('archived_at', null).maybeSingle(),
      db.from('site_settings').select('key').eq('key', reviewCohortKey(cohortId)).eq('is_public', false).maybeSingle(),
    ]);
    if (course.error || registered.error) throw course.error || registered.error;
    if (!course.data || !registered.data) notFound();
    const lesson = String(form.get('lesson') || '');
    if (!isCampusId(lesson) || form.get('reviewed') !== 'on') notFound();
    const review = await db.from('curriculum_lessons').select('id,curriculum_weeks!inner(course_id)')
      .eq('id', lesson).eq('is_published', true).is('archived_at', null)
      .eq('curriculum_weeks.course_id', cohort.course_id).eq('curriculum_weeks.is_published', true)
      .is('curriculum_weeks.archived_at', null).maybeSingle();
    if (review.error) throw review.error;
    if (!review.data) notFound();
    params.set('lesson', lesson);
  }
  const result = await db.from('site_settings').upsert({
    key: cohortReaderKey(cohortId), value: { enabled: mode === 'guided' },
    is_public: false, updated_by: operator.id, updated_at: new Date().toISOString(),
  });
  if (result.error) throw result.error;
  revalidatePath('/admin/campus/study');
  redirect('/admin/campus/study?' + params);
}

export async function editReviewCohort(form: FormData) {
  const operator = await getOperatorUser('products');
  if (!operator) notFound();
  const id = String(form.get('cohort') || '');
  const mode = form.get('action');
  if (!isCampusId(id) || !['save', 'remove'].includes(String(mode))) notFound();
  const db = createAdminClient();
  const key = reviewCohortKey(id);
  if (mode === 'remove') {
    if (await cohortReaderEnabled(db, id)) redirect('/admin/campus/study?manage=1&notice=enabled');
    const result = await db.from('site_settings').delete().eq('key', key).eq('is_public', false);
    if (result.error) throw result.error;
  } else {
    const label = String(form.get('label') || '').trim();
    if (!label || label.length > 50) redirect('/admin/campus/study?manage=1&notice=name');
    const cohort = await db.from('cohorts').select('id,courses!inner(id)').eq('id',id)
      .is('archived_at',null).is('courses.archived_at',null).maybeSingle();
    if (cohort.error) throw cohort.error;
    if (!cohort.data) notFound();
    const result = await db.from('site_settings').upsert({ key, value: { label }, is_public: false,
      updated_by: operator.id, updated_at: new Date().toISOString() });
    if (result.error) throw result.error;
  }
  revalidatePath('/admin/campus/study');
  redirect('/admin/campus/study?manage=1&notice=' + (mode === 'remove' ? 'removed' : 'saved'));
}
