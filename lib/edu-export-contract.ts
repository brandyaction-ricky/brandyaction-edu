import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './edu_web_contract_v1.schema.json';

export const exportDatasets = ['daily_campaign_perf', 'daily_totals', 'ad_changes', 'ops_daily'] as const;
export type ExportDataset = typeof exportDatasets[number];
const ajv = new Ajv2020({ strict: false, allErrors: false });
addFormats(ajv);
ajv.addSchema(schema, 'edu_web_v1');
const validators = Object.fromEntries(exportDatasets.map(name =>
  [name, ajv.compile({ $ref: 'edu_web_v1#/$defs/response_' + name })]));
const forbiddenKeys = new Set(schema['x-contract-tests'].forbidden_keys.map(key => key.toLowerCase()));
const patterns = schema['x-contract-tests'].forbidden_value_patterns.map(rule => new RegExp(rule.pattern));

/** Keep both privacy lists in the OS contract schema; no second list can drift. */
export function exportPrivacySafe(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value === 'string') return patterns.every(pattern => !pattern.test(value));
  if (Array.isArray(value)) return value.every(exportPrivacySafe);
  if (value && typeof value === 'object') return Object.entries(value).every(([key, child]) =>
    !forbiddenKeys.has(key.toLowerCase()) && exportPrivacySafe(child));
  return true;
}
export function validExport(dataset: ExportDataset, value: unknown): boolean {
  return Boolean(validators[dataset](value)) && exportPrivacySafe(value);
}
export const kstDay = (time: string | number | Date) => new Date(new Date(time).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export function exportRange(from: string | null, to: string | null, now: Date): string[] | null {
  const date = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  if (!date(from) || !date(to) || from! > to! || to! > kstDay(now)) return null;
  const length = (Date.parse(to!) - Date.parse(from!)) / 86400_000 + 1;
  if (length > 31) return null;
  return Array.from({ length }, (_, i) => new Date(Date.parse(from!) + i * 86400_000).toISOString().slice(0, 10));
}
