import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId, validDate, validateConfig, sectionOrder, validateActuals, validateMeta, reportRange } from '@/lib/landing';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
  if (!await getOperatorUser('marketing')) return reply({ error: '마케팅 관리 권한이 필요합니다.' }, 403);
  try {
    const db = createAdminClient(), q = new URL(request.url).searchParams, id = q.get('landing');
    if (!id) {
      const [configs, courses] = await Promise.all([db.from('landing_configs').select('*').order('updated_at', { ascending: false }), db.from('courses').select('id,title,slug,status,list_price').eq('list_price', 0).order('created_at', { ascending: false })]);
      if (configs.error || courses.error) throw Error('랜딩 설정을 불러오지 못했습니다.');
      return reply({ configs: configs.data, courses: courses.data });
    }
    if (!validId(id)) return reply({ error: '랜딩을 선택해 주세요.' }, 400);
    const { data: config, error } = await db.from('landing_configs').select('*').eq('id', id).maybeSingle();
    if (error || !config) return reply({ error: '랜딩을 먼저 저장·발행해 주세요.' }, 404);
    if (q.has('actual_day')) {
      const day = q.get('actual_day');
      if (!validDate(day)) return reply({ error: '기준일을 확인해 주세요.' }, 400);
      const result = await db.from('landing_actuals').select('day,joins,exits,live_peak,payments').eq('landing_id', id).eq('day', day).maybeSingle();
      if (result.error) throw Error('해당 날짜의 실측을 불러오지 못했습니다.');
      return reply({ actual: result.data });
    }
    const range = reportRange(q.get('start') || config.campaign_start, q.get('end') || config.campaign_end);
    const version = q.get('version') ? Number(q.get('version')) : null;
    if (version !== null && (!Number.isInteger(version) || version < 1)) return reply({ error: '버전을 확인해 주세요.' }, 400);
    const result = await db.rpc('edu_landing_report', { p_landing: id, p_start: range.start, p_end: range.end, p_campaign: (q.get('campaign') || '').slice(0,800), p_adset: (q.get('adset') || '').slice(0,800), p_creative: (q.get('creative') || '').slice(0,800), p_traffic: q.get('traffic') || '', p_version: version });
    if (result.error) throw Error('성과 보고서를 불러오지 못했습니다.');
    return reply({ config, ...result.data });
  } catch (e) { return reply({ error: e instanceof Error ? e.message : '조회에 실패했습니다.' }, 400); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  if (!await getOperatorUser('marketing')) return reply({ error: '마케팅 관리 권한이 필요합니다.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 1500000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    const body = JSON.parse(raw), db = createAdminClient();
    if (body.action === 'publish') {
      const config = validateConfig(body.config);
      const { data: course, error } = await db.from('courses').select('id,title,summary,description,metadata,list_price').eq('id', config.id).eq('list_price', 0).maybeSingle();
      if (error || !course) throw Error('무료클래스를 선택해 주세요.');
      const note = String(body.note || '').trim().slice(0,500);
      if (!note) throw Error('발행 변경 메모를 입력해 주세요.');
      const content = { course, custom_sections: config.custom_sections, sections: config.sections, cta_label: config.cta_label, kakao_url: config.kakao_url };
      const result = await db.rpc('edu_publish_landing', { p_config: config, p_order: sectionOrder(config), p_content: content, p_note: note, p_revision: config.revision });
      if (result.error) {
        if (result.error.message.includes('STALE_REVISION')) return reply({ error: '다른 관리자가 수정했습니다. 새로 불러온 뒤 다시 저장해 주세요.' }, 409);
        throw Error('랜딩 발행에 실패했습니다.');
      }
      return reply({ ok: true, config: result.data });
    }
    if (!validId(body.landing_id)) throw Error('랜딩을 선택해 주세요.');
    if (body.action === 'actuals') {
      const values = validateActuals(body.values);
      const r = await db.from('landing_actuals').upsert({ landing_id: body.landing_id, ...values, updated_at: new Date().toISOString() }, { onConflict: 'landing_id,day' });
      if (r.error) throw Error('실측 입력을 저장하지 못했습니다.');
    } else if (body.action === 'meta') {
      const values = validateMeta(body.values);
      const r = await db.from('landing_meta_daily').upsert({ landing_id: body.landing_id, ...values, updated_at: new Date().toISOString() }, { onConflict: 'landing_id,day,campaign,adset,creative' });
      if (r.error) throw Error('광고 실적을 저장하지 못했습니다.');
    } else if (body.action === 'note') {
      if (!Number.isInteger(body.version) || body.version < 1) throw Error('버전을 확인해 주세요.');
      const r = await db.from('section_snapshots').update({ note: String(body.note || '').trim().slice(0,500) }).eq('landing_id', body.landing_id).eq('layout_ver', body.version);
      if (r.error) throw Error('메모를 저장하지 못했습니다.');
    } else throw Error('요청을 확인해 주세요.');
    return reply({ ok: true });
  } catch(e) { return reply({ error: e instanceof Error ? e.message : '저장에 실패했습니다.' }, 400); }
}
