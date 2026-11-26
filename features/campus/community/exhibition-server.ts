import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCampusScope } from '../repository';
import { campusError } from '../snapshot';
import { exhibitKinds, loadCommunityExhibition, type ExhibitionCandidate, type ExhibitionPorts } from './exhibition';
export async function readCommunityExhibition(viewerId: string, enrollmentId: string) {
  const db = await createClient();
  const ports: ExhibitionPorts = {
    scope: async (actor, id) => (await loadCampusScope(db, { id: actor }, id)).cohortId,
    authorizedPosts: async (cohortId, ids) => {
      let query = db.from('edu_campus_posts').select('id,cohort_id,kind,visibility,hidden,title,alias,revision,updated_at').eq('cohort_id', cohortId).in('kind', exhibitKinds).eq('visibility', 'cohort').eq('hidden', false);
      if (ids) { if (!ids.length) return []; query = query.in('id', ids); }
      const result = await query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(24);
      if (result.error || !Array.isArray(result.data)) { console.error('exhibition posts', result.error); campusError(503, '전시 조회 실패'); }
      return result.data as ExhibitionCandidate[];
    },
    reportedPostIds: async ids => {
      if (!ids.length) return [];
      if (ids.length > 24) campusError(503, '전시 조회 범위 초과');
      const admin = createAdminClient();
      const result = await admin.from('edu_campus_reports').select('post_id', { count: 'exact' }).in('post_id', ids).eq('status', 'open').limit(1000);
      if (result.error || !Array.isArray(result.data) || result.count !== result.data.length) { console.error('exhibition reports', result.error, result.count); campusError(503, '전시 검토 상태 조회 실패'); }
      return result.data.map(r => String(r.post_id));
    },
  };
  return loadCommunityExhibition(ports, viewerId, enrollmentId);
}
