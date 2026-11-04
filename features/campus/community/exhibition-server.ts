import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasLearningAccess } from '@/lib/platform-rules';
import { campusError } from '../snapshot';
import { loadCommunityExhibition, type ExhibitionCandidate, type ExhibitionPorts } from './exhibition';
export async function readCommunityExhibition(viewerId: string, enrollmentId: string) {
  const db = await createClient();
  const ports: ExhibitionPorts = {
    scope: async (actor, id) => {
      const enrollment = await db.from('enrollments').select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at').eq('id', id).eq('user_id', actor).maybeSingle();
      if (enrollment.error) campusError(503, '수강권 조회 실패');
      const e = enrollment.data; if (!e || !hasLearningAccess(e)) campusError(403, '수강권 없음');
      const [profile, course, cohort] = await Promise.all([
        db.from('profiles').select('id').eq('id', actor).eq('status', 'active').maybeSingle(),
        db.from('courses').select('id').eq('id', e.course_id).eq('status', 'published').is('archived_at', null).maybeSingle(),
        db.from('cohorts').select('id').eq('id', e.cohort_id).eq('course_id', e.course_id).is('archived_at', null).maybeSingle(),
      ]);
      if ([profile, course, cohort].some(r => r.error)) campusError(503, '기수 조회 실패');
      if (!profile.data || !course.data || !cohort.data) campusError(403, '현재 기수 없음');
      return String(e.cohort_id);
    },
    authorizedPosts: async (cohortId, ids) => {
      let query = db.from('edu_campus_posts').select('id,cohort_id,kind,visibility,hidden,title,alias,revision,updated_at').eq('cohort_id', cohortId).eq('kind', 'portfolio').eq('visibility', 'cohort').eq('hidden', false);
      if (ids) { if (!ids.length) return []; query = query.in('id', ids); }
      const result = await query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(24);
      if (result.error || !Array.isArray(result.data)) campusError(503, '전시 조회 실패');
      return result.data as ExhibitionCandidate[];
    },
    reportedPostIds: async ids => {
      if (!ids.length) return [];
      if (ids.length > 24) campusError(503, '전시 조회 범위 초과');
      const admin = createAdminClient();
      const result = await admin.from('edu_campus_reports').select('post_id', { count: 'exact' }).in('post_id', ids).eq('status', 'open').limit(1000);
      if (result.error || !Array.isArray(result.data) || result.count !== result.data.length) campusError(503, '전시 검토 상태 조회 실패');
      return result.data.map(r => String(r.post_id));
    },
  };
  return loadCommunityExhibition(ports, viewerId, enrollmentId);
}
