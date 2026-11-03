export type PersonalizationChoices = { analysis: boolean; overseas: boolean };
export const noPersonalization: PersonalizationChoices = { analysis: false, overseas: false };
export type PersonalizationTerms = {
  version: string; analysis: string; overseas: string;
};
export type PersonalizationSnapshot = {
  choices: PersonalizationChoices; revision: string | null; updatedAt: string | null;
  terms: PersonalizationTerms | null; needsRenewal: boolean; eligible: boolean; accepting: boolean;
};
export function validPersonalizationChoices(value: unknown): value is PersonalizationChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 2 && typeof v.analysis === 'boolean' && typeof v.overseas === 'boolean';
}
