import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId } from '@/lib/landing';
import { performanceRange } from '@/lib/landing-performance';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  if (!await getOperatorUser('marketing')) return reply({ error: '마케팅 관리 권한이 필요합니다.' }, 403);
  const params = new URL(request.url).searchParams;
  const id = params.get('landing');
  if (id !== null && !validId(id)) return reply({ error: '무료클래스를 선택해 주세요.' }, 400);
  let range;
  try { range = performanceRange(params.get('days')); }
  catch (error) { return reply({ error: (error as Error).message }, 400); }
  try {
    const db = createAdminClient();
    if (!id) {
      const [courses, configs] = await Promise.all([
        db.from('courses').select('id,title,slug,status').eq('list_price', 0).is('archived_at', null).order('created_at', { ascending: false }),
        db.from('landing_configs').select('id,enabled,layout_ver'),
      ]);
      if (courses.error || configs.error) throw Error('무료클래스 목록을 불러오지 못했습니다.');
      return reply({ courses: (courses.data || []).map(course => {
        const config = configs.data?.find(value => value.id === course.id);
        return { ...course, tracking: !config?.layout_ver ? 'not_configured' : config.enabled ? 'active' : 'paused' };
      }) });
    }
    const course = await db.from('courses').select('id').eq('id', id).eq('list_price', 0).is('archived_at', null).maybeSingle();
    if (course.error) throw Error('무료클래스를 확인하지 못했습니다.');
    if (!course.data) return reply({ error: '조회할 무료클래스가 없습니다.' }, 404);
    // Only aggregates leave the server; never send visitor/session identifiers or raw events.
    const result = await db.rpc('edu_landing_performance', { p_landing: id, p_start: range.start, p_end: range.end });
    if (result.error || !result.data) throw Error('성과 데이터를 불러오지 못했습니다.');
    return reply({ ...result.data, range: { startDay: range.startDay, endDay: range.endDay } });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : '조회에 실패했습니다.' }, 503); }
}
