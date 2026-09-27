// Navigation context only: these parameters never establish attribution.
const keys = ['course', 'campaign', 'preset', 'start', 'end', 'compare', 'compare_start', 'compare_end', 'sample_min', 'utm_campaign', 'ad_type', 'adset', 'creative', 'device', 'layout'] as const;
export function recruitmentContext(value: string | null | undefined) {
  return value && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : '';
}
export function marketingContextHref(target: 'conversion' | 'landing', search: string, selection?: { period: string; course: string }) {
  const source = new URLSearchParams(search), query = new URLSearchParams();
  const period = recruitmentContext(selection?.period ?? source.get('recruitment'));
  if (period) query.set('recruitment', period);
  // A different recruitment or product must not inherit another campaign's filters.
  const compatible = !selection || (period === source.get('recruitment') && selection.course === source.get('course'));
  if (compatible) for (const key of keys) for (const value of source.getAll(key).slice(0, 50)) {
    if (value.length <= 200) query.append(key, value);
  }
  if (selection) query.set('course', selection.course);
  return `/admin/${target}${query.size ? '?' + query.toString() : ''}`;
}
