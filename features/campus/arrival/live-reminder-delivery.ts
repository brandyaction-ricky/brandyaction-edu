import {createHmac, randomBytes, randomUUID} from 'node:crypto';
import {loadSmsSettings} from '@/lib/crm-sms-settings';
import {createAdminClient} from '@/lib/supabase/admin';
import {arrivalLiveReminderConsentVersion} from './live-reminder-consent';
import {
  arrivalLiveReminderEvent, arrivalLiveReminderProduction, liveReminderPreview,
} from './live-reminder-server';
import {readPublishedArrival} from './publication-server';

const batchTable = 'edu_campus_arrival_reminder_batches';
const purgeTable = 'edu_campus_arrival_reminder_purges';
const start = Date.parse(liveReminderPreview.liveStartsAt);
const sendAt = Date.parse(liveReminderPreview.proposedSendAt);
// The final cron invocation includes consent submitted just before the live.
const sendUntil = start + 60_000;
const lastScheduledPurge = Date.parse('2026-12-08T08:59:00+09:00');
const {id: eventId} = arrivalLiveReminderEvent;
const solapiOrigin = 'https://api.solapi.com';
const groupId = /^G4V[A-Za-z0-9]{29}$/;

function purgeAt(env = process.env) {
  const date = env.EDU_CAMPUS_ARRIVAL_REMINDER_PURGE_AT || '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(date)) return NaN;
  const time = Date.parse(date);
  return time > sendUntil && time <= lastScheduledPurge ? time : NaN;
}

