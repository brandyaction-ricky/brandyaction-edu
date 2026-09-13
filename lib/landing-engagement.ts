type Engagement = { dwellMs: number; scrollPct: number };
const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;

// Visibility time is measured once for the page, not added across overlapping sections.
export function createEngagementMeter(initial: Partial<Engagement> | null, now: number) {
  let dwellMs = bounded(initial?.dwellMs, 86400000);
  let scrollPct = bounded(initial?.scrollPct, 100);
  let last = now;
  let wasVisible = false;
  return {
    sample(visible: boolean, depth: number, at: number): Engagement {
      if (wasVisible) dwellMs = Math.min(86400000, dwellMs + Math.max(0, at - last));
      if (visible) scrollPct = Math.max(scrollPct, bounded(depth, 100));
      last = at;
      wasVisible = visible;
      return { dwellMs: Math.round(dwellMs), scrollPct };
    },
  };
}
