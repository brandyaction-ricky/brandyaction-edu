import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {privateReply, problem} from '@/features/campus/webinar/server';
import {fail} from '@/features/campus/webinar/domain';
import {buildArrivalReport, type ArrivalRow} from '@/features/campus/arrival/analytics-report';

// from/to are KST calendar dates (YYYY-MM-DD), both inclusive.
export async function GET(request: Request) {
  try {
    if (!await getOperatorUser('marketing')) fail('분석 조회 권한이 필요합니다.', 403);
    const q = new URL(request.url).searchParams, from = q.get('from') || '', to = q.get('to') || '';
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (!date.test(from) || !date.test(to) || from > to) fail('조회 기간을 확인해 주세요.');
    const start = Date.parse(`${from}T00:00:00+09:00`), end = Date.parse(`${to}T00:00:00+09:00`) + 86400000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 93 * 86400000) fail('조회 기간은 93일 이내로 선택해 주세요.');
    const days: string[] = [];
    for (let t = start; t < end; t += 86400000) days.push(new Date(t + 9 * 3600000).toISOString().slice(0, 10));
    const db = createAdminClient(), rows: ArrivalRow[] = [];
    const startTime = new Date(start).toISOString();
    const endTime = new Date(Math.min(end, Date.now())).toISOString();
    const cap = 100_000;
    let lastId: string | undefined;
    while (rows.length <= cap) {
      let query = db.from('edu_arrival_events')
        .select('cursor_id:id::text,session_id,kind,station,target,seconds,source,medium,campaign,occurred_at')
        .gte('occurred_at', startTime).lt('occurred_at', endTime)
        .order('id').limit(Math.min(1000, cap + 1 - rows.length));
      if (lastId !== undefined) query = query.gt('id', lastId);
      const {data, error} = await query.abortSignal(AbortSignal.timeout(10000));
      if (error) throw error;
      // PostgREST can return fewer rows than requested even when more exist.
      if (data.length === 0) break;
      rows.push(...(data as ArrivalRow[]));
      lastId = data[data.length - 1].cursor_id;
    }
    const truncated = rows.length > cap;
    if (truncated) rows.pop();
    const setting = await db.from('edu_campus_analytics_settings').select('enabled').eq('id', true).maybeSingle();
    if (setting.error) throw setting.error;
    return privateReply({...buildArrivalReport(rows, days), trackingEnabled: setting.data?.enabled === true, from, to, truncated});
  } catch (e) { return problem(e); }
}
