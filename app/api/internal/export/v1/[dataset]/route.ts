import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { exportDatasets, exportRange, validExport, type ExportDataset } from '@/lib/edu-export-contract';
import { aggregateExport } from '@/lib/edu-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Contract-Version': '1.0' };
const error = (code: string, status: number) => Response.json({ error: code }, { status, headers });
export async function GET(request: Request, context: { params: Promise<{ dataset: string }> }) {
  const started = performance.now(), now = new Date();
  const signal = AbortSignal.timeout(5000);
  try {
    const db = createAdminClient();
    const setting = await db.from('site_settings').select('value').eq('key', 'export_v1').eq('is_public', false).abortSignal(signal).maybeSingle();
    if (setting.error) return error('unavailable', 503);
    const config = setting.data?.value;
    if (!config || config.enabled !== true) return error('disabled', 503);
    const token = /^Bearer ([^\s]{1,512})$/.exec(request.headers.get('authorization') || '')?.[1];
    const hash = token ? createHash('sha256').update(token).digest('hex') : '';
    if (!/^[0-9a-f]{64}$/.test(config.tokenHash || '') || !hash ||
      !timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.tokenHash, 'hex'))) return error('unauthorized', 401);
    const gate = await db.rpc('edu_export_v1_gate', { p_hash: hash }).abortSignal(signal);
    if (gate.error) return error('unavailable', 503);
    if (gate.data === 'disabled') return error('disabled', 503);
    if (gate.data === 'unauthorized') return error('unauthorized', 401);
    if (gate.data === 'rate_limited') return error('rate_limited', 429);
    if (gate.data !== 'ok') return error('unavailable', 503);
    const { dataset } = await context.params;
    if (!exportDatasets.includes(dataset as ExportDataset) || dataset === 'ad_changes') return error('not_found', 404);
    const params = new URL(request.url).searchParams;
    if (params.getAll('from').length !== 1 || params.getAll('to').length !== 1) return error('invalid_range', 400);
    const days = exportRange(params.get('from'), params.get('to'), now);
    if (!days) return error('invalid_range', 400);
    const snapshot = await db.rpc('edu_export_v1_guarded_source',
      { p_dataset: dataset, p_from: days[0], p_to: days.at(-1), p_asof: now.toISOString(),
        p_controls: process.env.EDU_AD_CONTROLS_ENABLED === 'true' }).abortSignal(signal);
    if (snapshot.error || !snapshot.data) return error('unavailable', 503);
    if (snapshot.data.status === 'invalid_range' || snapshot.data.status === 'backfill_window') return error(snapshot.data.status, 400);
    if (snapshot.data.status === 'backfill_busy') return error('backfill_busy', 429);
    if (snapshot.data.status !== 'ok' || !snapshot.data.source) return error('unavailable', 503);
    const source = snapshot.data.source;
    if (process.env.EDU_AD_CONTROLS_ENABLED === 'true' && !Array.isArray(source.ad_controls)) return error('unavailable', 503);
    const response = aggregateExport(dataset as ExportDataset, { ...source,
      consentEnabled: process.env.EDU_OPTIONAL_CONSENT_ENABLED === 'true' }, days, now);
    if (!validExport(dataset as ExportDataset, response) || signal.aborted || performance.now() - started >= 5000) return error('unavailable', 503);
    return Response.json(response, { headers });
  } catch {
    // Neither tokens nor internal database errors enter logs or responses.
    return error('unavailable', 503);
  }
}
