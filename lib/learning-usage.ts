export const usageTypes = ['vod_complete', 'material_download', 'live_join', 'replay_view'] as const;
export type UsageType = typeof usageTypes[number];
export const usageLabels: Record<UsageType, string> = {
  vod_complete: 'VOD 학습 완료', material_download: '자료 제공', live_join: '라이브 입장', replay_view: '다시보기 열람',
};
export type UsageItem = { type: UsageType; id: string; title?: string; available?: boolean; firstUsedAt: string | null; lastUsedAt: string | null; requests: number | null; source: string | null };
export type UsageRow = { enrollmentId: string; courseTitle: string; cohortName: string | null; enrollmentStatus: string; compositionBasis: string; items: UsageItem[]; historicalItems: UsageItem[] };
export type UsageReport = { rows: UsageRow[]; total: number; page: number; pageSize: number };

/** Counts unique configured items, never the number of requests or categories. */
export function learningUsage(items: UsageItem[]) {
  const distinct = new Map(items.map(item => [`${item.type}:${item.id}`, item]));
  const rows = [...distinct.values()];
  const total = rows.length, used = rows.filter(item => Boolean(item.firstUsedAt)).length;
  return { total, used, percent: total ? Math.round(used / total * 1000) / 10 : null,
    atLeastHalf: total ? used * 2 >= total : null,
    byType: usageTypes.map(type => { const group = rows.filter(item => item.type === type); return { type, total: group.length, used: group.filter(item => item.firstUsedAt).length }; }) };
}
