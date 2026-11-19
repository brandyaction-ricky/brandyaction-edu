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
    const page = 5000, cap = 100000;
    for (let offset = 0; offset < cap; offset += page) {
      const r = await db.from('edu_arrival_events').select('session_id,kind,station,target,seconds,source,medium,campaign,occurred_at')
        .gte('occurred_at', new Date(start).toISOString()).lt('occurred_at', new Date(end).toISOString())
        .order('id').range(offset, offset + page - 1).abortSignal(AbortSignal.timeout(10000));
      if (r.error) throw r.error;
      rows.push(...(r.data as ArrivalRow[]));
      if (r.data.length < page) break;
    }
    const setting = await db.from('edu_campus_analytics_settings').select('enabled').eq('id', true).maybeSingle();
    if (setting.error) throw setting.error;
    return privateReply({...buildArrivalReport(rows, days), trackingEnabled: setting.data?.enabled === true, from, to, truncated: rows.length >= cap});
  } catch (e) { return problem(e); }
}
