import type { AdminNavigationItem } from '../navigation/admin-navigation';

export type AdminNavigationGroup = readonly [string, readonly string[]];

/**
 * Presentation-only menu filtering. The server remains authoritative for every
 * request; this helper never grants access and only hides unavailable links.
 */
export function createAdminMenuVisibility(items: AdminNavigationItem[]) {
  const visibleKeys = new Set(items.map(item => item.key));
  return {
    has: (key: string) => key === 'overview' || visibleKeys.has(key),
    groups: (groups: readonly AdminNavigationGroup[]) =>
      groups.filter(([, keys]) => keys.some(key => visibleKeys.has(key))),
  };
}
