import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Draft used only behind default-OFF source gates. Existing rc.2 references
// must not be replaced until migration, epoch semantics and joint QA are agreed.
export const IDENTITY_PROFILE = 'edu.hmac.v1-draft.1';
export type IdentityEnvironment = 'dev' | 'production';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const epochPattern = /^ce_[A-Za-z0-9_-]{32}$/;
const keyVersionPattern = /^k[1-9][0-9]{0,2}$/;
function invalid(): never { throw new Error('TIPS_IDENTITY_INVALID'); }
function uuid(value: string) { if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(); return value; }
function epoch(value: string) { if (typeof value !== 'string' || !epochPattern.test(value)) invalid(); return value; }
function key(value: Buffer) { if (!Buffer.isBuffer(value) || value.length < 32 || value.length > 64) invalid(); return Buffer.from(value); }
function mac(secret: Buffer, parts: string[]) {
  return createHmac('sha256', secret).update(JSON.stringify(parts), 'utf8').digest('base64url');
}
export function newConsentEpoch(): string { return `ce_${randomBytes(24).toString('base64url')}`; }

export function createEduRecordCandidate(options: { environment: IdentityEnvironment; profile: typeof IDENTITY_PROFILE; recordKey: Buffer }) {
  if (!options || !['dev', 'production'].includes(options.environment) || options.profile !== IDENTITY_PROFILE) invalid();
  const recordKey = key(options.recordKey);
  return Object.freeze({
    eventId(type: 'payment_completed' | 'order_refunded', source: string) {
      if (!['payment_completed', 'order_refunded'].includes(type)) invalid();
      return mac(recordKey, ['edu.event.v1', type, uuid(source)]);
    },
    recordId(kind: 'order' | 'payment' | 'refund', source: string) {
      if (!['order', 'payment', 'refund'].includes(kind)) invalid();
      return mac(recordKey, [`edu.${kind}.v1`, uuid(source)]);
    },
    learningId(member: string, cohort: string, day: string) {
      if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
        || !Number.isFinite(Date.parse(`${day}T00:00:00.000Z`))
        || new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day) invalid();
      return mac(recordKey, ['edu.learning.v1', uuid(member), uuid(cohort), day]);
    },
  });
}

export function createEduIdentityCandidate(options: {
  environment: IdentityEnvironment; profile: typeof IDENTITY_PROFILE;
  customerVersion: string; customerKey: Buffer; recordKey: Buffer;
}) {
  if (!options || !['dev', 'production'].includes(options.environment) || options.profile !== IDENTITY_PROFILE
    || !keyVersionPattern.test(options.customerVersion)) invalid();
  const customerKey = key(options.customerKey), recordKey = key(options.recordKey);
  if (customerKey.length === recordKey.length && timingSafeEqual(customerKey, recordKey)) invalid();
  const version = options.customerVersion;
  return Object.freeze({
    ...createEduRecordCandidate(options),
    customerId(member: string, consentEpoch: string) {
      return `${version}:${mac(customerKey, ['edu.customer.v1', uuid(member), epoch(consentEpoch)])}`;
    },
  });
}
