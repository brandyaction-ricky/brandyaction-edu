export const VISIT_INTERVAL_MS = 5 * 60_000;
export const koreanDay = (now = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
export function visitDay(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export type MemberVisit = { member: string; name: string; phone: string | null; day: string; firstSeen: string; lastSeen: string };
export type MemberVisitsResult = { rows: MemberVisit[]; total: number; page: number; pageSize: number; day: string | null; asOf: string };
