export const EDU_META_DATASET = '5567287373411934';
export const EDU_META_PROJECT = 'prj_sZrdpSZEC9IxKLLzEDGlAK17WWPx';
type Env = Record<string, string | undefined>;
export function metaPurchaseEnvironment(env: Env = process.env) {
  return env.META_PURCHASE_MODE === 'live' && env.VERCEL_ENV === 'production' &&
    env.VERCEL_PROJECT_ID === EDU_META_PROJECT && env.META_PURCHASE_DATASET_ID === EDU_META_DATASET &&
    /^v\d{2}\.\d+$/.test(env.META_PURCHASE_GRAPH_VERSION || '');
}
export function metaCheckoutContext(request: Request) {
  const origin = new URL(request.url).origin;
  if (origin !== 'https://brandyaction-edu.com' || request.headers.get('origin') !== origin) return null;
  const cookies = new Map((request.headers.get('cookie') || '').split(';').map(part => {
    const offset = part.indexOf('='); return [part.slice(0, offset).trim(), part.slice(offset + 1).trim()];
  }));
  if ((request.headers.get('cookie') || '').split(';').some(part => part.trim() === 'edu_noads=1')) return null;
  const ua = request.headers.get('user-agent') || '';
  if (!ua || ua.length > 512 || /[\x00-\x1f\x7f]/.test(ua)) return null;
  const cookie = (key: string) => {
    const value = cookies.get(key) || '';
    return /^fb\.\d+\.\d{10,16}\.[A-Za-z0-9_-]{1,400}$/.test(value) ? value : null;
  };
  return { userAgent: ua, sourceUrl: `${origin}/checkout`, fbp: cookie('_fbp'), fbc: cookie('_fbc') };
}
export type MetaPurchaseJob = {
  orderId: string; eventId: string; lease: string; dataset: string; eventTime: number;
  amount: number; courseIds: string[]; emailHash: string; userAgent: string; sourceUrl: string;
  fbp: string | null; fbc: string | null;
};
export function metaPurchasePayload(job: MetaPurchaseJob) {
  if (job.dataset !== EDU_META_DATASET || !Number.isInteger(job.amount) || job.amount <= 0 ||
    !Number.isInteger(job.eventTime) || !/^[a-f0-9]{64}$/.test(job.emailHash) || job.sourceUrl !== 'https://brandyaction-edu.com/checkout' ||
    !job.courseIds.length || !job.userAgent) throw new Error('META_PURCHASE_INVALID_JOB');
  return { data: [{ event_name: 'Purchase', event_time: job.eventTime, event_id: job.eventId,
    action_source: 'website', event_source_url: job.sourceUrl,
    user_data: { em: [job.emailHash],
      client_user_agent: job.userAgent, ...(job.fbp ? { fbp: job.fbp } : {}), ...(job.fbc ? { fbc: job.fbc } : {}) },
    custom_data: { value: job.amount, currency: 'KRW', content_type: 'product', content_ids: job.courseIds } }] };
}
export type MetaPurchaseOutcome = 'sent' | 'retry' | 'blocked';
export async function sendMetaPurchase(job: MetaPurchaseJob, env: Env = process.env, transport: typeof fetch = fetch): Promise<{ outcome: MetaPurchaseOutcome; trace: string | null }> {
  if (!metaPurchaseEnvironment(env) || !env.META_PURCHASE_CAPI_ACCESS_TOKEN) throw new Error('META_PURCHASE_DISABLED');
  const payload = metaPurchasePayload(job);
  try {
    const response = await transport(`https://graph.facebook.com/${env.META_PURCHASE_GRAPH_VERSION}/${EDU_META_DATASET}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.META_PURCHASE_CAPI_ACCESS_TOKEN}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error',
    });
    // Never return/log Meta's echoed customer payload, token, error message or raw body.
    const text = await response.text();
    if (text.length > 16384) return { outcome: 'blocked', trace: null };
    let result: { events_received?: number; fbtrace_id?: unknown; error?: unknown };
    try { result = JSON.parse(text); } catch { return { outcome: response.ok || response.status >= 500 ? 'retry' : 'blocked', trace: null }; }
    const trace = typeof result.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(result.fbtrace_id) ? result.fbtrace_id : null;
    return { outcome: response.ok && result.events_received === 1 && !result.error ? 'sent' :
      response.status === 429 || response.status >= 500 ? 'retry' : 'blocked', trace };
  } catch { return { outcome: 'retry', trace: null }; }
}
