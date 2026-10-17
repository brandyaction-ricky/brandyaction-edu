export type MetaPurchaseTerms = {
  version: string; recipient: string; country: string; items: string; purpose: string;
  transfer: string; retention: string; refusal: string; contact: string;
};
export type MetaPurchaseSnapshot = {
  consented: boolean; active: boolean; needsRenewal: boolean;
  revision: string | null; updatedAt: string | null; terms: MetaPurchaseTerms | null;
};
export type MetaPurchaseRequest = {
  requestId: string; expectedRevision: string | null; consented: boolean;
  wordingVersion: string | null; surface: 'signup' | 'profile';
};
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
export function validMetaPurchaseRequest(value: unknown): value is MetaPurchaseRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 5 && uuid(body.requestId) &&
    (body.expectedRevision === null || uuid(body.expectedRevision)) && typeof body.consented === 'boolean' &&
    (body.wordingVersion === null || (typeof body.wordingVersion === 'string' && body.wordingVersion.length > 0 && body.wordingVersion.length <= 100)) &&
    (body.surface === 'signup' || body.surface === 'profile');
}
