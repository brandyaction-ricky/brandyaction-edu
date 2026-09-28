export type MessageProgressFilter = { cohortId: string; track: 'daily' | 'learning'; day: number };

export function parseMessageProgressFilter(value: unknown): MessageProgressFilter | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'cohortId,day,track' ||
    typeof row.cohortId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.cohortId) ||
    !['daily', 'learning'].includes(String(row.track)) || typeof row.day !== 'number' || !Number.isInteger(row.day) || row.day < 1 || row.day > 30) return null;
  return { cohortId: row.cohortId.toLowerCase(), track: row.track as MessageProgressFilter['track'], day: row.day };
}
