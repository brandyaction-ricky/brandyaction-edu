export const ENTRY_SOURCES = ['paid', 'organic', 'alumni', 'youtube'] as const;

export type EntrySource = (typeof ENTRY_SOURCES)[number];

export function parseEntrySource(value: unknown): EntrySource | null {
  return typeof value === 'string' && ENTRY_SOURCES.some(source => source === value)
    ? value as EntrySource
    : null;
}

export function withEntrySource(href: string, source: EntrySource | null): string {
  if (!source || !href) return href;
  try {
    const url = new URL(href, 'https://brandyaction-edu.com');
    const relative = href.startsWith('/') && !href.startsWith('//');
    if (!relative && !['brandyaction-edu.com', 'www.brandyaction-edu.com', 'brandyaction-edu-dev.vercel.app'].includes(url.hostname)) return href;
    if (!['/checkout', '/apply'].includes(url.pathname)) return href;
    url.searchParams.set('src', source);
    return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return href;
  }
}

export function loginBeforeCheckout(href: string, signedIn: boolean): string {
  if (signedIn || !href.startsWith('/') || href.startsWith('//')) return href;
  try {
    const url = new URL(href, 'https://brandyaction-edu.com');
    if (!['/checkout', '/apply'].includes(url.pathname)) return href;
    return '/login?next=' + encodeURIComponent(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return href;
  }
}
