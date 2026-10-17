import type { ConsentSnapshot } from './optional-consent';
import type { PersonalizationSnapshot } from './personalization-consent';
import type { MetaPurchaseSnapshot } from './meta-purchase-consent';
import type { RewardSnapshot } from './consent-reward';

export const WELCOME_CONSENT_COPY = 'edu-welcome-e-20261017';
export type WelcomeChoices = { email: boolean; kakao: boolean; analysis: boolean; overseas: boolean; meta: boolean };
export const noWelcomeChoices: WelcomeChoices = { email: false, kakao: false, analysis: false, overseas: false, meta: false };
export type ConsentScope = 'welcome' | 'dismiss' | 'marketing' | 'analysis' | 'overseas' | 'meta';
export type WelcomeSnapshot = {
  marketing: ConsentSnapshot; personal: PersonalizationSnapshot; meta: MetaPurchaseSnapshot;
  reward: RewardSnapshot; promptedAt: string | null; handled: boolean;
  accepting: { marketing: boolean; personal: boolean; meta: boolean };
};
export type WelcomeRequest = {
  requestId: string; copyVersion: typeof WELCOME_CONSENT_COPY; scope: ConsentScope; choices: WelcomeChoices;
  expected: { marketing: string | null; personal: string | null; meta: string | null };
  versions: { personal: string | null; meta: string | null };
};
export function welcomeChoices(s: WelcomeSnapshot): WelcomeChoices {
  return { email: s.marketing.choices.email, kakao: s.marketing.choices.kakao,
    analysis: s.personal.activeChoices?.analysis ?? (!s.personal.needsRenewal && s.personal.choices.analysis),
    overseas: s.personal.activeChoices?.overseas ?? (!s.personal.needsRenewal && s.personal.choices.overseas), meta: s.meta.active };
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const uuid = (x: unknown) => typeof x === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(x);
const revision = (x: unknown) => x === null || uuid(x);
export function validWelcomeRequest(x: unknown): x is WelcomeRequest {
  if (!record(x) || Object.keys(x).length !== 6 || !uuid(x.requestId) || x.copyVersion !== WELCOME_CONSENT_COPY ||
    !['welcome','dismiss','marketing','analysis','overseas','meta'].includes(String(x.scope)) ||
    !record(x.choices) || Object.keys(x.choices).length !== 5 || !record(x.expected) || Object.keys(x.expected).length !== 3 ||
    !record(x.versions) || Object.keys(x.versions).length !== 2) return false;
  return Object.keys(noWelcomeChoices).every(k => typeof (x.choices as Record<string,unknown>)[k] === 'boolean') &&
    ['marketing','personal','meta'].every(k => revision((x.expected as Record<string,unknown>)[k])) &&
    ['personal','meta'].every(k => { const v = (x.versions as Record<string,unknown>)[k]; return v === null || typeof v === 'string' && v.length > 0 && v.length <= 100; });
}
