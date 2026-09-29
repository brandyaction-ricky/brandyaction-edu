import 'server-only';
import { createECDH, ECDH } from 'node:crypto';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

const paths = new Set(['/my/messages', '/my/questions', '/my/missions', '/admin/questions', '/admin/reviews', '/admin/reviews?tab=blocks', '/admin/reviews?tab=missions']);
const allowedPath = (value: string) => paths.has(value) || /^\/learn\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export function pushConfiguration() {
  if (process.env.EDU_WEB_PUSH_ENABLED !== 'true' || process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED !== 'true') return null;
  const publicKey = process.env.EDU_WEB_PUSH_PUBLIC_KEY || '', privateKey = process.env.EDU_WEB_PUSH_PRIVATE_KEY || '', subject = process.env.EDU_WEB_PUSH_SUBJECT || '';
  try {
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
    const pair = createECDH('prime256v1'); pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (pair.getPublicKey().toString('base64url') !== publicKey) return null;
    const url = new URL(subject); if (!['https:', 'mailto:'].includes(url.protocol) || url.username || url.password || (url.protocol === 'mailto:' && !url.pathname.includes('@'))) return null;
    return { publicKey, privateKey, subject };
  } catch { return null; }
}
export function validatePushEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('PUSH_INVALID');
  let url: URL; try { url = new URL(value); } catch { throw new Error('PUSH_INVALID'); }
  // Push URLs are capability secrets and server destinations. Never accept an
  // arbitrary URL, custom port, credentials, IP or provider-looking suffix.
  const accepted = (url.hostname === 'fcm.googleapis.com' && /^\/(fcm\/send|wp)\//.test(url.pathname))
    || (url.hostname === 'updates.push.services.mozilla.com' && /^\/wpush\/v[12]\//.test(url.pathname))
    || (url.hostname === 'web.push.apple.com' && url.pathname.length > 1);
  if (!accepted || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || value !== url.href) throw new Error('PUSH_INVALID');
  return value;
}
export function validatePushSubscription(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('PUSH_INVALID');
  const v = value as { endpoint?: unknown; p256dh?: unknown; auth?: unknown }, endpoint = validatePushEndpoint(v.endpoint);
  if (typeof v.p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(v.p256dh) || typeof v.auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(v.auth)) throw new Error('PUSH_INVALID');
  const key = Buffer.from(v.p256dh, 'base64url'), auth = Buffer.from(v.auth, 'base64url');
  if (key.length !== 65 || key[0] !== 4 || auth.length !== 16 || key.toString('base64url') !== v.p256dh || auth.toString('base64url') !== v.auth) throw new Error('PUSH_INVALID');
  try { ECDH.convertKey(key, 'prime256v1'); } catch { throw new Error('PUSH_INVALID'); }
  return { endpoint, p256dh: v.p256dh, auth: v.auth };
}
type Job = { id: string; lease: string };
type Delivery = Job & { eventId: string; path: string; binding: string; endpoint: string; p256dh: string; auth: string };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export async function dispatchWebPush(dependencies?: { rpc: Rpc; send: typeof webpush.sendNotification }) {
  const config = pushConfiguration();
  if (!config) return { enabled: false, claimed: 0, sent: 0, deferred: 0 };
  const db = dependencies ? null : createAdminClient(), rpc: Rpc = dependencies?.rpc || ((name, args) => db!.rpc(name, args));
  const send = dependencies?.send || webpush.sendNotification.bind(webpush);
  const call = async (name: string, args: Record<string, unknown>) => { const r = await rpc(name, args); if (r.error) throw new Error('Push queue unavailable'); return r.data; };
  const jobs = await call('edu_claim_push', { p_limit: 15 }) as Job[];
  if (!Array.isArray(jobs)) throw new Error('Push queue unavailable');
  const totals = { enabled: true, claimed: jobs.length, sent: 0, deferred: 0 };
  let index = 0;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(3, jobs.length) }, async () => {
    while (index < jobs.length) {
      const job = jobs[index++];
      const finish = (outcome: string, code: string) => call('edu_finish_push', { p_id: job.id, p_lease: job.lease, p_outcome: outcome, p_code: code });
      const delivery = await call('edu_read_push_delivery', { p_id: job.id, p_lease: job.lease }) as Delivery | null;
      if (!delivery) { await finish('skipped', 'NO_LONGER_ELIGIBLE'); continue; }
      let subscription;
      try {
        subscription = validatePushSubscription(delivery);
        if (!allowedPath(delivery.path) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(delivery.binding) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(delivery.eventId)) throw new Error('Invalid payload');
      } catch { await finish('failed', 'INVALID_SUBSCRIPTION'); continue; }
      let outcome = 'sent', code = 'ACCEPTED';
      try {
        await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ version: 1, binding: delivery.binding, eventId: delivery.eventId, path: delivery.path }), {
          vapidDetails: config, TTL: 86400, timeout: 5000, urgency: 'normal', topic: delivery.eventId.replaceAll('-', ''),
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        outcome = status === 404 || status === 410 ? 'expired' : !status || status === 429 || status >= 500 ? 'retry' : 'failed';
        code = status && Number.isInteger(status) && status >= 100 && status <= 599 ? `HTTP_${status}` : 'TRANSPORT_ERROR';
      }
      const recorded = await finish(outcome, code);
      if (outcome === 'sent' && recorded) totals.sent++; else totals.deferred++;
    }
  }));
  if (workers.some(worker => worker.status === 'rejected')) throw new Error('Push queue unavailable');
  return totals;
}
