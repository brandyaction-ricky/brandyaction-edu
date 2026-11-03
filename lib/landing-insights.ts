export type RevenueInsight = {
  state: 'ready' | 'unmapped' | 'review' | 'forbidden';
  as_of?: string;
  cohort_id: string | null; cohort_label: string | null;
  orders: number | null; new_orders: number | null; existing_orders: number | null;
  gross: number | null; refunds: number | null; net: number | null;
  spend: number | null; roas: number | null; needs_review: number;
};
export type SectionInsight = { section: string; reached: number; not_continued: number | null; avg_dwell_ms: number | null };
export type VersionInsight = {
  layout_ver: number; created_at: string; note: string; sessions: number; cta_sessions: number;
  first_seen: string | null; last_seen: string | null; sections: SectionInsight[];
};
export type LandingInsights = {
  revenue: RevenueInsight;
  behavior: {
    sessions: number; measured_sessions: number;
    scroll: { depth: number; reached: number; not_continued: number | null }[];
    versions: VersionInsight[];
  };
};
export const insightRate = (value: number | null | undefined, total: number) => value == null || total <= 0 ? null : value / total * 100;
export function versionDifference(a: VersionInsight | undefined, b: VersionInsight | undefined) {
  const x = a ? insightRate(a.cta_sessions, a.sessions) : null;
  const y = b ? insightRate(b.cta_sessions, b.sessions) : null;
  return x == null || y == null ? null : y - x;
}
