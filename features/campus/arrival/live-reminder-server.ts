import {createAdminClient} from '@/lib/supabase/admin';
import {arrivalLiveEvent, DEFAULT_ARRIVAL} from './config';
import {arrivalLiveReminderConsentVersion} from './live-reminder-consent';

const reminderTable = 'edu_campus_arrival_live_reminders';
export const arrivalLiveReminderEvent = arrivalLiveEvent(DEFAULT_ARRIVAL);
const devDatabaseUrl = 'https://vjmjhaidlqkmascdjocw.supabase.co';
const productionDatabaseUrl = 'https://qitqxizuwmmlhlcgsrqe.supabase.co';

export const liveReminderPreview = {
  proposedSendAt: new Date(Date.parse(DEFAULT_ARRIVAL.startsAt) - 30 * 60_000).toISOString(),
  liveStartsAt: DEFAULT_ARRIVAL.startsAt,
  message: '[브랜디액션] 오늘 오후 9시 문샷 무료 라이브가 시작됩니다.\n참여 링크는 카카오톡방 공지에서 확인해 주세요.',
};

// CEO 11-20: phone opt-ins are collected on production too. Allowed pairs only: the real production
// site on the production database, or any deployment (fixed DEV, branch preview) on the DEV database.
export function arrivalLiveReminderProduction(env = process.env) {
  const database = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.VERCEL_ENV === 'production'
    && env.NEXT_PUBLIC_APP_ENV === 'production' && database === productionDatabaseUrl;
}

export function arrivalLiveReminderEnabled(env = process.env) {
  return arrivalLiveReminderProduction(env) || (Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
    && env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === devDatabaseUrl);
}

export function arrivalLiveReminderOpen(now = Date.now()) {
  return arrivalLiveReminderEvent.startsAt !== null && now < Date.parse(arrivalLiveReminderEvent.startsAt);
}

export function normalizeArrivalReminderPhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const phone = value.trim().replace(/[\s()-]/g, '').replace(/^\+82(0)?/, '0');
  return /^010[0-9]{8}$/.test(phone) ? phone : null;
}

export async function registerArrivalLiveReminder(phone: string) {
  const db = createAdminClient();
  const eventId = arrivalLiveReminderEvent.id;
  const {data: inserted, error} = await db.from(reminderTable).upsert({
    event_id: eventId,
    phone,
    consent_version: arrivalLiveReminderConsentVersion,
  }, {onConflict:'event_id,phone', ignoreDuplicates:true})
    .select('consent_version').abortSignal(AbortSignal.timeout(8000)).maybeSingle();
  if (error) throw Error('Live reminder could not be saved');
  if (inserted) return;

  const {data: existing, error: readError} = await db.from(reminderTable).select('consent_version')
    .eq('event_id', eventId).eq('phone', phone).abortSignal(AbortSignal.timeout(8000)).maybeSingle();
  if (readError || !existing) throw Error('Live reminder could not be verified');
  if (existing.consent_version === arrivalLiveReminderConsentVersion) return;

  const {data: consented, error: upgradeError} = await db.rpc('edu_refresh_campus_arrival_reminder_consent', {
    p_event: eventId, p_phone: phone, p_consent_version: arrivalLiveReminderConsentVersion,
  }).abortSignal(AbortSignal.timeout(8000));
  if (upgradeError || consented !== true) throw Error('Live reminder consent could not be refreshed');
}

export async function readArrivalLiveReminders() {
  const db = createAdminClient();
  const {data, count, error} = await db.from(reminderTable)
    .select('phone,consented_at', {count:'exact'})
    .eq('event_id', arrivalLiveReminderEvent.id)
    .eq('consent_version', arrivalLiveReminderConsentVersion)
    .order('consented_at', {ascending:false})
    .order('phone')
    .limit(50)
    .abortSignal(AbortSignal.timeout(8000));
  if (error || count === null) throw Error('Live reminders could not be read');
  return {
    count,
    latest: data.map(row => ({
      maskedPhone: `010-****-${row.phone.slice(-4)}`,
      consentedAt: row.consented_at,
    })),
  };
}