function sendEnabled(env = process.env) {
  return env.EDU_CAMPUS_ARRIVAL_REMINDER_SEND_ENABLED === 'true'
    && env.CRM_DELIVERY_ENABLED === 'true' && env.CRM_CRON_ENABLED !== 'false';
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

async function solapi(path: string, key: string, secret: string, body?: unknown) {
  const date = new Date().toISOString();
  const salt = randomBytes(20).toString('hex');
  const signature = createHmac('sha256', secret).update(date + salt).digest('hex');
  // The shared SDK retries 503/network failures. A lost POST response can
  // already have been accepted by SOLAPI, so this single POST must not retry.
  const response = await fetch(solapiOrigin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw Error('SOLAPI request result unavailable');
  return await response.json();
}

type BatchUpdate = {
  status: 'accepted' | 'complete' | 'failed' | 'unknown' | 'skipped';
  accepted_count?: number;
  rejected_count?: number;
  delivered_count?: number;
  failed_count?: number;
  provider_group_id?: string | null;
  error_code: 'WINDOW_ENDED' | 'SUBMISSION_UNCONFIRMED' | 'PROVIDER_REJECTED' | 'DELIVERY_FAILED' | null;
};
type Batch = {id: string; provider_group_id: string; accepted_count: number; rejected_count: number};

async function sendBatch(phones: string[], sender: string, key: string, secret: string): Promise<BatchUpdate> {
  try {
    const {groupInfo} = await solapi('/messages/v4/send-many/detail', key, secret, {
      messages: phones.map(to => ({
        to, from: sender, text: liveReminderPreview.message, type: 'LMS', autoTypeDetect: false,
      })),
      allowDuplicates: false,
      showMessageList: false,
    });
    const {registeredSuccess, registeredFailed} = groupInfo?.count ?? {};
    if (!count(registeredSuccess) || !count(registeredFailed)
      || registeredSuccess + registeredFailed !== phones.length
      || (registeredSuccess > 0 && !groupId.test(groupInfo?.groupId ?? ''))) {
      throw Error('SOLAPI submission counts unavailable');
    }
    return {
      status: registeredSuccess ? 'accepted' : 'failed',
      provider_group_id: registeredSuccess ? groupInfo.groupId : null,
      accepted_count: registeredSuccess,
      rejected_count: registeredFailed,
      error_code: registeredFailed ? 'PROVIDER_REJECTED' : null,
    };
  } catch {
    return {status: 'unknown', error_code: 'SUBMISSION_UNCONFIRMED'};
  }
}

async function finish(db: ReturnType<typeof createAdminClient>, id: string, current: 'claimed' | 'accepted', result: BatchUpdate) {
  const {error} = await db.from(batchTable).update(result).eq('id', id).eq('status', current)
    .abortSignal(AbortSignal.timeout(7_000));
  if (error) throw Error('Live reminder result could not be saved');
}

async function readReceipts(db: ReturnType<typeof createAdminClient>, key: string, secret: string) {
  const {data, error} = await db.from(batchTable).select('id,provider_group_id,accepted_count,rejected_count')
    .eq('event_id', eventId).eq('status', 'accepted')
    .order('claimed_at').limit(10).abortSignal(AbortSignal.timeout(7_000));
  if (error) throw Error('Live reminder receipts could not be read');
  const results = await Promise.allSettled(data.map(async (batch: Batch) => {
    const response = await solapi('/messages/v4/groups/' + encodeURIComponent(batch.provider_group_id), key, secret);
    const {sentSuccess, sentFailed} = response?.count ?? {};
    if (!['COMPLETE', 'FAILED'].includes(response?.status)) return;
    if (!count(sentSuccess) || !count(sentFailed) || sentSuccess + sentFailed !== batch.accepted_count) return;
    await finish(db, batch.id, 'accepted', {
      status: 'complete',
      provider_group_id: null,
      delivered_count: sentSuccess,
      failed_count: sentFailed,
      error_code: sentFailed ? 'DELIVERY_FAILED' : batch.rejected_count ? 'PROVIDER_REJECTED' : null,
    });
  }));
  return results.filter(result => result.status === 'rejected').length;
}

export async function runArrivalLiveReminderDelivery(now: () => number = Date.now, recoverPurge = false) {
  if (!arrivalLiveReminderProduction()) return {state: 'disabled'};
  const started = now();
  if (!recoverPurge && new Date(started).getUTCFullYear() !== new Date(start).getUTCFullYear()) return {state: 'disabled'};
  const deleteAt = purgeAt();
  if (!Number.isFinite(deleteAt)) {
    if (sendEnabled()) throw Error('Live reminder deletion time is not configured');
    return {state: 'disabled'};
  }
  // Deletion runs even when sending is stopped or the provider is unavailable.
  if (started >= deleteAt) {
    const {data, error} = await createAdminClient().rpc('edu_purge_campus_arrival_reminders', {
      p_event: eventId, p_consent_version: arrivalLiveReminderConsentVersion,
    })
      .abortSignal(AbortSignal.timeout(15_000));
    if (error) throw Error('Live reminder deletion failed');
    return {state: 'purged', removed: data.removed_count, unclaimed: data.eligible_unsent_count};
  }
  if (recoverPurge || started < sendAt || !sendEnabled()) return {state: 'waiting'};

  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) throw Error('Live reminder provider not configured');
  const db = createAdminClient();
  let numberClaimed = 0;
  let unknown = 0;
  const stale = await db.from(batchTable).update({status: 'unknown', error_code: 'SUBMISSION_UNCONFIRMED'})
    .eq('event_id', eventId).eq('status', 'claimed').lt('claimed_at', new Date(started - 120_000).toISOString())
    .abortSignal(AbortSignal.timeout(7_000));
  if (stale.error) throw Error('Live reminder stale attempts could not be recorded');

  // Process opted-in recipients through the start, with a time budget to leave
  // room for writing the result before Vercel stops the invocation.
  if (started < sendUntil) {
    const [publication, settings] = await Promise.all([readPublishedArrival(), loadSmsSettings()]);
    if (!publication || Date.parse(publication.config.startsAt) !== start) throw Error('Live reminder publication time mismatch');
    if (!settings.transactionalEnabled || !settings.senderPhone) throw Error('Transactional SMS is not enabled');
    for (let batch = 0; batch < 8 && now() < sendUntil && now() - started < 30_000; batch += 1) {
      const id = randomUUID();
      const {data, error} = await db.rpc('edu_claim_campus_arrival_reminders', {
        p_event: eventId,
        p_consent_version: arrivalLiveReminderConsentVersion,
        p_cutoff: new Date(start).toISOString(),
        p_batch: id,
        p_limit: 1_000,
      }).abortSignal(AbortSignal.timeout(7_000));
      if (error) throw Error('Live reminder claim failed');
      if (!data.length) break;
      numberClaimed += data.length;
      const result: BatchUpdate = now() < sendUntil
        ? await sendBatch(data.map((row: {phone: string}) => row.phone), settings.senderPhone, key, secret)
        : {status: 'skipped', error_code: 'WINDOW_ENDED'};
      await finish(db, id, 'claimed', result);
      if (result.status === 'unknown') {unknown += data.length; break;}
    }
  }
  const receiptErrors = now() - started < 30_000 ? await readReceipts(db, key, secret) : 0;
  return {state: 'processed', claimed: numberClaimed, unknown, receiptErrors};
}

export async function readArrivalReminderDeliverySummary(now = Date.now()) {
  if (!arrivalLiveReminderProduction()) return null;
  const deleteAt = purgeAt();
  if (!Number.isFinite(deleteAt)) return null;
  const db = createAdminClient();
  const [batches, cleanup] = await Promise.all([
    db.from(batchTable).select('recipient_count,status,accepted_count,rejected_count,delivered_count,failed_count')
      .eq('event_id', eventId).limit(1_000).abortSignal(AbortSignal.timeout(7_000)),
    db.from(purgeTable).select('purged_at,removed_count,eligible_unsent_count')
      .eq('event_id', eventId).abortSignal(AbortSignal.timeout(7_000)).maybeSingle(),
  ]);
  if (batches.error || cleanup.error) throw Error('Live reminder delivery counts could not be read');
  const totals = {accepted: 0, delivered: 0, failed: 0, pending: 0, unconfirmed: 0, skipped: 0};
  for (const batch of batches.data) {
    totals.accepted += batch.accepted_count;
    totals.delivered += batch.delivered_count;
    totals.failed += batch.rejected_count + batch.failed_count;
    const unresolved = batch.recipient_count - batch.rejected_count - batch.delivered_count - batch.failed_count;
    if (batch.status === 'unknown') totals.unconfirmed += unresolved;
    if (batch.status === 'accepted' || batch.status === 'claimed') totals.pending += unresolved;
    if (batch.status === 'skipped') totals.skipped += batch.recipient_count;
  }
  return {enabled: sendEnabled(), windowClosed: now >= sendUntil, purgeAt: new Date(deleteAt).toISOString(),
    cleanup: cleanup.data, ...totals};
}
