import {createAdminClient} from '@/lib/supabase/admin';
import {arrivalLiveEvent, DEFAULT_ARRIVAL} from './config';

const reminderTable = 'edu_campus_arrival_live_reminders';
const consentVersion = 1;
const event = arrivalLiveEvent(DEFAULT_ARRIVAL);
const devDatabaseUrl = 'https://vjmjhaidlqkmascdjocw.supabase.co';

export function arrivalLiveReminderEnabled(env = process.env) {
  return env.VERCEL_ENV === 'preview'
    && env.NEXT_PUBLIC_APP_ENV === 'development'
    && env.EDU_CAMPUS_ARRIVAL_REMINDERS_ENABLED === '1'
    && env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === devDatabaseUrl
    && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

export function arrivalLiveReminderOpen(now = Date.now()) {
  return event.startsAt !== null && now < Date.parse(event.startsAt);
}

export function normalizeArrivalReminderPhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const phone = value.trim().replace(/[\s()-]/g, '').replace(/^\+82(0)?/, '0');
  return /^010[0-9]{8}$/.test(phone) ? phone : null;
}

export async function registerArrivalLiveReminder(phone: string) {
  const db = createAdminClient();
  const {error} = await db.from(reminderTable).upsert({
    event_id: event.id,
    phone,
    consent_version: consentVersion,
  }, {onConflict:'event_id,phone', ignoreDuplicates:true}).abortSignal(AbortSignal.timeout(8000));
  if (error) throw Error('Live reminder could not be saved');
}

export async function readArrivalLiveReminders() {
  const db = createAdminClient();
  const {data, count, error} = await db.from(reminderTable)
    .select('phone,consented_at', {count:'exact'})
    .eq('event_id', event.id)
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
