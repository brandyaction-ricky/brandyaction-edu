import type { Row } from './platform';

/** Discovery only. Never use this flag to grant/revoke access, enrollment or payment. */
export function isProductListed(course?: Row) {
  const metadata = course?.metadata;
  return !metadata || typeof metadata !== 'object' || Array.isArray(metadata) || (metadata as Record<string, unknown>).is_listed !== false;
}

export function listedProducts(courses: Row[]) {
  return courses.filter(isProductListed);
}

/** Explicit product links in managed home banners must follow the same discovery rule. */
export function isListedProductLink(href: unknown, courses: Row[], origin: string) {
  if (typeof href !== 'string' || !href) return true;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return true;
    const match = /^\/classes\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return true;
    const key = decodeURIComponent(match[1]);
    const course = courses.find(item => item.slug === key || item.id === key);
    return !course || isProductListed(course);
  } catch { return true; }
}
