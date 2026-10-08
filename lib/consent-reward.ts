import type { PersonalizationTerms } from './personalization-consent';
export type RewardChoices = { analysis: boolean; overseas: boolean; kakao: boolean };
export const noRewardChoices: RewardChoices = { analysis: false, overseas: false, kakao: false };
export type RewardSnapshot = {
  available: boolean; handled: boolean; awarded: boolean; analysisAvailable: boolean;
  personalRevision: string | null; marketingRevision: string | null;
  terms: PersonalizationTerms | null; reward: { days: number; minimum: number };
};
export type RewardPayload = {
  choices: RewardChoices; personalRevision: string | null; marketingRevision: string | null;
  wordingVersion: string | null; marketingVersion: string;
};
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v);
export function validRewardRequest(value: unknown): value is { requestId: string; payload: RewardPayload } {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>, p = b.payload as Partial<RewardPayload> | undefined;
  return uuid(b.requestId) && !!p && Object.keys(p).length === 5 &&
    (p.personalRevision === null || uuid(p.personalRevision)) && (p.marketingRevision === null || uuid(p.marketingRevision)) &&
    (p.wordingVersion === null || (typeof p.wordingVersion === 'string' && p.wordingVersion.length <= 100)) &&
    p.marketingVersion === '2026-10-20' && !!p.choices && Object.keys(p.choices).length === 3 &&
    Object.keys(noRewardChoices).every(k => typeof p.choices![k as keyof RewardChoices] === 'boolean') && Object.values(p.choices).some(Boolean);
}
