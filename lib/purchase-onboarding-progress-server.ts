import { createAdminClient } from '@/lib/supabase/admin';
import type { EligiblePurchase } from '@/lib/purchase-onboarding-server';
import type { OnboardingProgress } from '@/lib/purchase-onboarding-progress';

const invalid = (message: string) => { throw Object.assign(new Error(message), { status: 409 }); };
export async function readOnboardingProgress(userId: string, purchase: EligiblePurchase): Promise<OnboardingProgress> {
  const db = createAdminClient();
  const saved = await db.from('edu_onboarding_steps').select('step,confirmation_value,comment').eq('order_id', purchase.orderId).eq('user_id', userId);
  if (saved.error) throw saved.error;
  const steps = new Map((saved.data || []).map(row => [row.step, row]));
  const orientationAt = purchase.settings.orientationAt || '';
  let lesson: OnboardingProgress['lesson'] = null;
  if (purchase.settings.firstLessonId) {
    const enrollment = await db.from('enrollments').select('id,course_id,access_starts_at,access_ends_at').eq('user_id', userId).eq('cohort_id', purchase.cohortId).eq('status', 'active').is('revoked_at', null).maybeSingle();
    if (enrollment.error) throw enrollment.error;
    const e = enrollment.data, now = Date.now();
    if (e && Date.parse(e.access_starts_at) <= now && (!e.access_ends_at || Date.parse(e.access_ends_at) > now)) {
      const target = await db.from('curriculum_lessons').select('id,title,week_id,curriculum_weeks!inner(course_id,is_published,archived_at)').eq('id', purchase.settings.firstLessonId).eq('is_published', true).is('archived_at', null).maybeSingle();
      if (target.error) throw target.error;
      const l = target.data;
      const week = Array.isArray(l?.curriculum_weeks) ? l.curriculum_weeks[0] : l?.curriculum_weeks;
      if (l && week && week.course_id === e.course_id && week.is_published && !week.archived_at) {
        const [lv, wv, done, gate] = await Promise.all([
          db.from('edu_cohort_lesson_visibility').select('is_published').eq('cohort_id', purchase.cohortId).eq('lesson_id', l.id).maybeSingle(),
          db.from('edu_cohort_week_visibility').select('is_published').eq('cohort_id', purchase.cohortId).eq('week_id', l.week_id).maybeSingle(),
          db.from('lesson_progress').select('completed_at').eq('enrollment_id', e.id).eq('lesson_id', l.id).maybeSingle(),
          db.rpc('edu_lesson_progression_gate', { p_enrollment: e.id, p_lesson: l.id }),
        ]);
        for (const result of [lv, wv, done, gate]) if (result.error) throw result.error;
        if (lv.data?.is_published && wv.data?.is_published && gate.data?.isUnlocked) lesson = { id: l.id, title: l.title, url: `/learn/${e.id}/${l.id}`, completed: Boolean(done.data?.completed_at) };
      }
    }
  }
  const learning = steps.get('learning');
  return { telegram: steps.has('telegram'), app: steps.has('app'), orientation: Boolean(orientationAt && steps.get('orientation')?.confirmation_value === orientationAt),
    orientationAt, lesson, learning: Boolean(lesson?.completed && learning?.confirmation_value === lesson.id && learning.comment.trim()), comment: learning?.confirmation_value === lesson?.id ? learning?.comment || '' : '' };
}
export async function confirmOnboardingStep(userId: string, purchase: EligiblePurchase, body: Record<string, unknown>) {
  const progress = await readOnboardingProgress(userId, purchase);
  const step = body.step;
  if (!['telegram', 'app', 'orientation', 'learning'].includes(String(step))) throw Object.assign(new Error('확인할 단계를 선택해 주세요.'), { status: 400 });
  if (step !== 'telegram' && !progress.telegram) invalid('텔레그램 입장을 먼저 확인해 주세요.');
  if ((step === 'orientation' || step === 'learning') && !progress.app) invalid('앱 설치를 먼저 확인해 주세요.');
  if (step === 'orientation' && (!progress.orientationAt || body.orientationAt !== progress.orientationAt)) invalid('OT 일정이 변경되었거나 아직 준비되지 않았어요. 새로고침 후 확인해 주세요.');
  if (step === 'learning' && (!progress.orientation || !progress.lesson?.completed || body.lessonId !== progress.lesson.id)) invalid('OT 일정 확인과 운영 가이드 학습 완료를 먼저 진행해 주세요.');
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (step === 'learning' && (!comment || comment.length > 1000)) throw Object.assign(new Error('댓글을 1~1,000자로 작성해 주세요.'), { status: 400 });
  const result = await createAdminClient().from('edu_onboarding_steps').upsert({ order_id: purchase.orderId, user_id: userId, step,
    confirmation_value: step === 'orientation' ? progress.orientationAt : step === 'learning' ? progress.lesson!.id : '',
    comment: step === 'learning' ? comment : '', confirmed_at: new Date().toISOString() }, { onConflict: 'order_id,step' });
  if (result.error) throw result.error;
  return { ok: true };
}
